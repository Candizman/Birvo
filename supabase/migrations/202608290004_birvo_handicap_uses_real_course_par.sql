-- Handicaps must be calculated against the course's real par.
--
-- Written 2026-08-29, after reading Hidden Valley's actual handicap spreadsheet.
--
-- THE BUG
--
-- Every handicap calculation subtracted a hardcoded 36:
--
--   greatest(0, round(((avg(gross_score)) - 36) * 0.8, 1))
--
-- 36 is the par of a nine-hole course. Hidden Valley is nine holes, so the
-- number was right for them and the mistake was invisible. But
-- initialize_course_layout seeds an eighteen-hole course whose pars sum to 72,
-- and save_score_batch accepts any layout of 9 or 18 holes.
--
-- On an eighteen-hole course a gross of 90 produced a handicap of 43.2 instead
-- of 14.4 — three times too high. It did not raise, because teams.current_handicap
-- allows anything from -10 to 54, so the number was simply wrong until a gross
-- above roughly 103 finally broke the constraint.
--
-- Most US courses are eighteen holes. This would have shipped as silent
-- nonsense for nearly every customer other than the pilot.
--
-- THE FIX
--
-- course_par() sums the pars of the course's Main Course layout, falling back to
-- 36 when a course has no layout yet so behaviour matches the old constant
-- rather than turning into null. calculate_team_handicap() applies the league
-- formula against that par and clamps to the column's 0..54 range.
--
-- The five call sites — save_score_batch, submit_player_gross_score,
-- submit_player_hole_scorecard, review_score_correction and resolve_score — now
-- all route through the helper, so the formula lives in exactly one place.
--
-- Verified: nine holes, gross 45 -> 7.2 (matching Hidden Valley's spreadsheet
-- cell (B6-36)*0.8 exactly); eighteen holes, gross 90 -> 14.4.
begin;

create or replace function public.course_par(p_course_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(sum(par), 0), 36)::integer
  from public.course_holes
  where course_id = p_course_id and layout_name = 'Main Course'
$$;

create or replace function public.calculate_team_handicap(
  p_team_id uuid,
  p_through_week integer default null
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select least(54, greatest(0, round((
    (
      select avg(s.gross_score)::numeric
      from public.scores s
      join public.matches m on m.id = s.match_id
      where s.team_id = p_team_id
        and s.reconciliation_status <> 'needs_review'
        and (p_through_week is null or m.week_number <= p_through_week)
    ) - public.course_par((select course_id from public.teams where id = p_team_id))
  ) * 0.8, 1)))
$$;

-- Both helpers are internal to the scoring functions, which are SECURITY DEFINER
-- and run as the owner. No client role needs to call them.
revoke execute on function public.course_par(uuid) from public, anon, authenticated;
revoke execute on function public.calculate_team_handicap(uuid, integer) from public, anon, authenticated;

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
as $$
declare
  actor_id uuid := (select auth.uid());
  target_match public.matches;
  item jsonb;
  target_team public.teams;
  target_team_id uuid;
  gross integer;
  existing_score public.scores;
  saved_score_id uuid;
  new_handicap numeric(4,1);
  saved_count integer := 0;
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
      gross := (item->>'grossScore')::integer;
    exception when others then raise exception 'Invalid team ID or gross score'; end;
    if gross not between 1 and 200 then raise exception 'Gross score must be between 1 and 200'; end if;
    select * into target_team from public.teams
      where id=target_team_id and course_id=p_course_id and league_id=p_league_id and status='active' for update;
    if not found then raise exception 'Invalid or inactive team'; end if;
    select * into existing_score from public.scores where match_id=target_match.id and team_id=target_team.id;

    insert into public.scores(
      course_id,match_id,team_id,gross_score,handicap_used,net_score,modified_by_user_id
    ) values(
      p_course_id,target_match.id,target_team.id,gross,target_team.current_handicap,
      gross-target_team.current_handicap,actor_id
    ) on conflict(match_id,team_id) do update set
      gross_score=excluded.gross_score,
      net_score=excluded.gross_score-public.scores.handicap_used,
      modified_by_user_id=actor_id,
      updated_at=now()
    returning id into saved_score_id;

    if existing_score.id is not null and existing_score.gross_score is distinct from gross then
      insert into public.score_audit_logs(course_id,score_id,old_gross,new_gross,reason,modified_by_user_id)
      values(p_course_id,saved_score_id,existing_score.gross_score,gross,'Administrative score correction before round lock',actor_id);
    end if;

    new_handicap := public.calculate_team_handicap(target_team.id, p_week_number);
    update public.teams set current_handicap=coalesce(new_handicap,0),updated_at=now() where id=target_team.id;
    saved_count := saved_count+1;
  end loop;

  return jsonb_build_object('matchId',target_match.id,'savedCount',saved_count);
end $$;

grant execute on function public.save_score_batch(uuid,uuid,integer,jsonb) to authenticated;

-- The remaining four callers are long and otherwise unchanged, so their existing
-- definitions are patched in place. Each replacement is asserted: if the expected
-- expression is not found, or any hardcoded par survives, this migration fails
-- rather than leaving a function half-corrected.
do $outer$
declare
  def text;
  patched text;
  replacements text[][] := array[
    array[
      'select least(54,greatest(0,round(((avg(s.gross_score)::numeric)-36)*0.8,1)))
    into recalculated_handicap
    from public.scores s join public.matches m on m.id=s.match_id
    where s.team_id=target_team.id and m.week_number<=target_league.current_week
      and s.reconciliation_status<>''needs_review'';',
      'recalculated_handicap := public.calculate_team_handicap(target_team.id, target_league.current_week);'
    ],
    array[
      'select greatest(0,round(((avg(s.gross_score)::numeric)-36)*0.8,1)) into recalculated_handicap
      from public.scores s where s.team_id=request_record.team_id and s.reconciliation_status<>''needs_review'';',
      'recalculated_handicap := public.calculate_team_handicap(request_record.team_id, null);'
    ],
    array[
      'select greatest(0, round(((avg(s.gross_score)::numeric) - 36) * 0.8, 1)) into new_handicap
  from public.scores s
  join public.matches m on m.id = s.match_id
  where s.team_id = target_score.team_id
    and m.week_number <= target_match.week_number
    and s.reconciliation_status <> ''needs_review'';',
      'new_handicap := public.calculate_team_handicap(target_score.team_id, target_match.week_number);'
    ]
  ];
  target regprocedure;
  pair text[];
begin
  foreach target in array array[
    'public.submit_player_gross_score(uuid,integer)'::regprocedure,
    'public.submit_player_hole_scorecard(uuid,uuid,jsonb,text)'::regprocedure,
    'public.review_score_correction(uuid,uuid,text,text)'::regprocedure,
    'public.resolve_score(uuid,uuid,uuid,numeric,integer,integer)'::regprocedure
  ] loop
    def := pg_get_functiondef(target);
    patched := def;
    foreach pair slice 1 in array replacements loop
      patched := replace(patched, pair[1], pair[2]);
    end loop;
    if patched = def then
      raise exception 'No handicap expression replaced in %', target;
    end if;
    if patched like '%-36)*0.8%' or patched like '%- 36) * 0.8%' then
      raise exception 'A hardcoded par-36 handicap remains in %', target;
    end if;
    execute patched;
  end loop;
end $outer$;

update public.app_metadata set schema_version=14,
  migration_name='202608290004_birvo_handicap_uses_real_course_par',updated_at=now()
  where key='database';

commit;
