-- A substitute can post a score.
--
-- WHY
--
-- `substitutes` was a pool table -- name, handicap, phone, email -- and nothing
-- else in the database referred to it. There was no way to record that a sub had
-- played, so a team short a player either did not post a card at all or posted
-- one under their own handicap as though nothing had happened. Neither is what
-- happened on the course.
--
-- WHAT CAN HONESTLY BE MODELLED
--
-- Birvo is team-level. A team has one name, one handicap and one PIN; there is no
-- table of individual golfers, and player_profiles is one row per team rather than
-- a roster. So "a sub stands in for one of the two golfers" cannot be represented
-- -- the database does not know the two golfers exist separately.
--
-- What is true, and is now recorded, is narrower and more useful: this team's card
-- this week was played with a substitute. That gives three consequences.
--
--   The card counts for the league. The team fielded a player, which is the whole
--   point of having substitutes, so the round earns its points as normal.
--
--   The card does not describe the team. A different person swung the club, so the
--   round is left out of the team's handicap -- the same reasoning that keeps
--   ghost scores out of it. Without this a strong sub would quietly cut the team's
--   handicap for the rest of the season, and a weak one would inflate it.
--
--   The card is played off a substitute handicap, below.
--
-- THE HANDICAP A SUBSTITUTE PLAYS OFF
--
-- The lower of the substitute's own handicap and the team's. This is the ordinary
-- anti-ringer rule: a team cannot gain by bringing in a better player than the one
-- missing, and cannot inflate its allowance by bringing in a worse one.
--
-- A team with no scoring record of its own has no handicap to cap against -- week
-- one, or a team that has only ever been a ghost -- so there the substitute simply
-- plays off their own. Capping against a team handicap of zero would put them
-- round scratch, which is the cold-start problem 202608300004 exists to avoid.
--
-- Note this treats substitutes.handicap as a playing handicap for this league, the
-- same kind of number as teams.current_handicap, because that is the only reading
-- under which the comparison between them means anything.
begin;

alter table public.scores
  add column substitute_id uuid references public.substitutes(id) on delete set null;

create index scores_substitute_id_idx on public.scores(substitute_id)
  where substitute_id is not null;

comment on column public.scores.substitute_id is
  'The substitute who played this card, when the team was short. Such a round scores for the league but is excluded from the team''s handicap, because a different person played it.';

-- Rounds a team actually played themselves. Ghost rounds are the field average
-- standing in for an absent team; substitute rounds were played by someone else.
-- Neither describes this team's ability, and neither belongs in its handicap.
create or replace function public.calculate_team_handicap(
  p_team_id uuid,
  p_through_week integer default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $fn$
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
    and not s.is_ghost
    and s.substitute_id is null
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

  else
    select avg(g) into raw from unnest(gross_scores) g;
    raw := (raw - par) * allowance;
  end if;

  return least(54, greatest(0, round(raw, 1)));
end $fn$;

revoke execute on function public.calculate_team_handicap(uuid, integer) from public, anon, authenticated;

-- A substitute's card carries its own handicap, set when it was entered, and a
-- round somebody else played never establishes this team's first handicap.
create or replace function public.apply_provisional_handicap(p_score_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  target public.scores;
  this_week integer;
  earlier integer;
  provisional numeric;
begin
  select * into target from public.scores where id = p_score_id;
  if not found or target.is_ghost or target.substitute_id is not null then return; end if;

  select m.week_number into this_week from public.matches m where m.id = target.match_id;

  select count(*) into earlier
  from public.scores s
  join public.matches m on m.id = s.match_id
  where s.team_id = target.team_id
    and not s.is_ghost
    and s.substitute_id is null
    and m.league_id = (select league_id from public.matches where id = target.match_id)
    and m.week_number < this_week;

  if earlier > 0 then return; end if;

  provisional := public.calculate_team_handicap(target.team_id, this_week);
  if provisional is null then return; end if;

  update public.scores
  set handicap_used = provisional,
      net_score = target.gross_score - provisional,
      updated_at = now()
  where id = p_score_id;
end $fn$;

revoke execute on function public.apply_provisional_handicap(uuid) from public, anon, authenticated;

-- The handicap a substitute plays off: the lower of their own and the team's, and
-- simply their own when the team has no record to cap against.
create or replace function public.substitute_playing_handicap(
  p_substitute_id uuid,
  p_team_id uuid
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  sub_handicap numeric;
  team_handicap numeric;
  team_rounds integer;
begin
  select handicap into sub_handicap from public.substitutes where id = p_substitute_id;
  if sub_handicap is null then return null; end if;

  select count(*) into team_rounds
  from public.scores s
  where s.team_id = p_team_id and not s.is_ghost and s.substitute_id is null;

  if team_rounds = 0 then
    return least(54, greatest(0, round(sub_handicap, 1)));
  end if;

  select current_handicap into team_handicap from public.teams where id = p_team_id;
  return least(54, greatest(0, round(least(sub_handicap, coalesce(team_handicap, sub_handicap)), 1)));
end $fn$;

revoke execute on function public.substitute_playing_handicap(uuid,uuid) from public, anon, authenticated;

create or replace function public.save_score_batch(
  p_course_id uuid,
  p_league_id uuid,
  p_week_number integer,
  p_scores jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $fn$
declare
  actor_id uuid := (select auth.uid());
  target_match public.matches;
  item jsonb;
  target_team public.teams;
  target_team_id uuid;
  substitute_id uuid;
  substitute_handicap numeric;
  entry_handicap numeric;
  gross integer;
  stated_gross integer;
  holes jsonb;
  existing_score public.scores;
  saved_score_id uuid;
  new_handicap numeric(4,1);
  saved_count integer := 0;
  hole_cards integer := 0;
  substitute_cards integer := 0;
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin','assistant_admin','scorekeeper']) then raise exception 'Scoring access required'; end if;
  if not exists(select 1 from public.leagues where id=p_league_id and course_id=p_course_id and status='active') then raise exception 'Active league not found'; end if;
  if p_week_number not between 1 and 52 or jsonb_typeof(p_scores)<>'array' or jsonb_array_length(p_scores) not between 1 and 500 then raise exception 'Invalid score batch'; end if;
  if (select count(*) from jsonb_array_elements(p_scores))<>(select count(distinct value->>'teamId') from jsonb_array_elements(p_scores)) then raise exception 'Duplicate team in score batch'; end if;

  if not exists(
    select 1 from (
      select count(*) as hole_count,count(distinct stroke_index) as stroke_count
      from public.course_holes where course_id=p_course_id
    ) layout where layout.hole_count in (9,18) and layout.stroke_count=layout.hole_count
  ) then raise exception 'A complete course layout is required before scoring'; end if;
  if not exists(select 1 from public.course_tee_boxes where course_id=p_course_id) then raise exception 'A rated tee box is required before scoring'; end if;
  if (select count(*) from public.teams where course_id=p_course_id and league_id=p_league_id and status='active')<2 then
    raise exception 'At least two active teams are required before scoring';
  end if;

  select * into target_match from public.matches where league_id=p_league_id and week_number=p_week_number for update;
  if not found or target_match.status in ('cancelled','rained_out') then raise exception 'The round must be scheduled before scoring'; end if;
  if target_match.locked_at is not null or target_match.status='locked' then raise exception 'This round is locked'; end if;

  for item in select value from jsonb_array_elements(p_scores) loop
    begin
      target_team_id := (item->>'teamId')::uuid;
      stated_gross := nullif(item->>'grossScore','')::integer;
      substitute_id := nullif(item->>'substituteId','')::uuid;
    exception when others then raise exception 'Invalid team ID, gross score or substitute'; end;

    holes := case when jsonb_typeof(item->'holes') = 'array' then item->'holes' else null end;
    if holes is null and stated_gross is null then
      raise exception 'Each entry needs either a gross score or a hole-by-hole card';
    end if;

    if holes is not null then
      gross := public.hole_card_total(p_course_id, holes);
      if stated_gross is not null and stated_gross <> gross then
        raise exception 'The total entered (%) does not match the holes entered (%)', stated_gross, gross;
      end if;
    else
      gross := stated_gross;
    end if;
    if gross not between 1 and 200 then raise exception 'Gross score must be between 1 and 200'; end if;

    select * into target_team from public.teams
      where id=target_team_id and course_id=p_course_id and league_id=p_league_id and status='active' for update;
    if not found then raise exception 'Invalid or inactive team'; end if;

    -- A substitute belongs to one league. Accepting one from another league would
    -- let a card be scored against a handicap set somewhere else entirely.
    if substitute_id is not null then
      select public.substitute_playing_handicap(substitute_id, target_team.id)
        into substitute_handicap;
      if substitute_handicap is null or not exists(
        select 1 from public.substitutes
        where id=substitute_id and course_id=p_course_id and league_id=p_league_id
      ) then raise exception 'Unknown substitute for this league'; end if;
      entry_handicap := substitute_handicap;
      substitute_cards := substitute_cards + 1;
    else
      entry_handicap := target_team.current_handicap;
    end if;

    select * into existing_score from public.scores where match_id=target_match.id and team_id=target_team.id;

    insert into public.scores(
      course_id,match_id,team_id,gross_score,handicap_used,net_score,
      attestation_status,substitute_id,modified_by_user_id
    ) values(
      p_course_id,target_match.id,target_team.id,gross,entry_handicap,
      gross-entry_handicap,'approved',substitute_id,actor_id
    ) on conflict(match_id,team_id) do update set
      gross_score=excluded.gross_score,
      -- A card switching to or from a substitute is a different player, so the
      -- handicap snapshot is retaken rather than preserved.
      handicap_used=case
        when public.scores.substitute_id is distinct from excluded.substitute_id
        then excluded.handicap_used else public.scores.handicap_used end,
      net_score=excluded.gross_score-case
        when public.scores.substitute_id is distinct from excluded.substitute_id
        then excluded.handicap_used else public.scores.handicap_used end,
      substitute_id=excluded.substitute_id,
      attestation_status='approved',
      modified_by_user_id=actor_id,
      updated_at=now()
    returning id into saved_score_id;

    if holes is not null then
      delete from public.score_hole_details where score_id = saved_score_id;
      insert into public.score_hole_details(course_id, score_id, hole_number, gross_score)
      select p_course_id, saved_score_id,
             (value->>'holeNumber')::smallint, (value->>'grossScore')::smallint
      from jsonb_array_elements(holes);
      hole_cards := hole_cards + 1;
    elsif existing_score.id is not null and existing_score.gross_score is distinct from gross then
      delete from public.score_hole_details where score_id = saved_score_id;
    end if;

    if existing_score.id is not null and existing_score.gross_score is distinct from gross then
      insert into public.score_audit_logs(course_id,score_id,old_gross,new_gross,reason,modified_by_user_id)
      values(p_course_id,saved_score_id,existing_score.gross_score,gross,'Administrative score correction before round lock',actor_id);
    end if;

    new_handicap := public.calculate_team_handicap(target_team.id, p_week_number);
    if new_handicap is not null then
      update public.teams set current_handicap=new_handicap,updated_at=now() where id=target_team.id;
    end if;

    perform public.apply_provisional_handicap(saved_score_id);
    saved_count := saved_count+1;
  end loop;

  return jsonb_build_object('matchId',target_match.id,'savedCount',saved_count,
    'holeCardCount',hole_cards,'substituteCardCount',substitute_cards);
end $fn$;

grant execute on function public.save_score_batch(uuid,uuid,integer,jsonb) to authenticated;

update public.app_metadata set schema_version=23,
  migration_name='202608300008_birvo_substitutes_can_post_a_score',updated_at=now()
  where key='database';

commit;
