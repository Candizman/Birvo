-- Manual handicap adjustment RPC
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
begin
  select t.* into target_team
  from public.teams t
  join public.leagues l on t.league_id = l.id
  where t.id = p_team_id and l.course_id = p_course_id;

  if not found then
    raise exception 'Unauthorized or team not found.';
  end if;

  old_hi := target_team.current_handicap;

  -- Insert audit log
  insert into public.handicap_audit_logs (team_id, old_handicap, new_handicap, change_type, reason, modified_by)
  values (p_team_id, old_hi, p_new_handicap, 'referee_manual', p_reason, p_actor_email);

  -- Update team
  update public.teams set
    current_handicap = p_new_handicap,
    ghin_number = coalesce(p_ghin, ghin_number),
    updated_at = now()
  where id = p_team_id;

  return true;
end;
$$;

grant execute on function public.adjust_handicap_manually(uuid, uuid, text, numeric, text, text) to service_role;
