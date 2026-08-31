-- Birvo player self-service extensions: PIN reset, score dispute, automatic badges.
--
-- Corrected on 2026-08-29 during first execution against PostgreSQL. The original
-- revision had never been run and referenced three sets of columns that do not
-- exist: audit_events(user_id, resource_type, resource_id, details),
-- score_audit_logs(modified_by) with no course_id, and a player_badges conflict
-- target of (course_id, team_id, badge_key). All three would have raised at runtime.
begin;

-- 1. Player-initiated PIN reset tokens. Server-mediated only; no anon/authenticated grant.
create table public.team_pin_resets (
  id uuid primary key default extensions.gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index team_pin_resets_lookup_idx
  on public.team_pin_resets(team_id,token_hash) where used_at is null;

alter table public.team_pin_resets enable row level security;
revoke all on public.team_pin_resets from anon,authenticated;
grant select, insert, update on public.team_pin_resets to service_role;

-- 2. RPC to request PIN reset
create or replace function public.request_team_pin_reset(
  p_team_id uuid,
  p_email text,
  p_token_hash text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_email text;
begin
  select contact_email into target_email from public.teams where id = p_team_id and status = 'active';
  if not found or target_email is null then
    return false;
  end if;

  if lower(trim(target_email)) != lower(trim(p_email)) then
    return false;
  end if;

  insert into public.team_pin_resets (team_id, token_hash, expires_at)
  values (p_team_id, p_token_hash, now() + interval '1 hour');

  return true;
end;
$$;

grant execute on function public.request_team_pin_reset(uuid, text, text) to service_role;

-- 3. RPC to execute PIN reset
create or replace function public.execute_team_pin_reset(
  p_team_id uuid,
  p_token_hash text,
  p_new_pin_hash text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  reset_id uuid;
begin
  select id into reset_id
  from public.team_pin_resets
  where team_id = p_team_id
    and token_hash = p_token_hash
    and used_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  if not found then
    return false;
  end if;

  if coalesce(p_new_pin_hash,'') !~ '^scrypt\$[^$]+\$[^$]+$' or length(p_new_pin_hash) > 200 then
    raise exception 'Invalid PIN credential';
  end if;

  update public.teams set pin = p_new_pin_hash, updated_at = now() where id = p_team_id;
  update public.team_pin_resets set used_at = now() where id = reset_id;

  insert into public.audit_events (
    course_id, actor_user_id, action, target_type, target_id, metadata
  )
  select course_id, null, 'team.pin.reset', 'team', p_team_id::text,
    '{"method": "player_email_reset"}'::jsonb
  from public.teams where id = p_team_id;

  return true;
end;
$$;

grant execute on function public.execute_team_pin_reset(uuid, text, text) to service_role;

-- 4. RPC to submit score dispute.
-- The caller is responsible for proving the disputing party is the assigned
-- opponent; this runs as service_role and performs no identity check of its own.
create or replace function public.submit_score_dispute(
  p_score_id uuid,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_score record;
  target_match record;
begin
  select s.id, s.match_id, s.team_id, s.course_id, s.gross_score into target_score
  from public.scores s
  where s.id = p_score_id;

  if not found then
    raise exception 'Score not found';
  end if;

  select locked_at, status into target_match
  from public.matches
  where id = target_score.match_id;

  if target_match.locked_at is not null or target_match.status = 'locked' then
    raise exception 'Round is locked';
  end if;

  update public.scores
  set attestation_status = 'disputed',
      reconciliation_status = 'needs_review',
      updated_at = now()
  where id = p_score_id;

  insert into public.score_audit_logs (
    course_id, score_id, old_gross, new_gross, reason, modified_by_user_id
  ) values (
    target_score.course_id, p_score_id, target_score.gross_score, target_score.gross_score,
    'Opponent dispute: ' || coalesce(nullif(trim(p_reason),''), 'Score disagreement'), null
  );

  return true;
end;
$$;

grant execute on function public.submit_score_dispute(uuid, text) to service_role;

-- 5. Score badge helper (hole in one, albatross, eagle, birdie)
create or replace function public.calculate_score_badge(p_gross integer, p_par integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_gross is null or p_par is null then null
    when p_gross = 1 then 'hole_in_one'
    when p_gross <= p_par - 3 then 'albatross'
    when p_gross = p_par - 2 then 'eagle'
    when p_gross = p_par - 1 then 'birdie'
    else null
  end;
$$;

-- 6. Award badges automatically on hole-by-hole score entry.
-- The par lookup is pinned to the 'Main Course' layout; hole_number alone is not
-- unique across layouts.
create or replace function public.trg_award_score_badges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_score record;
  hole_par integer;
  badge_key text;
  badge_title text;
  badge_icon text;
begin
  select course_id, team_id into target_score
  from public.scores where id = new.score_id;
  if not found then return new; end if;

  select par into hole_par
  from public.course_holes
  where course_id = target_score.course_id
    and layout_name = 'Main Course'
    and hole_number = new.hole_number;

  badge_key := public.calculate_score_badge(new.gross_score, hole_par);

  if badge_key is not null then
    badge_title := case badge_key
      when 'hole_in_one' then 'Hole in One'
      when 'albatross' then 'Albatross'
      when 'eagle' then 'Eagle'
      when 'birdie' then 'Birdie'
    end;

    badge_icon := case badge_key
      when 'hole_in_one' then '⛳'
      when 'albatross' then '🦅'
      when 'eagle' then '🦅'
      when 'birdie' then '🐦'
    end;

    insert into public.player_badges (
      course_id, team_id, badge_key, badge_title, badge_icon, awarded_at
    ) values (
      target_score.course_id, target_score.team_id, badge_key, badge_title, badge_icon, now()
    ) on conflict (team_id, badge_key) do nothing;
  end if;

  return new;
end;
$$;

create trigger award_score_badges_trigger
after insert or update of gross_score on public.score_hole_details
for each row execute function public.trg_award_score_badges();

update public.app_metadata set schema_version=5,
  migration_name='202608260002_birvo_player_extensions',updated_at=now()
  where key='database';

commit;
