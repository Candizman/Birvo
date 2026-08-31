-- Birvo reconciliation: resolve or discard a disputed score.
--
-- Reviewed on 2026-08-29 during first execution against PostgreSQL. The column
-- references here were already correct. Two gaps were closed: p_actor_id was
-- accepted but never recorded, and delete_disputed_score removed a score with no
-- trace at all -- the audit_score_change trigger fires only on UPDATE, so a
-- deleted scorecard vanished silently from an otherwise audited system.

-- 1. Resolve Score RPC
create or replace function public.resolve_score(
  p_score_id uuid,
  p_course_id uuid,
  p_actor_id uuid,
  p_handicap_used numeric(4,1),
  p_gross_score integer,
  p_net_score integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_score public.scores;
  target_match public.matches;
  new_handicap numeric(4,1);
begin
  -- Validate tenant boundary and get score data
  select s.* into target_score
  from public.scores s
  join public.matches m on m.id = s.match_id
  join public.leagues l on l.id = m.league_id
  where s.id = p_score_id and l.course_id = p_course_id;

  if not found then
    raise exception 'Unauthorized operation or score record not found.';
  end if;

  select * into target_match from public.matches where id = target_score.match_id;

  if target_match.locked_at is not null then
    raise exception 'This round is locked. Use the score correction workflow.';
  end if;

  -- 1. Repair score record
  update public.scores
  set handicap_used = p_handicap_used,
      net_score = p_net_score,
      gross_score = p_gross_score,
      reconciliation_status = 'ok',
      modified_by_user_id = p_actor_id,
      updated_at = now()
  where id = p_score_id;

  insert into public.score_audit_logs (
    course_id, score_id, old_gross, new_gross, reason, modified_by_user_id
  ) values (
    target_score.course_id, p_score_id, target_score.gross_score, p_gross_score,
    'Reconciliation: disputed score resolved by course management', p_actor_id
  );

  -- 2. Recalculate team handicap
  select greatest(0, round(((avg(s.gross_score)::numeric) - 36) * 0.8, 1)) into new_handicap
  from public.scores s
  join public.matches m on m.id = s.match_id
  where s.team_id = target_score.team_id
    and m.week_number <= target_match.week_number
    and s.reconciliation_status <> 'needs_review';

  update public.teams
  set current_handicap = coalesce(new_handicap, 0),
      updated_at = now()
  where id = target_score.team_id;

  return true;
end;
$$;

grant execute on function public.resolve_score(uuid, uuid, uuid, numeric, integer, integer) to service_role;

-- 2. Delete Disputed Score RPC
create or replace function public.delete_disputed_score(
  p_score_id uuid,
  p_course_id uuid,
  p_actor_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_score public.scores;
  target_match public.matches;
  removed_count integer;
begin
  -- Validate tenant boundary and get score data
  select s.* into target_score
  from public.scores s
  join public.matches m on m.id = s.match_id
  join public.leagues l on l.id = m.league_id
  where s.id = p_score_id and l.course_id = p_course_id;

  if not found then
    raise exception 'Unauthorized operation or score record not found.';
  end if;

  select * into target_match from public.matches where id = target_score.match_id;

  if target_match.locked_at is not null then
    raise exception 'A score from a locked round cannot be deleted. Use the score correction workflow.';
  end if;

  delete from public.scores
  where id = p_score_id and reconciliation_status = 'needs_review';
  get diagnostics removed_count = row_count;

  if removed_count = 0 then
    raise exception 'Only a score flagged for review can be deleted.';
  end if;

  insert into public.audit_events (
    course_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_score.course_id, p_actor_id, 'score.disputed.deleted', 'score', p_score_id::text,
    jsonb_build_object(
      'team_id', target_score.team_id,
      'match_id', target_score.match_id,
      'gross_score', target_score.gross_score,
      'net_score', target_score.net_score
    )
  );

  return true;
end;
$$;

grant execute on function public.delete_disputed_score(uuid, uuid, uuid) to service_role;

update public.app_metadata set schema_version=7,
  migration_name='202608260004_birvo_reconciliation',updated_at=now()
  where key='database';
