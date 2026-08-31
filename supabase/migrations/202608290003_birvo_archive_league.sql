-- Season-end league archiving.
--
-- Written 2026-08-29 while removing the SQLite runtime. The JavaScript
-- seasonEndService archived a league by writing leagues.archived_at, a column
-- that exists only in the SQLite schema -- the PostgreSQL leagues table has
-- trashed_at and a status enum that already includes 'archived'. There was no
-- PostgreSQL path for the operation at all, so this RPC adds one, following the
-- same shape as trash_league / restore_league.
begin;

create or replace function public.archive_league(
  p_course_id uuid,
  p_league_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  archived boolean := false;
begin
  if not public.has_course_role(p_course_id, array['course_owner','course_admin']) then
    raise exception 'Course manager access required';
  end if;

  update public.leagues
  set status = 'archived', updated_at = now()
  where id = p_league_id and course_id = p_course_id and status = 'active';

  archived := found;
  if not archived then
    raise exception 'Only an active league in this course can be archived.';
  end if;

  insert into public.audit_events (course_id, actor_user_id, action, target_type, target_id, metadata)
  values (p_course_id, actor_id, 'league.archived', 'league', p_league_id::text, '{}'::jsonb);

  return archived;
end;
$$;

revoke execute on function public.archive_league(uuid,uuid) from public, anon;
grant execute on function public.archive_league(uuid,uuid) to authenticated;

update public.app_metadata set schema_version=13,
  migration_name='202608290003_birvo_archive_league',updated_at=now()
  where key='database';

commit;
