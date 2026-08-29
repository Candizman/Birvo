-- Admin read helpers for the score correction workflow.
--
-- Corrected on 2026-08-29 during first execution against PostgreSQL. The original
-- revision had never been run. Both functions were SECURITY DEFINER with no
-- authorization check at all, so any authenticated caller could pass an arbitrary
-- p_course_id and read another tenant's scores -- a cross-tenant leak, since
-- SECURITY DEFINER bypasses RLS. Both now require a course role. They also lacked
-- `set search_path`, which the rest of this schema sets on every function; adding
-- it required schema-qualifying the table references.
begin;

create or replace function public.get_locked_scores_for_corrections(
  p_course_id uuid,
  p_league_id uuid
)
returns table (
  id uuid,
  gross_score integer,
  week_number integer,
  team_name text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_course_role(
    p_course_id, array['course_owner','course_admin','assistant_admin','scorekeeper']
  ) then
    raise exception 'Scoring access required';
  end if;

  return query
  select s.id, s.gross_score::integer, m.week_number, t.name as team_name
  from public.scores s
  join public.matches m on m.id = s.match_id
  join public.leagues l on l.id = m.league_id
  join public.teams t on t.id = s.team_id
  where l.course_id = p_course_id and l.id = p_league_id and m.locked_at is not null
  order by m.week_number desc, t.name;
end;
$$;

create or replace function public.get_score_correction_requests_for_admin(
  p_course_id uuid,
  p_league_id uuid
)
returns table (
  id uuid,
  score_id uuid,
  requested_gross_score integer,
  reason text,
  status text,
  created_at timestamptz,
  old_gross integer,
  week_number integer,
  team_name text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_course_role(
    p_course_id, array['course_owner','course_admin','assistant_admin','scorekeeper']
  ) then
    raise exception 'Scoring access required';
  end if;

  return query
  select
    r.id, r.score_id, r.requested_gross_score::integer, r.reason, r.status, r.created_at,
    s.gross_score::integer as old_gross, m.week_number, t.name as team_name
  from public.score_correction_requests r
  join public.scores s on s.id = r.score_id
  join public.matches m on m.id = s.match_id
  join public.leagues l on l.id = m.league_id
  join public.teams t on t.id = s.team_id
  where r.course_id = p_course_id and l.id = p_league_id
  order by case r.status when 'pending' then 0 else 1 end, r.created_at desc
  limit 100;
end;
$$;

revoke execute on function public.get_locked_scores_for_corrections(uuid,uuid) from public,anon;
revoke execute on function public.get_score_correction_requests_for_admin(uuid,uuid) from public,anon;
grant execute on function public.get_locked_scores_for_corrections(uuid,uuid) to authenticated;
grant execute on function public.get_score_correction_requests_for_admin(uuid,uuid) to authenticated;

update public.app_metadata set schema_version=10,
  migration_name='202608260007_birvo_scoring',updated_at=now()
  where key='database';

commit;
