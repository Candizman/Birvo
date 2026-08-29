-- Generating a season schedule must also schedule its rounds.
--
-- Written 2026-08-29, found by walking a real league through the product for the
-- first time: create the course, import the roster, generate the schedule, then
-- try to enter week 1 and be told 'Schedule the active week before entering
-- scores' with no way to satisfy it.
--
-- save_score_batch requires a public.matches row for the week. Only
-- apply_ghost_score and postpone_league_week ever created one, and both are
-- exception paths — a league that simply wanted to play its first round had no
-- way through. This was a complete block on the core workflow.
--
-- replace_league_fixtures now inserts a 'pending' match per scheduled week
-- alongside the fixtures. It already refuses to run once any score exists, so
-- adding rounds here cannot disturb recorded play.
begin;

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
  scheduled_rounds integer;
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

  -- Generating the schedule also schedules the rounds. Without a matches row per
  -- week, save_score_batch refuses every entry with 'The round must be scheduled
  -- before scoring' and there is no other way to create one, so a league could
  -- never record its first card.
  insert into public.matches(course_id,league_id,week_number,status)
  select p_course_id,p_league_id,weeks.week_number,'pending'
  from (select distinct f.week_number
        from jsonb_to_recordset(p_fixtures) as f(week_number integer)) weeks
  on conflict(league_id,week_number) do nothing;
  get diagnostics scheduled_rounds = row_count;

  update public.leagues set season_length_weeks=p_total_weeks,updated_at=now() where id=p_league_id;
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'league.fixtures.replaced','league',p_league_id::text,
    jsonb_build_object('weeks',p_total_weeks,'double_round',coalesce(p_double_round,false),'fixtures',inserted_count,'rounds_scheduled',scheduled_rounds));
  return inserted_count;
end $$;

grant execute on function public.replace_league_fixtures(uuid,uuid,integer,boolean,jsonb) to authenticated;

update public.app_metadata set schema_version=15,
  migration_name='202608290005_birvo_fixtures_schedule_their_rounds',updated_at=now()
  where key='database';

commit;
