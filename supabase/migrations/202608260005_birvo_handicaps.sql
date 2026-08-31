-- Manual handicap adjustment RPC.
--
-- Corrected on 2026-08-29 during first execution against PostgreSQL. The original
-- revision had never been run and wrote handicap_audit_logs(modified_by), which
-- does not exist, while omitting course_id -- a NOT NULL column that the
-- ensure_tenant_consistency trigger also checks. It additionally passed an email
-- address into what is a uuid column. The actor is now resolved to a real user id
-- through course_memberships, with the email preserved in the reason text.
begin;

create or replace function public.adjust_handicap_manually(
  p_team_id uuid,
  p_course_id uuid,
  p_actor_email text,
  p_new_handicap numeric(4,1),
  p_ghin text,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_team public.teams;
  old_hi numeric(4,1);
  actor_user_id uuid;
  normalized_email text := lower(trim(coalesce(p_actor_email,'')));
begin
  select t.* into target_team
  from public.teams t
  join public.leagues l on t.league_id = l.id
  where t.id = p_team_id and l.course_id = p_course_id;

  if not found then
    raise exception 'Unauthorized or team not found.';
  end if;

  if p_new_handicap is null or p_new_handicap not between -10 and 54 then
    raise exception 'Handicap must be between -10 and 54.';
  end if;

  old_hi := target_team.current_handicap;

  select user_id into actor_user_id
  from public.course_memberships
  where course_id = p_course_id and lower(email) = normalized_email and status = 'active'
  limit 1;

  insert into public.handicap_audit_logs (
    course_id, team_id, old_handicap, new_handicap, differential, change_type, reason, modified_by_user_id
  ) values (
    target_team.course_id, p_team_id, old_hi, p_new_handicap, p_new_handicap - old_hi, 'referee_manual',
    coalesce(nullif(trim(p_reason),''), 'Manual adjustment')
      || case when normalized_email <> '' then ' (by ' || normalized_email || ')' else '' end,
    actor_user_id
  );

  update public.teams set
    current_handicap = p_new_handicap,
    ghin_number = coalesce(p_ghin, ghin_number),
    updated_at = now()
  where id = p_team_id;

  return true;
end;
$$;

grant execute on function public.adjust_handicap_manually(uuid, uuid, text, numeric, text, text) to service_role;

update public.app_metadata set schema_version=8,
  migration_name='202608260005_birvo_handicaps',updated_at=now()
  where key='database';

commit;
