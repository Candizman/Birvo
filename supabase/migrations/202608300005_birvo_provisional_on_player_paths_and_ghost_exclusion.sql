-- Two corrections found while wiring the provisional handicap through.
--
-- 1. THE PLAYER-ENTERED PATHS DID NOT GET THE PROVISIONAL RULE
--
-- 202608300004 gave a team's first round a handicap derived from that round, but
-- only on save_score_batch -- the staff paper-entry path. A course running the
-- self-service mode, where players post their own cards from their phones, would
-- still have played week 1 off scratch. Both player paths now apply it too, so
-- the rule is a property of the league rather than of how the card reached us.
--
-- 2. GHOST SCORES WERE MOVING HANDICAPS
--
-- A ghost score is what Birvo posts for a team that did not show up: the average
-- gross of everyone who did play that night. It is a placeholder that keeps the
-- standings honest, not a round of golf anybody played.
--
-- calculate_team_handicap counted them anyway. That is wrong in both directions
-- and quietly so. A good golfer who misses a night is handed a card well above
-- their standard, which inflates their handicap and hands them strokes they did
-- not earn; a weak golfer who misses a night is handed a card below theirs, which
-- deflates their handicap and takes strokes away. Neither of them swung a club.
-- The effect compounds under league_average, where nothing ever drops out.
--
-- Handicaps are now built only from rounds actually played. The ghost still
-- scores for the standings; it just no longer describes the golfer.
--
-- A team whose only appearance so far is a ghost is therefore still treated as
-- having no record, and gets the provisional handicap on the first night they
-- actually tee it up.
begin;

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

  -- A rating that does not match the holes actually played (an 18-hole rating on
  -- a nine-hole layout, say) would distort every differential. Fall back to par.
  if rating is null or abs(rating - par) > 10 then
    rating := par;
    slope := 113;
  end if;

  -- Rounds actually played. A ghost score is the field average standing in for a
  -- team that was absent; it belongs in the standings, not in the handicap.
  select array_agg(s.gross_score order by m.week_number)
    into gross_scores
  from public.scores s
  join public.matches m on m.id = s.match_id
  where s.team_id = p_team_id
    and s.reconciliation_status <> 'needs_review'
    and not s.is_ghost
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
end $fn$;

revoke execute on function public.calculate_team_handicap(uuid, integer) from public, anon, authenticated;

-- A team whose only earlier appearance was a ghost has still never posted a real
-- card, so it has no record to play off and the provisional rule applies.
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
  if not found or target.is_ghost then return; end if;

  select m.week_number into this_week from public.matches m where m.id = target.match_id;

  select count(*) into earlier
  from public.scores s
  join public.matches m on m.id = s.match_id
  where s.team_id = target.team_id
    and not s.is_ghost
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

create or replace function public.submit_player_gross_score(p_team_id uuid, p_gross_score integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  target_team public.teams;
  target_league public.leagues;
  target_match public.matches;
  existing_score public.scores;
  saved_score_id uuid;
  recalculated_handicap numeric(4,1);
begin
  if p_gross_score not between 1 and 200 then raise exception 'Gross score must be between 1 and 200'; end if;
  select * into target_team from public.teams where id=p_team_id and status='active' for update;
  if not found or target_team.pin is null then raise exception 'Active player team not found'; end if;
  select * into target_league from public.leagues
    where id=target_team.league_id and course_id=target_team.course_id and status='active' for update;
  if not found then raise exception 'Active league not found'; end if;
  if not exists(
    select 1 from public.match_fixtures
    where course_id=target_team.course_id and league_id=target_league.id
      and week_number=target_league.current_week
      and (team1_id=target_team.id or team2_id=target_team.id)
  ) then raise exception 'The team is not assigned to this round'; end if;
  if not exists(
    select 1 from (
      select count(*) as hole_count,count(distinct stroke_index) as stroke_count
      from public.course_holes where course_id=target_team.course_id
    ) layout where layout.hole_count in (9,18) and layout.stroke_count=layout.hole_count
  ) or not exists(select 1 from public.course_tee_boxes where course_id=target_team.course_id) then
    raise exception 'Course scoring setup is incomplete';
  end if;
  select * into target_match from public.matches
    where course_id=target_team.course_id and league_id=target_league.id
      and week_number=target_league.current_week for update;
  if not found or target_match.status in ('cancelled','rained_out') then raise exception 'The round is not open for scoring'; end if;
  if target_match.locked_at is not null or target_match.status='locked' then raise exception 'This round is locked'; end if;

  select * into existing_score from public.scores
    where match_id=target_match.id and team_id=target_team.id for update;
  insert into public.scores(
    course_id,match_id,team_id,gross_score,handicap_used,net_score,
    attestation_status,reconciliation_status,modified_by_user_id
  ) values(
    target_team.course_id,target_match.id,target_team.id,p_gross_score,
    target_team.current_handicap,p_gross_score-target_team.current_handicap,
    'pending','ok',null
  ) on conflict(match_id,team_id) do update set
    gross_score=excluded.gross_score,
    net_score=excluded.gross_score-public.scores.handicap_used,
    attestation_status=case
      when public.scores.gross_score is distinct from excluded.gross_score then 'pending'
      else public.scores.attestation_status
    end,
    attested_by_team_id=case
      when public.scores.gross_score is distinct from excluded.gross_score then null
      else public.scores.attested_by_team_id
    end,
    reconciliation_status='ok',modified_by_user_id=null,updated_at=now()
  returning id into saved_score_id;

  if existing_score.id is not null and existing_score.gross_score is distinct from p_gross_score then
    insert into public.score_audit_logs(course_id,score_id,old_gross,new_gross,reason,modified_by_user_id)
    values(target_team.course_id,saved_score_id,existing_score.gross_score,p_gross_score,
      'Player resubmitted gross score before round lock',null);
  end if;
  recalculated_handicap := public.calculate_team_handicap(target_team.id, target_league.current_week);
  update public.teams set
    current_handicap=coalesce(recalculated_handicap,current_handicap),
    low_handicap_365=least(low_handicap_365,coalesce(recalculated_handicap,low_handicap_365)),
    updated_at=now()
    where id=target_team.id;

  perform public.apply_provisional_handicap(saved_score_id);

  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(target_team.course_id,null,'score.player_submitted','score',saved_score_id::text,
    jsonb_build_object('league_id',target_league.id,'week_number',target_league.current_week));
  return jsonb_build_object('scoreId',saved_score_id,'matchId',target_match.id,
    'weekNumber',target_league.current_week);
end $fn$;

-- These verify that a team HAS a PIN, never that the caller knows it -- that check
-- lives in the Next.js route that holds the player's PIN session. So they stay
-- reachable only by service_role. Granting them to anon would let anybody post a
-- card for any team id.
revoke execute on function public.submit_player_gross_score(uuid,integer) from public, anon, authenticated;

create or replace function public.submit_player_hole_scorecard(
  p_team_id uuid,
  p_match_id uuid,
  p_holes jsonb,
  p_photo_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  target_team public.teams;
  target_league public.leagues;
  target_match public.matches;
  existing_score public.scores;
  saved_score_id uuid;
  item jsonb;
  hole_record public.course_holes;
  current_hole_number integer;
  gross integer;
  putts integer;
  penalties integer;
  total_gross integer := 0;
  expected_holes integer;
  recalculated_handicap numeric(4,1);
  final_net numeric(5,1);
begin
  select * into target_team from public.teams where id=p_team_id and status='active' for update;
  if not found or target_team.pin is null then raise exception 'Active player team not found'; end if;
  select * into target_league from public.leagues
    where id=target_team.league_id and course_id=target_team.course_id and status='active' for update;
  if not found then raise exception 'Active league not found'; end if;
  select * into target_match from public.matches
    where id=p_match_id and course_id=target_team.course_id and league_id=target_league.id
      and week_number=target_league.current_week for update;
  if not found or target_match.status in ('cancelled','rained_out') then raise exception 'The round is not open for scoring'; end if;
  if target_match.locked_at is not null or target_match.status='locked' then raise exception 'This round is locked'; end if;
  if not exists(
    select 1 from public.match_fixtures
    where course_id=target_team.course_id and league_id=target_league.id
      and week_number=target_match.week_number
      and (team1_id=target_team.id or team2_id=target_team.id)
  ) then raise exception 'The scorecard is not assigned to this team'; end if;
  select count(*) into expected_holes from public.course_holes where course_id=target_team.course_id;
  if expected_holes not in (9,18) or jsonb_typeof(p_holes)<>'array'
    or jsonb_array_length(p_holes)<>expected_holes then raise exception 'A complete course scorecard is required'; end if;
  if (select count(distinct value->>'holeNumber') from jsonb_array_elements(p_holes))<>expected_holes then
    raise exception 'Duplicate or missing hole numbers';
  end if;
  if p_photo_url is not null and (length(p_photo_url)>2048 or p_photo_url !~ '^https://') then
    raise exception 'Invalid scorecard photo URL';
  end if;

  for item in select value from jsonb_array_elements(p_holes) loop
    begin
      current_hole_number := (item->>'holeNumber')::integer;
      gross := (item->>'grossScore')::integer;
      putts := coalesce((item->>'putts')::integer,0);
      penalties := coalesce((item->>'penaltyStrokes')::integer,0);
    exception when others then raise exception 'Invalid hole score data'; end;
    if gross not between 1 and 20 or putts not between 0 and 10 or penalties not between 0 and 20 then
      raise exception 'Hole score values are outside the accepted range';
    end if;
    select * into hole_record from public.course_holes
      where course_id=target_team.course_id and hole_number=current_hole_number;
    if not found then raise exception 'Unknown course hole'; end if;
    total_gross := total_gross+gross;
  end loop;
  if total_gross not between expected_holes and 200 then raise exception 'Gross total is outside the accepted range'; end if;

  select * into existing_score from public.scores
    where match_id=target_match.id and team_id=target_team.id for update;
  insert into public.scores(
    course_id,match_id,team_id,gross_score,handicap_used,net_score,scorecard_photo_url,
    attestation_status,reconciliation_status,modified_by_user_id
  ) values(
    target_team.course_id,target_match.id,target_team.id,total_gross,target_team.current_handicap,
    total_gross-target_team.current_handicap,p_photo_url,'pending','ok',null
  ) on conflict(match_id,team_id) do update set
    gross_score=excluded.gross_score,
    net_score=excluded.gross_score-public.scores.handicap_used,
    scorecard_photo_url=coalesce(excluded.scorecard_photo_url,public.scores.scorecard_photo_url),
    attestation_status='pending',attested_by_team_id=null,reconciliation_status='ok',
    modified_by_user_id=null,updated_at=now()
  returning id into saved_score_id;
  if existing_score.id is not null and existing_score.gross_score is distinct from total_gross then
    insert into public.score_audit_logs(course_id,score_id,old_gross,new_gross,reason,modified_by_user_id)
    values(target_team.course_id,saved_score_id,existing_score.gross_score,total_gross,
      'Player updated hole-by-hole scorecard before round lock',null);
  end if;

  delete from public.score_hole_details where score_id=saved_score_id;
  for item in select value from jsonb_array_elements(p_holes) loop
    current_hole_number := (item->>'holeNumber')::integer;
    gross := (item->>'grossScore')::integer;
    putts := coalesce((item->>'putts')::integer,0);
    penalties := coalesce((item->>'penaltyStrokes')::integer,0);
    select * into hole_record from public.course_holes
      where course_id=target_team.course_id and hole_number=current_hole_number;
    insert into public.score_hole_details(
      course_id,score_id,hole_number,gross_score,putts,penalty_strokes,fairway_hit,gir,sand_saves
    ) values(
      target_team.course_id,saved_score_id,current_hole_number,gross,putts,penalties,
      coalesce((item->>'fairwayHit')::boolean,false),
      gross-putts<=hole_record.par-2,
      coalesce((item->>'sandSave')::boolean,false)
    );
  end loop;

  recalculated_handicap := public.calculate_team_handicap(target_team.id, target_league.current_week);
  update public.teams set
    current_handicap=coalesce(recalculated_handicap,current_handicap),
    low_handicap_365=least(low_handicap_365,coalesce(recalculated_handicap,low_handicap_365)),
    updated_at=now()
    where id=target_team.id;

  perform public.apply_provisional_handicap(saved_score_id);

  -- Read the net back rather than deriving it from the handicap the team held
  -- before this card, which the provisional rule may just have replaced.
  select net_score into final_net from public.scores where id=saved_score_id;

  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(target_team.course_id,null,'score.player_scorecard_submitted','score',saved_score_id::text,
    jsonb_build_object('league_id',target_league.id,'week_number',target_match.week_number,'holes',expected_holes));
  return jsonb_build_object('scoreId',saved_score_id,'matchId',target_match.id,
    'weekNumber',target_match.week_number,'totalGross',total_gross,
    'netScore',final_net);
end $fn$;

revoke execute on function public.submit_player_hole_scorecard(uuid,uuid,jsonb,text) from public, anon, authenticated;

update public.app_metadata set schema_version=20,
  migration_name='202608300005_birvo_provisional_on_player_paths_and_ghost_exclusion',updated_at=now()
  where key='database';

commit;
