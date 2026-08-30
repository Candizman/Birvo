-- A league picks how its handicaps are calculated.
--
-- Written 2026-08-30, after replaying a full 18-week season under three methods.
--
-- WHY
--
-- Birvo computed a handicap as (average of every round - par) x 0.8. That is
-- simple and it is what Hidden Valley's spreadsheet does, but averaging every
-- round has three consequences a league will notice:
--
--   * One blow-up round permanently inflates a handicap. Measured on a steady
--     88-91 golfer: a single 108 moved them 13.9 -> 15.5.
--   * It is slow to recognise improvement. A player who went 96 down to 82 over
--     ten weeks still showed 13.6, because the old 96s never stop counting.
--   * It can be gamed. Five deliberately bad cards before the championship bought
--     6.4 strokes of extra handicap. Under WHS the same five cards buy 0.2.
--
-- A handicap is meant to describe potential, not average performance, which is
-- why every serious system averages a golfer's *best* differentials rather than
-- all of them.
--
-- THE THREE METHODS
--
--   league_average  what Birvo did before: the running average of every round.
--                   Kept so a season already in progress is never re-scored, and
--                   for leagues whose members expect their old spreadsheet.
--
--   best_of         the average of the best half of the last ten rounds. This is
--                   the shape most league software uses -- golfleague.us, for
--                   instance, takes the lowest ten of the last twenty. Needs only
--                   a gross score, so it works on any course, rated or not.
--
--   whs             the World Handicap System: score differentials against the
--                   tee's Course Rating and Slope, averaged over the lowest N of
--                   the last twenty per Rule 5.2a, then converted back to a course
--                   handicap. The global standard since 2020, and the one a golfer
--                   will recognise. Requires an accurate Course Rating and Slope.
--
-- All three then apply the league's allowance -- 80% by default, the figure
-- Hidden Valley already uses -- at the playing-handicap step. WHS separates
-- Handicap Index from Playing Handicap for exactly this reason: the index
-- describes the golfer, the allowance is the competition's choice.
--
-- WHAT THIS DOES NOT FIX
--
-- Every team starts at whatever handicap the roster gives it, so a roster of
-- zeros makes week 1 scratch play. Measured across the pilot season, the net
-- spread in week 1 was 26.0 strokes against 8.6-11.8 in every later week -- and
-- it was identical under all three methods. That is a data problem, not a formula
-- problem: seed real starting handicaps in the roster import.
begin;

alter table public.leagues
  add column handicap_method text not null default 'whs'
    check (handicap_method in ('league_average','best_of','whs')),
  add column handicap_allowance_percent smallint not null default 80
    check (handicap_allowance_percent between 50 and 100),
  add column tee_box_id uuid references public.course_tee_boxes(id) on delete set null;

-- Leagues that already exist keep scoring exactly as they did. Changing the
-- method under a season in progress would rewrite its history.
update public.leagues set handicap_method = 'league_average' where created_at < now();

-- The rating and slope a league plays off. Falls back to the longest rated tee
-- when the league has not picked one.
create or replace function public.league_rating(p_league_id uuid)
returns table(course_rating numeric, slope_rating integer, par integer)
language sql
stable
security definer
set search_path = ''
as $$
  with l as (
    select id, course_id, tee_box_id from public.leagues where id = p_league_id
  ),
  chosen as (
    select t.course_rating, t.slope_rating
    from public.course_tee_boxes t, l
    where t.id = l.tee_box_id
    union all
    select t.course_rating, t.slope_rating
    from public.course_tee_boxes t, l
    where l.tee_box_id is null and t.course_id = l.course_id
    order by 1 desc
    limit 1
  )
  select
    coalesce((select c.course_rating from chosen c), public.course_par((select course_id from l))::numeric),
    coalesce((select c.slope_rating from chosen c), 113),
    public.course_par((select course_id from l))
$$;

-- WHS Rule 5.2a: how many of the lowest differentials count, and the adjustment
-- applied while a scoring record is still filling out. Verified against the
-- published table: 3 -> lowest 1 less 2.0, 4 -> lowest 1 less 1.0, 5 -> lowest 1,
-- 6 -> lowest 2 less 1.0, 7-8 -> lowest 2, 9-11 -> 3, 12-14 -> 4, 15-16 -> 5,
-- 17-18 -> 6, 19 -> 7, 20 -> lowest 8.
create or replace function public.whs_index_from_differentials(p_differentials numeric[])
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  n integer := coalesce(array_length(p_differentials, 1), 0);
  sorted numeric[];
  used integer;
  adjustment numeric := 0;
  total numeric := 0;
  i integer;
begin
  if n = 0 then return null; end if;

  select array_agg(d order by d) into sorted from unnest(p_differentials) d;

  if    n <= 3  then used := 1; adjustment := 2.0;
  elsif n = 4   then used := 1; adjustment := 1.0;
  elsif n = 5   then used := 1;
  elsif n = 6   then used := 2; adjustment := 1.0;
  elsif n <= 8  then used := 2;
  elsif n <= 11 then used := 3;
  elsif n <= 14 then used := 4;
  elsif n <= 16 then used := 5;
  elsif n <= 18 then used := 6;
  elsif n = 19  then used := 7;
  else               used := 8;
  end if;

  for i in 1..used loop
    total := total + sorted[i];
  end loop;

  return round(total / used - adjustment, 1);
end $$;

create or replace function public.calculate_team_handicap(
  p_team_id uuid,
  p_through_week integer default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  league_id uuid;
  course_id uuid;
  method text;
  allowance numeric;
  rating numeric;
  slope integer;
  par integer;
  gross_scores integer[];
  n integer;
  differentials numeric[];
  index_value numeric;
  raw numeric;
  window_size integer;
  take integer;
begin
  select t.league_id, t.course_id into league_id, course_id
  from public.teams t where t.id = p_team_id;
  if league_id is null then return null; end if;

  select l.handicap_method, l.handicap_allowance_percent / 100.0
    into method, allowance
  from public.leagues l where l.id = league_id;

  select r.course_rating, r.slope_rating, r.par into rating, slope, par
  from public.league_rating(league_id) r;

  -- A rating that does not match the holes actually played (an 18-hole rating on
  -- a nine-hole layout, say) would distort every differential. Fall back to par.
  if rating is null or abs(rating - par) > 10 then
    rating := par;
    slope := 113;
  end if;

  select array_agg(s.gross_score order by m.week_number)
    into gross_scores
  from public.scores s
  join public.matches m on m.id = s.match_id
  where s.team_id = p_team_id
    and s.reconciliation_status <> 'needs_review'
    and (p_through_week is null or m.week_number <= p_through_week);

  n := coalesce(array_length(gross_scores, 1), 0);
  if n = 0 then return null; end if;

  if method = 'whs' then
    select array_agg(round((113.0 / slope) * (g - rating), 1))
      into differentials
    from unnest(gross_scores[greatest(1, n - 19):n]) g;
    index_value := public.whs_index_from_differentials(differentials);
    if index_value is null then return null; end if;
    raw := (index_value * slope / 113.0 + (rating - par)) * allowance;

  elsif method = 'best_of' then
    window_size := least(n, 10);
    take := greatest(1, ceil(window_size / 2.0)::integer);
    select avg(g) into raw
    from (
      select g from unnest(gross_scores[greatest(1, n - window_size + 1):n]) g
      order by g limit take
    ) best;
    raw := (raw - par) * allowance;

  else -- league_average: the running average of every round played
    select avg(g) into raw from unnest(gross_scores) g;
    raw := (raw - par) * allowance;
  end if;

  return least(54, greatest(0, round(raw, 1)));
end $$;

-- These are internals of the SECURITY DEFINER scoring functions. No client role
-- calls them directly.
revoke execute on function public.league_rating(uuid) from public, anon, authenticated;
revoke execute on function public.whs_index_from_differentials(numeric[]) from public, anon, authenticated;
revoke execute on function public.calculate_team_handicap(uuid, integer) from public, anon, authenticated;

update public.app_metadata set schema_version=17,
  migration_name='202608300002_birvo_selectable_handicap_method',updated_at=now()
  where key='database';

commit;
