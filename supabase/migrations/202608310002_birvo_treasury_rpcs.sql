-- Let a course manager set the season due amount, the skins entry fee, and
-- mark a team's dues paid, unpaid or waived.
--
-- Written 2026-08-31 alongside 202608310001. Neither figure is frozen once
-- play starts, unlike the game format or handicap method: changing what dues
-- cost or whether a team paid does not rewrite any week that has already been
-- scored, so there is nothing here for a season in progress to protect.
begin;

create or replace function public.set_league_treasury_settings(
  p_course_id uuid,
  p_league_id uuid,
  p_dues_amount_cents integer,
  p_skins_entry_fee_cents integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  previous_dues integer;
  previous_fee integer;
begin
  if not public.has_course_role(p_course_id, array['course_owner','course_admin']) then
    raise exception 'Course manager access required';
  end if;
  if p_dues_amount_cents < 0 or p_skins_entry_fee_cents < 0 then
    raise exception 'Treasury amounts cannot be negative';
  end if;

  select dues_amount_cents, skins_entry_fee_cents into previous_dues, previous_fee
  from public.leagues
  where id = p_league_id and course_id = p_course_id
    and status not in ('trashed','archived')
  for update;
  if previous_dues is null then raise exception 'League not found'; end if;

  update public.leagues
  set dues_amount_cents = p_dues_amount_cents,
      skins_entry_fee_cents = p_skins_entry_fee_cents,
      updated_at = now()
  where id = p_league_id;

  insert into public.audit_events(course_id, actor_user_id, action, target_type, target_id, metadata)
  values (p_course_id, actor_id, 'league.treasury_settings.updated', 'league', p_league_id::text,
    jsonb_build_object(
      'from_dues_amount_cents', previous_dues, 'to_dues_amount_cents', p_dues_amount_cents,
      'from_skins_entry_fee_cents', previous_fee, 'to_skins_entry_fee_cents', p_skins_entry_fee_cents));
end $$;

revoke execute on function public.set_league_treasury_settings(uuid,uuid,integer,integer) from public, anon;
grant execute on function public.set_league_treasury_settings(uuid,uuid,integer,integer) to authenticated;

-- Marking a team's dues paid, unpaid or waived. A course keeps this by hand --
-- cash and checks at the counter -- so the record is only ever as good as what
-- the admin actually types in.
create or replace function public.set_team_dues_status(
  p_course_id uuid,
  p_team_id uuid,
  p_status text,
  p_method text default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  previous_status text;
begin
  if not public.has_course_role(p_course_id, array['course_owner','course_admin']) then
    raise exception 'Course manager access required';
  end if;
  if p_status not in ('unpaid','paid','waived') then
    raise exception 'Invalid dues status';
  end if;
  if p_status = 'paid' and (p_method is null or p_method not in ('cash','check','other')) then
    raise exception 'A paid team needs a payment method';
  end if;

  select dues_status into previous_status
  from public.teams
  where id = p_team_id and course_id = p_course_id
  for update;
  if previous_status is null then raise exception 'Team not found'; end if;

  update public.teams
  set dues_status = p_status,
      dues_paid_method = case when p_status = 'paid' then p_method else null end,
      dues_paid_at = case when p_status = 'paid' then now() else null end,
      dues_note = nullif(trim(coalesce(p_note, '')), ''),
      updated_at = now()
  where id = p_team_id;

  insert into public.audit_events(course_id, actor_user_id, action, target_type, target_id, metadata)
  values (p_course_id, actor_id, 'team.dues_status.updated', 'team', p_team_id::text,
    jsonb_build_object('from', previous_status, 'to', p_status, 'method', p_method));
end $$;

revoke execute on function public.set_team_dues_status(uuid,uuid,text,text,text) from public, anon;
grant execute on function public.set_team_dues_status(uuid,uuid,text,text,text) to authenticated;

update public.app_metadata set schema_version=27,
  migration_name='202608310002_birvo_treasury_rpcs',updated_at=now()
  where key='database';

commit;
