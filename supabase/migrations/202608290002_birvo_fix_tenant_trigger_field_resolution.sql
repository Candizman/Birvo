-- Fix ensure_tenant_consistency: NEW field resolution across record types.
--
-- Written 2026-08-29, during the first execution of this schema against a real
-- PostgreSQL database.
--
-- THE BUG
--
-- The feature-parity revision folded three cross-league checks into the ELSIF
-- conditions themselves:
--
--   elsif tg_table_name='tournament_entry_fees' and not exists(
--     select 1 from public.teams where id=new.team_id ...) then ...
--
-- PL/pgSQL prepares an entire boolean expression before evaluating it, so
-- `new.team_id` was resolved against whatever record type fired the trigger --
-- not only against tournament_entry_fees. Boolean short-circuiting does not save
-- it, because the failure happens at prepare time, not evaluation time.
--
-- The trigger is attached to teams, matches, tee_times, match_fixtures,
-- substitutes, tv_displays, tv_sponsors and others, none of which have a team_id
-- column. Every insert into those tables failed with:
--
--   ERROR: record "new" has no field "team_id"
--
-- In practice that meant a course could not create a single team, schedule a
-- round, or configure a clubhouse display -- the entire product was blocked. The
-- defect was invisible because these migrations had never been run.
--
-- THE FIX
--
-- Each NEW field reference now sits inside a branch already guarded by
-- tg_table_name, so PL/pgSQL only prepares that statement when the branch is
-- actually reached.
--
-- Verified by supabase/tests/database/002_tenant_isolation.test.sql: 20/20.
begin;

create or replace function public.ensure_tenant_consistency()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  parent_course uuid;
  parent_league uuid;
begin
  if tg_table_name in (
    'teams','matches','roster_imports','public_link_settings','public_link_revocations',
    'match_fixtures','tee_times','substitutes','tv_displays','tv_sponsors','tournament_entry_fees'
  ) then
    select course_id into parent_course from public.leagues where id=new.league_id;
    parent_league := new.league_id;
  elsif tg_table_name='scores' then
    select course_id,league_id into parent_course,parent_league from public.matches where id=new.match_id;
    if not exists(
      select 1 from public.teams
      where id=new.team_id and course_id=new.course_id and league_id=parent_league
    ) then raise exception 'Cross-league or cross-tenant team rejected'; end if;
    if new.attested_by_team_id is not null and not exists(
      select 1 from public.teams
      where id=new.attested_by_team_id and course_id=new.course_id and league_id=parent_league
    ) then raise exception 'Cross-league or cross-tenant attesting team rejected'; end if;
  elsif tg_table_name in ('score_hole_details','score_correction_requests','score_audit_logs') then
    select course_id into parent_course from public.scores where id=new.score_id;
  elsif tg_table_name='roster_import_rows' then
    select course_id into parent_course from public.roster_imports where id=new.import_id;
  elsif tg_table_name in ('player_rsvps','player_profiles','player_badges','player_bag_clubs','round_notes','handicap_audit_logs') then
    select course_id,league_id into parent_course,parent_league from public.teams where id=new.team_id;
  end if;

  if parent_course is null or parent_course<>new.course_id then
    raise exception 'Cross-tenant reference rejected';
  end if;

  -- Every NEW field reference below must sit inside a branch already guarded by
  -- tg_table_name. See the header comment.
  if tg_table_name in ('match_fixtures','tee_times') then
    if new.team1_id is not null and not exists(
      select 1 from public.teams where id=new.team1_id and course_id=new.course_id and league_id=parent_league
    ) then raise exception 'Cross-league team1 rejected'; end if;
    if new.team2_id is not null and not exists(
      select 1 from public.teams where id=new.team2_id and course_id=new.course_id and league_id=parent_league
    ) then raise exception 'Cross-league team2 rejected'; end if;

  elsif tg_table_name='tournament_entry_fees' then
    if not exists(
      select 1 from public.teams where id=new.team_id and course_id=new.course_id and league_id=parent_league
    ) then raise exception 'Cross-league fee team rejected'; end if;

  elsif tg_table_name='handicap_audit_logs' then
    if new.match_id is not null and not exists(
      select 1 from public.matches where id=new.match_id and course_id=new.course_id and league_id=parent_league
    ) then raise exception 'Cross-league handicap audit match rejected'; end if;
  end if;

  return new;
end $$;

update public.app_metadata set schema_version=12,
  migration_name='202608290002_birvo_fix_tenant_trigger_field_resolution',updated_at=now()
  where key='database';

commit;
