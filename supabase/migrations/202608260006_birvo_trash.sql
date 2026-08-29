-- Trash / Soft-delete operations
create or replace function public.trash_league(p_league_id uuid, p_course_id uuid) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.leagues
  set status = 'trashed', trashed_at = now(), updated_at = now()
  where id = p_league_id and course_id = p_course_id and status != 'trashed';
  
  return found;
end;
$$;

create or replace function public.restore_league(p_league_id uuid, p_course_id uuid) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.leagues
  set status = 'active', trashed_at = null, updated_at = now()
  where id = p_league_id and course_id = p_course_id and status = 'trashed';
  
  return found;
end;
$$;

-- Scheduled permanent deletion with integrity checks
create or replace function public.purge_expired_trash() returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with deleted as (
    delete from public.leagues
    where status = 'trashed' and trashed_at < (now() - interval '30 days')
    returning id
  )
  select count(*) into v_count from deleted;

  return coalesce(v_count, 0);
end;
$$;

grant execute on function public.trash_league(uuid, uuid) to service_role;
grant execute on function public.restore_league(uuid, uuid) to service_role;
grant execute on function public.purge_expired_trash() to service_role;
