-- Birvo atomic operation RPCs and function privilege hardening.
-- Every multi-row business mutation is performed in one PostgreSQL transaction.
begin;

create or replace function public.create_tenant_workspace(
  p_course_name text,
  p_address text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_timezone text,
  p_league_name text,
  p_game_format text,
  p_season_length_weeks integer
)
returns table(course_id uuid,league_id uuid,role text)
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_email text := lower(coalesce((select auth.jwt())->>'email',''));
  created_course_id uuid;
  created_league_id uuid;
begin
  if actor_id is null or actor_email='' then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.course_memberships where user_id=actor_id and status='active') then
    raise exception 'This account already belongs to a course workspace';
  end if;
  if length(trim(coalesce(p_course_name,''))) not between 2 and 160 then raise exception 'Invalid course name'; end if;
  if length(trim(coalesce(p_city,''))) not between 2 and 80 then raise exception 'Invalid city'; end if;
  if upper(coalesce(p_state,'')) !~ '^[A-Z]{2}$' then raise exception 'Invalid state'; end if;
  if coalesce(p_postal_code,'')<>'' and p_postal_code !~ '^[0-9]{5}(-[0-9]{4})?$' then raise exception 'Invalid ZIP code'; end if;
  if p_timezone not in (
    'America/New_York','America/Chicago','America/Denver','America/Phoenix',
    'America/Los_Angeles','America/Anchorage','Pacific/Honolulu'
  ) then raise exception 'Unsupported timezone'; end if;
  if length(trim(coalesce(p_league_name,''))) not between 2 and 100 then raise exception 'Invalid league name'; end if;
  if p_game_format not in ('stroke_play','match_play','stableford','scramble','skins','nassau') then raise exception 'Invalid game format'; end if;
  if p_season_length_weeks not between 1 and 52 then raise exception 'Invalid season length'; end if;

  insert into public.courses(
    name,address,city,state,postal_code,country_code,timezone,contact_email,
    primary_color,account_status,subscription_plan,stripe_status
  ) values(
    trim(p_course_name),trim(coalesce(p_address,'')),trim(p_city),upper(p_state),trim(coalesce(p_postal_code,'')),
    'US',p_timezone,actor_email,'#1D7A5F','setup','starter','not_configured'
  ) returning id into created_course_id;

  insert into public.course_memberships(course_id,user_id,email,role,status)
  values(created_course_id,actor_id,actor_email,'course_owner','active');

  insert into public.leagues(course_id,name,status,current_week,game_format,season_length_weeks)
  values(created_course_id,trim(p_league_name),'active',1,p_game_format,p_season_length_weeks)
  returning id into created_league_id;

  insert into public.course_setup_steps(course_id,step_key,status,completed_by_user_id,completed_at)
  values
    (created_course_id,'course_profile','complete',actor_id,now()),
    (created_course_id,'course_layout','pending',null,null),
    (created_course_id,'tee_boxes','pending',null,null),
    (created_course_id,'first_league','complete',actor_id,now()),
    (created_course_id,'roster','pending',null,null),
    (created_course_id,'scoring_ready','pending',null,null);

  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(created_course_id,actor_id,'workspace.created','course',created_course_id::text,
    jsonb_build_object('league_id',created_league_id,'game_format',p_game_format));

  return query select created_course_id,created_league_id,'course_owner'::text;
end $$;

create or replace function public.accept_pending_course_invitations()
returns setof uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  invitation_id uuid;
begin
  if (select auth.uid()) is null or lower(coalesce((select auth.jwt())->>'email',''))='' then
    raise exception 'Authentication required';
  end if;
  for invitation_id in
    select id from public.course_invitations
    where lower(email)=lower((select auth.jwt())->>'email')
      and status='pending' and expires_at>now()
    order by created_at,id
    for update
  loop
    return next public.accept_course_invitation(invitation_id);
  end loop;
  return;
end $$;

create or replace function public.create_course_invitation(
  p_course_id uuid,
  p_email text,
  p_role text,
  p_ttl_days integer default 7
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
  normalized_email text := lower(trim(coalesce(p_email,'')));
  invitation_id uuid;
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin']) then raise exception 'Course manager access required'; end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(normalized_email)>254 then raise exception 'Invalid email'; end if;
  if p_role not in ('course_admin','assistant_admin','scorekeeper') then raise exception 'Invalid invitation role'; end if;
  if exists(select 1 from public.course_memberships where course_id=p_course_id and lower(email)=normalized_email and status<>'removed') then
    raise exception 'This email already has course access';
  end if;
  if exists(select 1 from public.course_invitations where course_id=p_course_id and lower(email)=normalized_email and status='pending') then
    raise exception 'A pending invitation already exists';
  end if;

  insert into public.course_invitations(course_id,email,role,invited_by_user_id,expires_at)
  values(p_course_id,normalized_email,p_role,actor_id,now()+(greatest(1,least(30,coalesce(p_ttl_days,7)))||' days')::interval)
  returning id into invitation_id;
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'staff.invitation.created','course_invitation',invitation_id::text,
    jsonb_build_object('email',normalized_email,'role',p_role));
  return invitation_id;
end $$;

create or replace function public.mark_course_invitation_delivery(
  p_invitation_id uuid,
  p_auth_user_id uuid default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if p_error is null then
    update public.course_invitations
      set external_invitation_sent_at=now(),auth_user_id=coalesce(p_auth_user_id,auth_user_id),last_error=null,updated_at=now()
      where id=p_invitation_id and status='pending';
  else
    update public.course_invitations
      set status='failed',last_error=left(p_error,500),updated_at=now()
      where id=p_invitation_id and status='pending';
  end if;
end $$;

create or replace function public.update_course_member_role(
  p_course_id uuid,
  p_membership_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_is_owner boolean;
  member public.course_memberships;
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin']) then raise exception 'Course manager access required'; end if;
  if p_role not in ('course_owner','course_admin','assistant_admin','scorekeeper') then raise exception 'Invalid role'; end if;
  actor_is_owner := public.has_course_role(p_course_id,array['course_owner']);
  select * into member from public.course_memberships where id=p_membership_id and course_id=p_course_id and status<>'removed' for update;
  if not found then raise exception 'Membership not found'; end if;
  if (member.role='course_owner' or p_role='course_owner') and not actor_is_owner then raise exception 'Only a course owner can change ownership'; end if;

  update public.course_memberships set role=p_role,updated_at=now() where id=member.id;
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'staff.role.updated','course_membership',member.id::text,
    jsonb_build_object('from',member.role,'to',p_role));
end $$;

create or replace function public.remove_course_member(
  p_course_id uuid,
  p_membership_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_is_owner boolean;
  member public.course_memberships;
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin']) then raise exception 'Course manager access required'; end if;
  actor_is_owner := public.has_course_role(p_course_id,array['course_owner']);
  select * into member from public.course_memberships where id=p_membership_id and course_id=p_course_id and status='active' for update;
  if not found then raise exception 'Active membership not found'; end if;
  if member.user_id=actor_id then raise exception 'You cannot remove your own active access'; end if;
  if member.role='course_owner' and not actor_is_owner then raise exception 'Only a course owner can remove another owner'; end if;

  update public.course_memberships set status='removed',updated_at=now() where id=member.id;
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'staff.membership.removed','course_membership',member.id::text,
    jsonb_build_object('email',member.email,'role',member.role));
end $$;

create or replace function public.revoke_course_invitation(
  p_course_id uuid,
  p_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
  invitation public.course_invitations;
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin']) then raise exception 'Course manager access required'; end if;
  select * into invitation from public.course_invitations
    where id=p_invitation_id and course_id=p_course_id and status='pending' for update;
  if not found then raise exception 'Pending invitation not found'; end if;
  update public.course_invitations set status='revoked',revoked_at=now(),updated_at=now() where id=invitation.id;
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'staff.invitation.revoked','course_invitation',invitation.id::text,
    jsonb_build_object('email',invitation.email));
end $$;

create or replace function public.consume_rate_limit(
  p_scope text,
  p_subject_hash text,
  p_max_requests integer,
  p_window_seconds integer
)
returns table(allowed boolean,remaining integer,retry_after_seconds integer)
language plpgsql
security definer
set search_path=''
as $$
declare
  request_count integer;
  oldest_request timestamptz;
begin
  if length(p_scope) not between 1 and 160 or p_subject_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid rate-limit key'; end if;
  if p_max_requests not between 1 and 1000 or p_window_seconds not between 1 and 604800 then raise exception 'Invalid rate-limit policy'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_scope||':'||p_subject_hash,0));
  delete from private.rate_limit_events where occurred_at < now()-interval '8 days';
  select count(*),min(occurred_at) into request_count,oldest_request
    from private.rate_limit_events
    where scope=p_scope and subject_hash=p_subject_hash
      and occurred_at>=now()-(p_window_seconds||' seconds')::interval;
  if request_count>=p_max_requests then
    return query select false,0,greatest(1,ceil(extract(epoch from (oldest_request+(p_window_seconds||' seconds')::interval-now())))::integer);
    return;
  end if;
  insert into private.rate_limit_events(scope,subject_hash) values(p_scope,p_subject_hash);
  return query select true,p_max_requests-request_count-1,0;
end $$;

create or replace function public.register_player_team(
  p_league_id uuid,
  p_team_name text,
  p_handicap numeric,
  p_pin_hash text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  target_league public.leagues;
  normalized_name text := regexp_replace(trim(coalesce(p_team_name,'')),'[[:space:]]+',' ','g');
  created_team_id uuid;
begin
  select * into target_league
    from public.leagues
    where id=p_league_id and status='active'
    for update;
  if not found then raise exception 'Active league not found'; end if;
  if length(normalized_name) not between 2 and 50 then raise exception 'Invalid team name'; end if;
  if p_handicap is null or p_handicap not between 0 and 54 then raise exception 'Invalid starting handicap'; end if;
  if coalesce(p_pin_hash,'') !~ '^scrypt\$[^$]+\$[^$]+$' or length(p_pin_hash)>200 then
    raise exception 'Invalid PIN credential';
  end if;

  insert into public.teams(
    course_id,league_id,name,current_handicap,low_handicap_365,pin,status
  ) values(
    target_league.course_id,target_league.id,normalized_name,p_handicap,p_handicap,p_pin_hash,'active'
  ) returning id into created_team_id;

  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(target_league.course_id,null,'team.public_registered','team',created_team_id::text,
    jsonb_build_object('league_id',target_league.id,'starting_handicap',p_handicap));
  return created_team_id;
exception
  when unique_violation then raise exception 'A team with this name already exists';
end $$;

create or replace function public.upgrade_player_pin_hash(
  p_team_id uuid,
  p_pin_hash text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  target_team public.teams;
begin
  if coalesce(p_pin_hash,'') !~ '^scrypt\$[^$]+\$[^$]+$' or length(p_pin_hash)>200 then
    raise exception 'Invalid PIN credential';
  end if;
  select * into target_team from public.teams
    where id=p_team_id and status='active' for update;
  if not found then raise exception 'Active team not found'; end if;
  if target_team.pin is null then raise exception 'Team PIN is not configured'; end if;
  if target_team.pin not like 'scrypt$%' then
    update public.teams set pin=p_pin_hash,updated_at=now() where id=target_team.id;
    insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
    values(target_team.course_id,null,'team.pin.upgraded','team',target_team.id::text,
      jsonb_build_object('league_id',target_team.league_id));
  end if;
end $$;

create or replace function public.submit_player_gross_score(
  p_team_id uuid,
  p_gross_score integer
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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
  select least(54,greatest(0,round(((avg(s.gross_score)::numeric)-36)*0.8,1)))
    into recalculated_handicap
    from public.scores s join public.matches m on m.id=s.match_id
    where s.team_id=target_team.id and m.week_number<=target_league.current_week
      and s.reconciliation_status<>'needs_review';
  update public.teams set
    current_handicap=coalesce(recalculated_handicap,current_handicap),
    low_handicap_365=least(low_handicap_365,coalesce(recalculated_handicap,low_handicap_365)),
    updated_at=now()
    where id=target_team.id;
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(target_team.course_id,null,'score.player_submitted','score',saved_score_id::text,
    jsonb_build_object('league_id',target_league.id,'week_number',target_league.current_week));
  return jsonb_build_object('scoreId',saved_score_id,'matchId',target_match.id,
    'weekNumber',target_league.current_week);
end $$;

create or replace function public.submit_player_hole_scorecard(
  p_team_id uuid,
  p_match_id uuid,
  p_holes jsonb,
  p_photo_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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

  select least(54,greatest(0,round(((avg(s.gross_score)::numeric)-36)*0.8,1)))
    into recalculated_handicap
    from public.scores s join public.matches m on m.id=s.match_id
    where s.team_id=target_team.id and m.week_number<=target_league.current_week
      and s.reconciliation_status<>'needs_review';
  update public.teams set
    current_handicap=coalesce(recalculated_handicap,current_handicap),
    low_handicap_365=least(low_handicap_365,coalesce(recalculated_handicap,low_handicap_365)),
    updated_at=now()
    where id=target_team.id;
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(target_team.course_id,null,'score.player_scorecard_submitted','score',saved_score_id::text,
    jsonb_build_object('league_id',target_league.id,'week_number',target_match.week_number,'holes',expected_holes));
  return jsonb_build_object('scoreId',saved_score_id,'matchId',target_match.id,
    'weekNumber',target_match.week_number,'totalGross',total_gross,
    'netScore',total_gross-target_team.current_handicap);
end $$;

create or replace function public.attest_player_score(
  p_team_id uuid,
  p_score_id uuid,
  p_attesting_team_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  target_score public.scores;
  target_match public.matches;
begin
  if p_team_id=p_attesting_team_id then raise exception 'A team cannot attest its own score'; end if;
  select * into target_score from public.scores where id=p_score_id and team_id=p_team_id for update;
  if not found then raise exception 'Player score not found'; end if;
  select * into target_match from public.matches where id=target_score.match_id for update;
  if not found or target_match.locked_at is not null then raise exception 'The score is not open for attestation'; end if;
  if not exists(
    select 1 from public.match_fixtures f
    where f.course_id=target_score.course_id and f.league_id=target_match.league_id
      and f.week_number=target_match.week_number
      and ((f.team1_id=p_team_id and f.team2_id=p_attesting_team_id)
        or (f.team2_id=p_team_id and f.team1_id=p_attesting_team_id))
  ) then raise exception 'The attesting team is not the assigned opponent'; end if;
  update public.scores set attestation_status='attested',attested_by_team_id=p_attesting_team_id,
    updated_at=now() where id=target_score.id;
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(target_score.course_id,null,'score.player_attested','score',target_score.id::text,
    jsonb_build_object('attesting_team_id',p_attesting_team_id,'week_number',target_match.week_number));
end $$;

create or replace function public.update_player_profile(
  p_team_id uuid,
  p_bio text,
  p_favorite_club text,
  p_handicap_goal numeric,
  p_theme_preference text,
  p_language text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare target_team public.teams;
begin
  select * into target_team from public.teams where id=p_team_id and status='active' for update;
  if not found then raise exception 'Active player team not found'; end if;
  if length(coalesce(p_bio,''))>2000 or length(coalesce(p_favorite_club,''))>120 then
    raise exception 'Player profile text is too long';
  end if;
  if p_handicap_goal is not null and p_handicap_goal not between -10 and 54 then raise exception 'Invalid handicap goal'; end if;
  if p_theme_preference not in ('system','light','dark') then raise exception 'Invalid theme preference'; end if;
  if p_language<>'en-US' then raise exception 'Unsupported language'; end if;
  insert into public.player_profiles(
    course_id,team_id,bio,favorite_club,handicap_goal,theme_preference,language
  ) values(
    target_team.course_id,target_team.id,nullif(trim(coalesce(p_bio,'')),''),
    nullif(trim(coalesce(p_favorite_club,'')),''),p_handicap_goal,p_theme_preference,p_language
  ) on conflict(team_id) do update set
    bio=excluded.bio,favorite_club=excluded.favorite_club,handicap_goal=excluded.handicap_goal,
    theme_preference=excluded.theme_preference,language=excluded.language,updated_at=now();
end $$;

create or replace function public.add_player_bag_club(
  p_team_id uuid,
  p_club_name text,
  p_brand text,
  p_avg_distance_yards integer
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  target_team public.teams;
  created_club_id uuid;
begin
  select * into target_team from public.teams where id=p_team_id and status='active';
  if not found then raise exception 'Active player team not found'; end if;
  if length(trim(coalesce(p_club_name,''))) not between 2 and 80
    or length(coalesce(p_brand,''))>120 then raise exception 'Invalid club details'; end if;
  if p_avg_distance_yards not between 0 and 450 then raise exception 'Invalid club distance'; end if;
  insert into public.player_bag_clubs(course_id,team_id,club_name,brand,avg_distance_yards)
  values(target_team.course_id,target_team.id,trim(p_club_name),nullif(trim(coalesce(p_brand,'')),''),p_avg_distance_yards)
  returning id into created_club_id;
  return created_club_id;
end $$;

create or replace function public.delete_player_bag_club(
  p_team_id uuid,
  p_club_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  delete from public.player_bag_clubs where id=p_club_id and team_id=p_team_id;
  if not found then raise exception 'Player club not found'; end if;
end $$;

create or replace function public.save_player_round_note(
  p_team_id uuid,
  p_week_number integer,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  target_team public.teams;
  saved_note_id uuid;
begin
  select * into target_team from public.teams where id=p_team_id and status='active';
  if not found then raise exception 'Active player team not found'; end if;
  if p_week_number not between 1 and 52 or length(trim(coalesce(p_notes,''))) not between 1 and 5000 then
    raise exception 'Invalid round note';
  end if;
  insert into public.round_notes(course_id,team_id,week_number,notes)
  values(target_team.course_id,target_team.id,p_week_number,trim(p_notes))
  on conflict(team_id,week_number) do update set notes=excluded.notes,updated_at=now()
  returning id into saved_note_id;
  return saved_note_id;
end $$;

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

    select greatest(0,round(((avg(s.gross_score)::numeric)-36)*0.8,1)) into new_handicap
      from public.scores s join public.matches m on m.id=s.match_id
      where s.team_id=target_team.id and m.week_number<=p_week_number
        and s.reconciliation_status<>'needs_review';
    update public.teams set current_handicap=coalesce(new_handicap,0),updated_at=now() where id=target_team.id;
    saved_count := saved_count+1;
  end loop;

  return jsonb_build_object('matchId',target_match.id,'savedCount',saved_count);
end $$;

create or replace function public.lock_round_and_advance(
  p_course_id uuid,
  p_league_id uuid,
  p_week_number integer
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_league public.leagues;
  target_match public.matches;
  active_teams integer;
  entered integer;
  unattested integer;
  needs_review integer;
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin']) then raise exception 'Course manager access required'; end if;
  select * into target_league from public.leagues where id=p_league_id and course_id=p_course_id for update;
  if not found or target_league.current_week<>p_week_number then raise exception 'The selected round is no longer current'; end if;
  select * into target_match from public.matches where league_id=p_league_id and week_number=p_week_number for update;
  if not found then raise exception 'The round has not been scheduled'; end if;
  if target_match.locked_at is not null then raise exception 'This round is already locked'; end if;
  select count(*) into active_teams from public.teams where league_id=p_league_id and status='active';
  select count(*),count(*) filter(where attestation_status not in ('attested','approved')),
    count(*) filter(where reconciliation_status='needs_review')
    into entered,unattested,needs_review from public.scores where match_id=target_match.id;
  if active_teams<1 then raise exception 'The league has no active teams'; end if;
  if entered<>active_teams then raise exception 'Scorecards are missing'; end if;
  if unattested>0 then raise exception 'Scorecards still need attestation'; end if;
  if needs_review>0 then raise exception 'Scorecards require reconciliation'; end if;

  update public.matches set status='locked',locked_at=now(),locked_by_user_id=actor_id,
    lock_reason='Round finalized by course management',updated_at=now() where id=target_match.id;
  update public.leagues set current_week=current_week+1,updated_at=now() where id=p_league_id;
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'round.locked_and_advanced','match',target_match.id::text,
    jsonb_build_object('league_id',p_league_id,'week_number',p_week_number,'scorecards',entered));
  return p_week_number+1;
end $$;

create or replace function public.request_score_correction(
  p_course_id uuid,
  p_score_id uuid,
  p_requested_gross_score integer,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
  score_record record;
  request_id uuid;
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin','assistant_admin','scorekeeper']) then raise exception 'Scoring access required'; end if;
  if p_requested_gross_score not between 1 and 200 or length(trim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'Invalid correction request'; end if;
  select s.id,s.gross_score,m.locked_at into score_record
    from public.scores s join public.matches m on m.id=s.match_id
    where s.id=p_score_id and s.course_id=p_course_id for update;
  if not found then raise exception 'Score not found'; end if;
  if score_record.locked_at is null then raise exception 'Unlocked scores use normal score entry'; end if;
  insert into public.score_correction_requests(course_id,score_id,requested_by_user_id,requested_gross_score,reason)
    values(p_course_id,p_score_id,actor_id,p_requested_gross_score,trim(p_reason)) returning id into request_id;
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'score.correction.requested','score',p_score_id::text,
    jsonb_build_object('request_id',request_id,'old_gross',score_record.gross_score,'requested_gross',p_requested_gross_score));
  return request_id;
end $$;

create or replace function public.prevent_locked_score_change()
returns trigger
language plpgsql
set search_path=''
as $$
declare target_match_id uuid;
begin
  if tg_op='DELETE' then target_match_id:=old.match_id; else target_match_id:=new.match_id; end if;
  if exists(select 1 from public.matches where id=target_match_id and locked_at is not null)
    and not (
      coalesce(current_setting('birvo.allow_locked_score_correction',true),'off')='on'
      and current_user=(
        select pg_get_userbyid(proowner)
        from pg_proc
        where oid='public.review_score_correction(uuid,uuid,text,text)'::regprocedure
      )
    )
  then raise exception 'This round is locked. Create a correction request instead.'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

create or replace function public.review_score_correction(
  p_course_id uuid,
  p_request_id uuid,
  p_decision text,
  p_review_note text default null
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_record record;
  recalculated_handicap numeric(4,1);
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin']) then raise exception 'Course manager access required'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  if length(coalesce(p_review_note,''))>1000 then raise exception 'Review note is too long'; end if;
  select r.*,s.gross_score as old_gross,s.handicap_used,s.team_id
    into request_record from public.score_correction_requests r
    join public.scores s on s.id=r.score_id
    where r.id=p_request_id and r.course_id=p_course_id and r.status='pending' for update;
  if not found then raise exception 'Pending correction request not found'; end if;

  if p_decision='approved' then
    perform set_config('birvo.allow_locked_score_correction','on',true);
    update public.scores set gross_score=request_record.requested_gross_score,
      net_score=request_record.requested_gross_score-coalesce(request_record.handicap_used,0),
      reconciliation_status='ok',modified_by_user_id=actor_id,updated_at=now()
      where id=request_record.score_id;
    insert into public.score_audit_logs(course_id,score_id,old_gross,new_gross,reason,modified_by_user_id)
    values(p_course_id,request_record.score_id,request_record.old_gross,request_record.requested_gross_score,
      'Approved locked-round correction: '||request_record.reason,actor_id);
    select greatest(0,round(((avg(s.gross_score)::numeric)-36)*0.8,1)) into recalculated_handicap
      from public.scores s where s.team_id=request_record.team_id and s.reconciliation_status<>'needs_review';
    update public.teams set current_handicap=coalesce(recalculated_handicap,0),updated_at=now()
      where id=request_record.team_id;
  end if;

  update public.score_correction_requests set status=p_decision,reviewed_by_user_id=actor_id,
    review_note=nullif(trim(coalesce(p_review_note,'')),''),reviewed_at=now(),updated_at=now()
    where id=p_request_id;
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'score.correction.'||p_decision,'score',request_record.score_id::text,
    jsonb_build_object('request_id',p_request_id,'old_gross',request_record.old_gross,
      'requested_gross',request_record.requested_gross_score));
  return p_decision;
end $$;

create or replace function public.rotate_public_link(
  p_course_id uuid,
  p_league_id uuid,
  p_purpose text
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
  next_version integer;
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin']) then raise exception 'Course manager access required'; end if;
  if p_purpose not in ('standings','tv','player') then raise exception 'Invalid public-link purpose'; end if;
  if not exists(select 1 from public.leagues where id=p_league_id and course_id=p_course_id) then raise exception 'League not found'; end if;
  insert into public.public_link_settings(course_id,league_id,purpose,token_version,rotated_by_user_id,rotated_at)
    values(p_course_id,p_league_id,p_purpose,2,actor_id,now())
    on conflict(league_id,purpose) do update set token_version=public.public_link_settings.token_version+1,
      rotated_by_user_id=actor_id,rotated_at=now()
    returning token_version into next_version;
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'public_link.rotated','league',p_league_id::text,
    jsonb_build_object('purpose',p_purpose,'version',next_version));
  return next_version;
end $$;

create or replace function public.initialize_course_layout(p_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
  inserted_holes integer := 0;
  inserted_tees integer := 0;
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin']) then raise exception 'Course manager access required'; end if;

  insert into public.course_holes(course_id,layout_name,hole_number,par,stroke_index,pin_position,is_under_maintenance)
  select p_course_id,'Main Course',hole_number,par,stroke_index,'center',false
  from (values
    (1,4,7),(2,4,3),(3,3,15),(4,5,1),(5,4,11),(6,4,5),(7,3,17),(8,5,9),(9,4,13),
    (10,4,8),(11,4,4),(12,3,16),(13,5,2),(14,4,12),(15,4,6),(16,3,18),(17,5,10),(18,4,14)
  ) as defaults(hole_number,par,stroke_index)
  on conflict(course_id,layout_name,hole_number) do nothing;
  get diagnostics inserted_holes = row_count;

  insert into public.course_tee_boxes(
    course_id,layout_name,name,color_hex,gender,course_rating,slope_rating,total_yards
  ) values
    (p_course_id,'Main Course','Black (Championship)','#1e293b','men',74.2,135,6850),
    (p_course_id,'Main Course','White (Men)','#f8fafc','men',72.0,128,6400),
    (p_course_id,'Main Course','Gold (Senior)','#eab308','all',70.4,122,5950),
    (p_course_id,'Main Course','Red (Women)','#ef4444','women',68.8,116,5200)
  on conflict(course_id,layout_name,name) do nothing;
  get diagnostics inserted_tees = row_count;

  insert into public.course_setup_steps(course_id,step_key,status,completed_by_user_id,completed_at)
  values
    (p_course_id,'course_layout','complete',actor_id,now()),
    (p_course_id,'tee_boxes','complete',actor_id,now())
  on conflict(course_id,step_key) do update set
    status='complete',completed_by_user_id=actor_id,completed_at=now(),updated_at=now();
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'course.layout.initialized','course',p_course_id::text,
    jsonb_build_object('inserted_holes',inserted_holes,'inserted_tees',inserted_tees,'distance_unit','yards'));
  return jsonb_build_object('insertedHoles',inserted_holes,'insertedTeeBoxes',inserted_tees);
end $$;

create or replace function public.update_course_profile(
  p_course_id uuid,
  p_name text,
  p_address text,
  p_city text,
  p_contact_email text,
  p_contact_phone text,
  p_primary_color text,
  p_local_rules text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin']) then raise exception 'Course manager access required'; end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 160 then raise exception 'Invalid course name'; end if;
  if length(coalesce(p_address,''))>240 then raise exception 'Address is too long'; end if;
  if length(coalesce(p_city,''))>80 then raise exception 'City is too long'; end if;
  if length(coalesce(p_contact_phone,''))>40 then raise exception 'Phone number is too long'; end if;
  if length(coalesce(p_local_rules,''))>5000 then raise exception 'Local rules are too long'; end if;
  if coalesce(p_contact_email,'')<>'' and (p_contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_contact_email)>254) then raise exception 'Invalid contact email'; end if;
  if coalesce(p_primary_color,'') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Invalid theme color'; end if;

  update public.courses set
    name=trim(p_name),address=trim(coalesce(p_address,'')),city=trim(coalesce(p_city,'')),
    contact_email=nullif(lower(trim(coalesce(p_contact_email,''))),''),
    contact_phone=nullif(trim(coalesce(p_contact_phone,'')),''),primary_color=p_primary_color,
    local_rules=nullif(trim(coalesce(p_local_rules,'')),''),updated_at=now()
  where id=p_course_id;
  if not found then raise exception 'Course not found'; end if;
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'course.profile.updated','course',p_course_id::text,'{}'::jsonb);
end $$;

create or replace function public.save_course_holes(p_course_id uuid,p_holes jsonb)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
  saved_count integer;
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin']) then raise exception 'Course manager access required'; end if;
  if jsonb_typeof(p_holes)<>'array' or jsonb_array_length(p_holes)<>18 then raise exception 'Exactly 18 holes are required'; end if;
  if exists(
    select 1 from jsonb_to_recordset(p_holes) as h(
      hole_number integer,par integer,stroke_index integer,pin_position text,is_under_maintenance boolean,notes text
    ) where h.hole_number not between 1 and 18 or h.par not between 3 and 6
      or h.stroke_index not between 1 and 18 or h.pin_position not in ('front','center','back')
      or h.hole_number is null or h.par is null or h.stroke_index is null
  ) then raise exception 'Invalid hole layout'; end if;
  if (select count(distinct h.hole_number) from jsonb_to_recordset(p_holes) as h(hole_number integer))<>18
    or (select count(distinct h.stroke_index) from jsonb_to_recordset(p_holes) as h(stroke_index integer))<>18
  then raise exception 'Hole numbers and stroke indexes must each be unique'; end if;

  delete from public.course_holes where course_id=p_course_id and layout_name='Main Course';
  insert into public.course_holes(
    course_id,layout_name,hole_number,par,stroke_index,pin_position,is_under_maintenance,notes
  ) select p_course_id,'Main Course',h.hole_number,h.par,h.stroke_index,h.pin_position,
      coalesce(h.is_under_maintenance,false),nullif(trim(coalesce(h.notes,'')),'')
    from jsonb_to_recordset(p_holes) as h(
      hole_number integer,par integer,stroke_index integer,pin_position text,is_under_maintenance boolean,notes text
    ) order by h.hole_number;
  get diagnostics saved_count = row_count;
  insert into public.course_setup_steps(course_id,step_key,status,completed_by_user_id,completed_at)
  values(p_course_id,'course_layout','complete',actor_id,now())
  on conflict(course_id,step_key) do update set
    status='complete',completed_by_user_id=actor_id,completed_at=now(),updated_at=now();
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'course.holes.updated','course',p_course_id::text,jsonb_build_object('hole_count',saved_count));
  return saved_count;
end $$;

create or replace function public.upsert_course_tee_box(
  p_course_id uuid,
  p_tee_id uuid,
  p_name text,
  p_color_hex text,
  p_gender text,
  p_course_rating numeric,
  p_slope_rating integer,
  p_total_yards integer
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
  saved_id uuid;
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin']) then raise exception 'Course manager access required'; end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 100 then raise exception 'Invalid tee name'; end if;
  if coalesce(p_color_hex,'') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Invalid tee color'; end if;
  if p_gender not in ('all','men','women','senior','junior') then raise exception 'Invalid tee category'; end if;
  if p_course_rating not between 40 and 90 then raise exception 'Invalid course rating'; end if;
  if p_slope_rating not between 55 and 155 then raise exception 'Invalid slope rating'; end if;
  if p_total_yards not between 500 and 10000 then raise exception 'Invalid yardage'; end if;

  if p_tee_id is null then
    insert into public.course_tee_boxes(
      course_id,layout_name,name,color_hex,gender,course_rating,slope_rating,total_yards
    ) values(p_course_id,'Main Course',trim(p_name),p_color_hex,p_gender,p_course_rating,p_slope_rating,p_total_yards)
    returning id into saved_id;
  else
    update public.course_tee_boxes set name=trim(p_name),color_hex=p_color_hex,gender=p_gender,
      course_rating=p_course_rating,slope_rating=p_slope_rating,total_yards=p_total_yards,updated_at=now()
      where id=p_tee_id and course_id=p_course_id and layout_name='Main Course'
      returning id into saved_id;
    if saved_id is null then raise exception 'Tee box not found'; end if;
  end if;
  insert into public.course_setup_steps(course_id,step_key,status,completed_by_user_id,completed_at)
  values(p_course_id,'tee_boxes','complete',actor_id,now())
  on conflict(course_id,step_key) do update set
    status='complete',completed_by_user_id=actor_id,completed_at=now(),updated_at=now();
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'course.tee_box.saved','course_tee_box',saved_id::text,
    jsonb_build_object('total_yards',p_total_yards));
  return saved_id;
end $$;

create or replace function public.delete_course_tee_box(p_course_id uuid,p_tee_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin']) then raise exception 'Course manager access required'; end if;
  delete from public.course_tee_boxes where id=p_tee_id and course_id=p_course_id and layout_name='Main Course';
  if not found then raise exception 'Tee box not found'; end if;
  update public.course_setup_steps set status=case
      when exists(select 1 from public.course_tee_boxes where course_id=p_course_id and layout_name='Main Course') then 'complete'
      else 'pending' end,
    completed_by_user_id=case when exists(select 1 from public.course_tee_boxes where course_id=p_course_id and layout_name='Main Course') then actor_id else null end,
    completed_at=case when exists(select 1 from public.course_tee_boxes where course_id=p_course_id and layout_name='Main Course') then now() else null end,
    updated_at=now()
    where course_id=p_course_id and step_key='tee_boxes';
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'course.tee_box.deleted','course_tee_box',p_tee_id::text,'{}'::jsonb);
end $$;

create or replace function public.generate_shotgun_tee_times(
  p_course_id uuid,
  p_league_id uuid,
  p_week_number integer,
  p_start_time time without time zone
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
  league_week integer;
  inserted_count integer;
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin','assistant_admin','scorekeeper']) then raise exception 'Scoring access required'; end if;
  select current_week into league_week from public.leagues
    where id=p_league_id and course_id=p_course_id and status='active' for update;
  if league_week is null then raise exception 'Active league not found'; end if;
  if p_week_number<>league_week then raise exception 'Only the current week can be scheduled'; end if;
  if p_start_time is null then raise exception 'Starting time is required'; end if;
  if exists(select 1 from public.matches where course_id=p_course_id and league_id=p_league_id
      and week_number=p_week_number and locked_at is not null) then raise exception 'A locked round cannot be rescheduled'; end if;

  delete from public.tee_times where course_id=p_course_id and league_id=p_league_id and week_number=p_week_number;
  with ordered as (
    select id,row_number() over(order by created_at,id)-1 as team_index
    from public.teams where course_id=p_course_id and league_id=p_league_id and status='active'
  ), pairs as (
    select (team_index/2)::integer as pair_index,
      (max(id::text) filter(where team_index%2=0))::uuid as team1_id,
      (max(id::text) filter(where team_index%2=1))::uuid as team2_id
    from ordered group by (team_index/2)::integer
  )
  insert into public.tee_times(
    course_id,league_id,week_number,start_time,starting_hole,starting_group,team1_id,team2_id,status
  ) select p_course_id,p_league_id,p_week_number,p_start_time,
      ((pair_index/2)%18)+1,case when pair_index%2=0 then 'A' else 'B' end,team1_id,team2_id,'scheduled'
    from pairs order by pair_index;
  get diagnostics inserted_count = row_count;
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'course.shotgun.generated','league',p_league_id::text,
    jsonb_build_object('week_number',p_week_number,'start_time',p_start_time,'pairings',inserted_count));
  return inserted_count;
end $$;

create or replace function public.create_league(
  p_course_id uuid,
  p_name text,
  p_game_format text,
  p_season_length_weeks integer
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
  league_id uuid;
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin']) then raise exception 'Course manager access required'; end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 100 then raise exception 'Invalid league name'; end if;
  if p_game_format not in ('stroke_play','match_play','stableford','scramble','skins','nassau') then raise exception 'Invalid game format'; end if;
  if p_season_length_weeks not between 1 and 52 then raise exception 'Invalid season length'; end if;
  insert into public.leagues(course_id,name,status,current_week,game_format,season_length_weeks)
  values(p_course_id,trim(p_name),'active',1,p_game_format,p_season_length_weeks)
  returning id into league_id;
  insert into public.course_setup_steps(course_id,step_key,status,completed_by_user_id,completed_at)
  values(p_course_id,'first_league','complete',actor_id,now())
  on conflict(course_id,step_key) do update set
    status='complete',completed_by_user_id=actor_id,completed_at=now(),updated_at=now();
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'league.created','league',league_id::text,
    jsonb_build_object('game_format',p_game_format,'season_length_weeks',p_season_length_weeks));
  return league_id;
end $$;

create or replace function public.update_league_format(
  p_course_id uuid,
  p_league_id uuid,
  p_game_format text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
  previous_format text;
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin']) then raise exception 'Course manager access required'; end if;
  if p_game_format not in ('stroke_play','match_play','stableford','scramble','skins','nassau') then raise exception 'Invalid game format'; end if;
  select game_format into previous_format from public.leagues
    where id=p_league_id and course_id=p_course_id and status not in ('trashed','archived') for update;
  if previous_format is null then raise exception 'League not found'; end if;
  if exists(select 1 from public.scores s join public.matches m on m.id=s.match_id where m.league_id=p_league_id) then
    raise exception 'The scoring format cannot change after score entry begins';
  end if;
  update public.leagues set game_format=p_game_format,updated_at=now() where id=p_league_id;
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'league.format.updated','league',p_league_id::text,
    jsonb_build_object('from',previous_format,'to',p_game_format));
end $$;

create or replace function public.save_league_playoff_bracket(
  p_course_id uuid,
  p_league_id uuid,
  p_bracket jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
  bracket_size integer;
  seed_count integer;
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin']) then raise exception 'Course manager access required'; end if;
  if not exists(select 1 from public.leagues where id=p_league_id and course_id=p_course_id and status='active') then raise exception 'Active league not found'; end if;
  if jsonb_typeof(p_bracket)<>'object' or jsonb_typeof(p_bracket->'quarterOrSemis')<>'array' then raise exception 'Invalid playoff bracket'; end if;
  bracket_size := (p_bracket->>'bracketSize')::integer;
  if bracket_size not in (4,8,16) then raise exception 'Invalid playoff bracket size'; end if;
  select count(*) into seed_count
  from jsonb_array_elements(p_bracket->'quarterOrSemis') as matchups(matchup)
  cross join lateral (values(matchup->'highSeed'->>'id'),(matchup->'lowSeed'->>'id')) as seeds(seed_id)
  where seed_id is not null;
  if seed_count<2 or seed_count>bracket_size then raise exception 'Invalid playoff seeds'; end if;
  if exists(
    select 1 from jsonb_array_elements(p_bracket->'quarterOrSemis') as matchups(matchup)
    cross join lateral (values(matchup->'highSeed'->>'id'),(matchup->'lowSeed'->>'id')) as seeds(seed_id)
    where seed_id is not null and not exists(
      select 1 from public.teams where id=seed_id::uuid and course_id=p_course_id and league_id=p_league_id and status='active'
    )
  ) then raise exception 'Playoff seed is outside the selected league'; end if;
  update public.leagues set playoff_bracket=p_bracket,updated_at=now() where id=p_league_id and course_id=p_course_id;
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'league.playoff.generated','league',p_league_id::text,
    jsonb_build_object('bracket_size',bracket_size,'seed_count',seed_count));
end $$;

create or replace function public.replace_league_fixtures(
  p_course_id uuid,
  p_league_id uuid,
  p_total_weeks integer,
  p_double_round boolean,
  p_fixtures jsonb
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
  active_team_count integer;
  expected_fixture_count integer;
  inserted_count integer;
  league_week integer;
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin']) then raise exception 'Course manager access required'; end if;
  if p_total_weeks not between 2 and 52 then raise exception 'Invalid season length'; end if;
  if jsonb_typeof(p_fixtures)<>'array' then raise exception 'Invalid fixture payload'; end if;
  select current_week into league_week from public.leagues
    where id=p_league_id and course_id=p_course_id and status='active' for update;
  if league_week is null or league_week<>1 then raise exception 'Fixtures can be regenerated only before the season advances'; end if;
  if exists(select 1 from public.scores s join public.matches m on m.id=s.match_id where m.league_id=p_league_id) then
    raise exception 'Fixtures cannot be regenerated after score entry begins';
  end if;
  select count(*) into active_team_count from public.teams
    where course_id=p_course_id and league_id=p_league_id and status='active';
  if active_team_count<2 then raise exception 'At least two active teams are required'; end if;
  expected_fixture_count := ((active_team_count+1)/2)*p_total_weeks;
  if jsonb_array_length(p_fixtures)<>expected_fixture_count then raise exception 'Fixture payload is incomplete'; end if;
  if exists(
    select 1 from jsonb_to_recordset(p_fixtures) as f(
      week_number integer,team1_id uuid,team2_id uuid,is_bye integer
    ) where f.week_number not between 1 and p_total_weeks or f.team1_id is null
      or f.team1_id=f.team2_id or f.is_bye not in (0,1)
      or (f.is_bye=1)<>(f.team2_id is null)
      or not exists(select 1 from public.teams where id=f.team1_id and course_id=p_course_id and league_id=p_league_id and status='active')
      or (f.team2_id is not null and not exists(select 1 from public.teams where id=f.team2_id and course_id=p_course_id and league_id=p_league_id and status='active'))
  ) then raise exception 'Invalid or cross-tenant fixture'; end if;
  if exists(
    with fixture_rows as (
      select * from jsonb_to_recordset(p_fixtures) as f(week_number integer,team1_id uuid,team2_id uuid,is_bye integer)
    ), assignments as (
      select week_number,team1_id as team_id from fixture_rows
      union all select week_number,team2_id from fixture_rows where team2_id is not null
    ) select 1 from assignments group by week_number,team_id having count(*)>1
  ) then raise exception 'A team cannot have multiple fixtures in one week'; end if;

  delete from public.match_fixtures where course_id=p_course_id and league_id=p_league_id;
  insert into public.match_fixtures(
    course_id,league_id,week_number,team1_id,team2_id,is_bye,scheduled_time
  ) select p_course_id,p_league_id,f.week_number,f.team1_id,f.team2_id,(f.is_bye=1),time '09:00'
    from jsonb_to_recordset(p_fixtures) as f(
      week_number integer,team1_id uuid,team2_id uuid,is_bye integer
    ) order by f.week_number;
  get diagnostics inserted_count = row_count;
  update public.leagues set season_length_weeks=p_total_weeks,updated_at=now() where id=p_league_id;
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'league.fixtures.replaced','league',p_league_id::text,
    jsonb_build_object('weeks',p_total_weeks,'double_round',coalesce(p_double_round,false),'fixtures',inserted_count));
  return inserted_count;
end $$;

create or replace function public.add_league_substitute(
  p_course_id uuid,
  p_league_id uuid,
  p_name text,
  p_handicap numeric,
  p_phone text,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
  substitute_id uuid;
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin']) then raise exception 'Course manager access required'; end if;
  if not exists(select 1 from public.leagues where id=p_league_id and course_id=p_course_id and status='active') then raise exception 'Active league not found'; end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 120 then raise exception 'Invalid substitute name'; end if;
  if p_handicap not between -10 and 54 then raise exception 'Invalid Handicap Index'; end if;
  if length(coalesce(p_phone,''))>40 then raise exception 'Phone number is too long'; end if;
  if coalesce(p_email,'')<>'' and (p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_email)>254) then raise exception 'Invalid email'; end if;
  insert into public.substitutes(course_id,league_id,name,handicap,phone,email,status)
  values(p_course_id,p_league_id,trim(p_name),p_handicap,nullif(trim(coalesce(p_phone,'')),''),
    nullif(lower(trim(coalesce(p_email,''))),''),'available') returning id into substitute_id;
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'league.substitute.added','substitute',substitute_id::text,
    jsonb_build_object('league_id',p_league_id));
  return substitute_id;
end $$;

create or replace function public.save_team_rsvp(
  p_course_id uuid,
  p_league_id uuid,
  p_team_id uuid,
  p_week_number integer,
  p_status text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
  rsvp_id uuid;
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin','assistant_admin','scorekeeper']) then raise exception 'Scoring access required'; end if;
  if not exists(select 1 from public.leagues where id=p_league_id and course_id=p_course_id and status='active' and current_week=p_week_number) then raise exception 'RSVP week is not current'; end if;
  if not exists(select 1 from public.teams where id=p_team_id and course_id=p_course_id and league_id=p_league_id and status='active') then raise exception 'Team not found'; end if;
  if p_status not in ('attending','not_attending','maybe','needs_sub','unknown') then raise exception 'Invalid RSVP status'; end if;
  if length(coalesce(p_note,''))>500 then raise exception 'RSVP note is too long'; end if;
  insert into public.player_rsvps(course_id,team_id,week_number,status,note)
  values(p_course_id,p_team_id,p_week_number,p_status,nullif(trim(coalesce(p_note,'')),''))
  on conflict(team_id,week_number) do update set
    status=excluded.status,note=excluded.note,updated_at=now()
  returning id into rsvp_id;
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'league.rsvp.saved','player_rsvp',rsvp_id::text,
    jsonb_build_object('league_id',p_league_id,'team_id',p_team_id,'week_number',p_week_number,'status',p_status));
  return rsvp_id;
end $$;

create or replace function public.postpone_league_week(
  p_course_id uuid,
  p_league_id uuid,
  p_week_number integer
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
  league_record public.leagues;
  scheduled_record record;
  rainout_match_id uuid;
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin']) then raise exception 'Course manager access required'; end if;
  select * into league_record from public.leagues
    where id=p_league_id and course_id=p_course_id and status='active' for update;
  if not found then raise exception 'Active league not found'; end if;
  if league_record.current_week<>p_week_number then raise exception 'Only the current week can be postponed'; end if;
  if league_record.season_length_weeks>=52 or p_week_number>=52 then raise exception 'The schedule cannot extend beyond Week 52'; end if;
  if exists(select 1 from public.matches where course_id=p_course_id and league_id=p_league_id
      and week_number=p_week_number and locked_at is not null) then raise exception 'A locked round cannot be postponed'; end if;
  if exists(select 1 from public.matches where course_id=p_course_id and league_id=p_league_id
      and week_number=p_week_number and status='rained_out') then raise exception 'This round has already been postponed'; end if;
  if exists(select 1 from public.matches where course_id=p_course_id and league_id=p_league_id and week_number>=52)
    or exists(select 1 from public.match_fixtures where course_id=p_course_id and league_id=p_league_id and week_number>=52)
    or exists(select 1 from public.tee_times where course_id=p_course_id and league_id=p_league_id and week_number>=52)
    or exists(select 1 from public.player_rsvps r join public.teams t on t.id=r.team_id
      where r.course_id=p_course_id and t.league_id=p_league_id and r.week_number>=52)
  then raise exception 'The schedule cannot extend beyond Week 52'; end if;

  for scheduled_record in
    select id from public.matches where course_id=p_course_id and league_id=p_league_id and week_number>p_week_number
    order by week_number desc,id for update
  loop
    update public.matches set week_number=week_number+1,
      match_date=case when match_date is null then null else match_date+7 end,updated_at=now()
      where id=scheduled_record.id;
  end loop;
  select id into rainout_match_id from public.matches
    where course_id=p_course_id and league_id=p_league_id and week_number=p_week_number for update;
  if rainout_match_id is null then
    insert into public.matches(course_id,league_id,week_number,status)
    values(p_course_id,p_league_id,p_week_number,'rained_out') returning id into rainout_match_id;
  else
    update public.matches set status='rained_out',updated_at=now() where id=rainout_match_id;
  end if;

  update public.match_fixtures set week_number=week_number+1,
    scheduled_date=case when scheduled_date is null then null else scheduled_date+7 end,updated_at=now()
    where course_id=p_course_id and league_id=p_league_id and week_number>=p_week_number;
  update public.tee_times set week_number=week_number+1,updated_at=now()
    where course_id=p_course_id and league_id=p_league_id and week_number>=p_week_number;
  for scheduled_record in
    select r.id from public.player_rsvps r join public.teams t on t.id=r.team_id
    where r.course_id=p_course_id and t.league_id=p_league_id and r.week_number>=p_week_number
    order by r.week_number desc,r.id for update of r
  loop
    update public.player_rsvps set week_number=week_number+1,updated_at=now() where id=scheduled_record.id;
  end loop;
  update public.leagues set current_week=p_week_number+1,
    season_length_weeks=season_length_weeks+1,updated_at=now() where id=p_league_id;
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'round.rainout','match',rainout_match_id::text,
    jsonb_build_object('league_id',p_league_id,'postponed_week',p_week_number,'next_week',p_week_number+1));
  return p_week_number+1;
end $$;

-- Functions are executable by PUBLIC by default in PostgreSQL. Remove that implicit surface.
revoke execute on all functions in schema public from public,anon,authenticated;
alter default privileges in schema public revoke execute on functions from public,anon,authenticated;

grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_course_member(uuid) to authenticated;
grant execute on function public.has_course_role(uuid,text[]) to authenticated;
grant execute on function public.accept_course_invitation(uuid) to authenticated;
grant execute on function public.accept_pending_course_invitations() to authenticated;
grant execute on function public.create_tenant_workspace(text,text,text,text,text,text,text,text,integer) to authenticated;
grant execute on function public.create_course_invitation(uuid,text,text,integer) to authenticated;
grant execute on function public.update_course_member_role(uuid,uuid,text) to authenticated;
grant execute on function public.remove_course_member(uuid,uuid) to authenticated;
grant execute on function public.revoke_course_invitation(uuid,uuid) to authenticated;
grant execute on function public.save_score_batch(uuid,uuid,integer,jsonb) to authenticated;
grant execute on function public.lock_round_and_advance(uuid,uuid,integer) to authenticated;
grant execute on function public.request_score_correction(uuid,uuid,integer,text) to authenticated;
grant execute on function public.review_score_correction(uuid,uuid,text,text) to authenticated;
grant execute on function public.rotate_public_link(uuid,uuid,text) to authenticated;
grant execute on function public.initialize_course_layout(uuid) to authenticated;
grant execute on function public.update_course_profile(uuid,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.save_course_holes(uuid,jsonb) to authenticated;
grant execute on function public.upsert_course_tee_box(uuid,uuid,text,text,text,numeric,integer,integer) to authenticated;
grant execute on function public.delete_course_tee_box(uuid,uuid) to authenticated;
grant execute on function public.generate_shotgun_tee_times(uuid,uuid,integer,time without time zone) to authenticated;
grant execute on function public.create_league(uuid,text,text,integer) to authenticated;
grant execute on function public.update_league_format(uuid,uuid,text) to authenticated;
grant execute on function public.save_league_playoff_bracket(uuid,uuid,jsonb) to authenticated;
grant execute on function public.replace_league_fixtures(uuid,uuid,integer,boolean,jsonb) to authenticated;
grant execute on function public.add_league_substitute(uuid,uuid,text,numeric,text,text) to authenticated;
grant execute on function public.save_team_rsvp(uuid,uuid,uuid,integer,text,text) to authenticated;
grant execute on function public.postpone_league_week(uuid,uuid,integer) to authenticated;

grant execute on function public.consume_rate_limit(text,text,integer,integer) to service_role;
grant execute on function public.mark_course_invitation_delivery(uuid,uuid,text) to service_role;
grant execute on function public.register_player_team(uuid,text,numeric,text) to service_role;
grant execute on function public.upgrade_player_pin_hash(uuid,text) to service_role;
grant execute on function public.submit_player_gross_score(uuid,integer) to service_role;
grant execute on function public.submit_player_hole_scorecard(uuid,uuid,jsonb,text) to service_role;
grant execute on function public.attest_player_score(uuid,uuid,uuid) to service_role;
grant execute on function public.update_player_profile(uuid,text,text,numeric,text,text) to service_role;
grant execute on function public.add_player_bag_club(uuid,text,text,integer) to service_role;
grant execute on function public.delete_player_bag_club(uuid,uuid) to service_role;
grant execute on function public.save_player_round_note(uuid,integer,text) to service_role;

update public.app_metadata set schema_version=3,
  migration_name='202608250002_birvo_atomic_operations',updated_at=now()
  where key='database';

commit;
