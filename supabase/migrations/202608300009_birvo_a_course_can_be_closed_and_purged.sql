-- A course can be closed, reopened, and permanently removed.
--
-- WHY
--
-- A course could not be deleted at all. protect_last_course_owner refuses any
-- delete or demotion that would leave a course without an active owner, which is
-- right for a live course -- but it has no exemption for the course itself being
-- removed. Deleting a course cascades to course_memberships, the cascade trips
-- the trigger, and the whole thing fails with "A course must always have an
-- active owner". There is no order of operations that gets round it: two owners
-- lets you delete one, never the last.
--
-- So every tenant ever created was permanent. That blocks the obvious operational
-- need -- clearing a pilot or a trial workspace before a real customer arrives --
-- and it means a course that asks to have its data removed cannot be given it.
--
-- HOW IT WORKS
--
-- Two steps, deliberately. close_course marks the workspace closed and stops the
-- clock; purge_course destroys it. A single button that erases a season of scores
-- is not something to offer, so the purge refuses to run on a course that has not
-- been closed first, and the close is reversible with reopen_course.
--
-- purge_expired_trash also sweeps up anything closed more than thirty days ago,
-- the same grace period trashed leagues already get, so an abandoned trial does
-- not sit there forever.
--
-- WHAT SURVIVES
--
-- Thirty of the thirty-one tables referencing a course cascade, so the delete
-- takes the whole workspace with it. audit_events is the exception: its course
-- reference is ON DELETE SET NULL, deliberately, so the record that something was
-- done outlives the tenant it was done in.
begin;

alter table public.courses
  add column closed_at timestamptz;

comment on column public.courses.closed_at is
  'When the workspace was closed. Purged automatically thirty days later, or immediately by its owner.';

-- The guard protects a live course from losing its last owner. It has no business
-- standing in the way of a course being purged, so it steps aside once the course
-- is closed or its row is already gone.
create or replace function public.protect_last_course_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare removes_owner boolean;
begin
  if not exists (
    select 1 from public.courses
    where id = old.course_id and account_status <> 'closed'
  ) then
    return old;
  end if;

  if tg_op='DELETE' then removes_owner:=true; else removes_owner:=new.role<>'course_owner' or new.status<>'active'; end if;
  if old.role='course_owner' and old.status='active' and removes_owner
    and (select count(*) from public.course_memberships where course_id=old.course_id and role='course_owner' and status='active')<=1
  then raise exception 'A course must always have an active owner'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $fn$;

create or replace function public.close_course(p_course_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  actor_id uuid := (select auth.uid());
  course_name text;
begin
  if not public.has_course_role(p_course_id, array['course_owner']) then
    raise exception 'Course owner access required';
  end if;
  select name into course_name from public.courses
    where id = p_course_id and account_status <> 'closed' for update;
  if course_name is null then raise exception 'Open course not found'; end if;

  update public.courses
  set account_status = 'closed', closed_at = now(), updated_at = now()
  where id = p_course_id;

  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'course.closed','course',p_course_id::text,
    jsonb_build_object('course_name',course_name));
  return true;
end $fn$;

create or replace function public.reopen_course(p_course_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  actor_id uuid := (select auth.uid());
  course_name text;
begin
  if not public.has_course_role(p_course_id, array['course_owner']) then
    raise exception 'Course owner access required';
  end if;
  select name into course_name from public.courses
    where id = p_course_id and account_status = 'closed' for update;
  if course_name is null then raise exception 'Closed course not found'; end if;

  update public.courses
  set account_status = 'active', closed_at = null, updated_at = now()
  where id = p_course_id;

  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'course.reopened','course',p_course_id::text,
    jsonb_build_object('course_name',course_name));
  return true;
end $fn$;

-- Destroys the workspace and everything in it. Refuses on a course that has not
-- been closed first, so this can never be one misplaced click.
create or replace function public.purge_course(p_course_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  actor_id uuid := (select auth.uid());
  course_name text;
begin
  if not public.has_course_role(p_course_id, array['course_owner']) then
    raise exception 'Course owner access required';
  end if;
  select name into course_name from public.courses
    where id = p_course_id and account_status = 'closed' for update;
  if course_name is null then
    raise exception 'The workspace must be closed before it can be permanently removed';
  end if;

  -- Written before the delete, because the course reference is set to null by the
  -- cascade and the row itself is about to be gone.
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'course.purged','course',p_course_id::text,
    jsonb_build_object('course_name',course_name));

  delete from public.courses where id = p_course_id;
  return true;
end $fn$;

create or replace function public.purge_expired_trash()
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  league_count integer;
  course_count integer;
begin
  with deleted as (
    delete from public.leagues
    where status = 'trashed' and trashed_at < (now() - interval '30 days')
    returning id
  )
  select count(*) into league_count from deleted;

  with deleted as (
    delete from public.courses
    where account_status = 'closed' and closed_at < (now() - interval '30 days')
    returning id
  )
  select count(*) into course_count from deleted;

  return coalesce(league_count, 0) + coalesce(course_count, 0);
end $fn$;

-- These follow save_score_batch and archive_league rather than trash_league:
-- reachable by a signed-in user, with the function enforcing the owner check
-- itself instead of trusting a route to have done it.
--
-- The first cut of this migration granted them to service_role alone, the way
-- trash_league is granted, and that made them unusable -- has_course_role reads
-- auth.uid(), a service_role call has none, and every call was refused.
-- trash_league gets away with that grant only because it has no role check at
-- all and leans entirely on its route.
revoke execute on function public.close_course(uuid) from public, anon;
revoke execute on function public.reopen_course(uuid) from public, anon;
revoke execute on function public.purge_course(uuid) from public, anon;
grant execute on function public.close_course(uuid) to authenticated;
grant execute on function public.reopen_course(uuid) to authenticated;
grant execute on function public.purge_course(uuid) to authenticated;

update public.app_metadata set schema_version=24,
  migration_name='202608300009_birvo_a_course_can_be_closed_and_purged',updated_at=now()
  where key='database';

commit;
