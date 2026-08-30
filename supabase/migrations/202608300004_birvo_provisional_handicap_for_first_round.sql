-- A team's first round is played off a handicap derived from that round.
--
-- Written 2026-08-30, after replaying the pilot's 18-week season and measuring
-- the net spread week by week.
--
-- WHY
--
-- Birvo scored a team's first round off whatever handicap the roster carried,
-- which for a brand-new course is zero. So week 1 was scratch play. Measured on
-- the pilot season the net spread in week 1 was 26.0 strokes against 8.6-11.8 in
-- every later week, and it was identical under all three handicap methods --
-- league_average, best_of and whs alike. It was never a formula problem. The
-- formula had nothing to work with yet.
--
-- That matters more than it sounds. Birvo is sold to a course starting a season
-- with players who have no record here. Their first night out is the one that
-- decides whether they come back, and under scratch play a 105 golfer loses to an
-- 79 golfer by 26 shots. Nothing about that is fun and nothing about it is
-- informative.
--
-- WHAT THIS DOES
--
-- When a team has no earlier round in the league, the handicap they play off is
-- computed from the card they have just posted. Measured on the same season this
-- takes week 1's net spread from 26.0 to 5.2 -- in line with every other week --
-- and it leaves the final standings completely unchanged, because it gives the
-- same relative treatment to everybody. It puts a thumb on nobody's scale; it
-- just stops week 1 being played without a handicap at all.
--
-- Three further reasons this is the right shape:
--
--   * It is what the pilot course already does by hand. In Hidden Valley's own
--     spreadsheet the handicap in week N's column is computed from a range that
--     includes week N's own score.
--   * It handles late entry for free. A team joining in week 6 has no record
--     either, and hits exactly the same rule.
--   * It needs no data the course has to go and find. Seeding real starting
--     handicaps would be more accurate still, but a new course does not have
--     them, which is the whole premise here.
--
-- From the second round onwards there is a real scoring record and the league's
-- chosen method takes over normally.
begin;

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
  if not found then return; end if;

  select m.week_number into this_week from public.matches m where m.id = target.match_id;

  select count(*) into earlier
  from public.scores s
  join public.matches m on m.id = s.match_id
  where s.team_id = target.team_id
    and m.league_id = (select league_id from public.matches where id = target.match_id)
    and m.week_number < this_week;

  -- Only the team's very first round. From the second onwards there is a real
  -- scoring record to play off.
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
      course_id,match_id,team_id,gross_score,handicap_used,net_score,
      attestation_status,modified_by_user_id
    ) values(
      p_course_id,target_match.id,target_team.id,gross,target_team.current_handicap,
      gross-target_team.current_handicap,'approved',actor_id
    ) on conflict(match_id,team_id) do update set
      gross_score=excluded.gross_score,
      net_score=excluded.gross_score-public.scores.handicap_used,
      attestation_status='approved',
      modified_by_user_id=actor_id,
      updated_at=now()
    returning id into saved_score_id;

    if existing_score.id is not null and existing_score.gross_score is distinct from gross then
      insert into public.score_audit_logs(course_id,score_id,old_gross,new_gross,reason,modified_by_user_id)
      values(p_course_id,saved_score_id,existing_score.gross_score,gross,'Administrative score correction before round lock',actor_id);
    end if;

    new_handicap := public.calculate_team_handicap(target_team.id, p_week_number);
    update public.teams set current_handicap=coalesce(new_handicap,0),updated_at=now() where id=target_team.id;

    -- Must run after the handicap exists, and only rewrites a team's first card.
    perform public.apply_provisional_handicap(saved_score_id);
    saved_count := saved_count+1;
  end loop;

  return jsonb_build_object('matchId',target_match.id,'savedCount',saved_count);
end $fn$;

grant execute on function public.save_score_batch(uuid,uuid,integer,jsonb) to authenticated;

update public.app_metadata set schema_version=19,
  migration_name='202608300004_birvo_provisional_handicap_for_first_round',updated_at=now()
  where key='database';

commit;
