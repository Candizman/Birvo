-- Let a course manager choose the league's handicap method from the UI.
--
-- Written 2026-08-30 alongside 202608300002. Without this the method existed as a
-- column with a sensible default and no way for a customer to change it, which
-- is the same as it not existing.
--
-- Frozen once play starts, for the same reason update_league_format freezes the
-- game format: a league cannot change how it scores in the middle of its own
-- season. Past handicap_used snapshots are stored per score and would survive,
-- but every future week would be computed on different rules than the weeks
-- already played, which is exactly the argument nobody wants at the bar.
begin;

create or replace function public.set_league_handicap_method(
  p_course_id uuid,
  p_league_id uuid,
  p_method text,
  p_allowance_percent integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  previous_method text;
  previous_allowance smallint;
begin
  if not public.has_course_role(p_course_id, array['course_owner','course_admin']) then
    raise exception 'Course manager access required';
  end if;
  if p_method not in ('league_average','best_of','whs') then
    raise exception 'Invalid handicap method';
  end if;
  if p_allowance_percent not between 50 and 100 then
    raise exception 'Handicap allowance must be between 50 and 100 percent';
  end if;

  select l.handicap_method, l.handicap_allowance_percent
    into previous_method, previous_allowance
  from public.leagues l
  where l.id = p_league_id and l.course_id = p_course_id
    and l.status not in ('trashed','archived')
  for update;
  if previous_method is null then raise exception 'League not found'; end if;

  if exists(
    select 1 from public.scores s
    join public.matches m on m.id = s.match_id
    where m.league_id = p_league_id
  ) then
    raise exception 'The handicap method cannot change after score entry begins';
  end if;

  update public.leagues
  set handicap_method = p_method,
      handicap_allowance_percent = p_allowance_percent,
      updated_at = now()
  where id = p_league_id;

  insert into public.audit_events(course_id, actor_user_id, action, target_type, target_id, metadata)
  values (p_course_id, actor_id, 'league.handicap_method.updated', 'league', p_league_id::text,
    jsonb_build_object(
      'from', previous_method, 'to', p_method,
      'from_allowance', previous_allowance, 'to_allowance', p_allowance_percent));
end $$;

revoke execute on function public.set_league_handicap_method(uuid,uuid,text,integer) from public, anon;
grant execute on function public.set_league_handicap_method(uuid,uuid,text,integer) to authenticated;

update public.app_metadata set schema_version=18,
  migration_name='202608300003_birvo_set_league_handicap_method_rpc',updated_at=now()
  where key='database';

commit;
