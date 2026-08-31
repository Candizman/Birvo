-- A scorecard entered by course staff is attested by the act of entering it.
--
-- Written 2026-08-30, found by trying to close week 1 of a real league.
--
-- THE BUG
--
-- lock_round_and_advance refuses while any card is not 'attested' or 'approved'.
-- Only two things ever set those: attest_player_score, which requires a *player*
-- to sign in and enter their opponent's PIN, and apply_ghost_score, the no-show
-- penalty. save_score_batch left every card it wrote at 'pending'.
--
-- So a course running the traditional paper workflow — the admin types ten signed
-- scorecards into rapid entry, which is the mode Birvo sells as "your players do
-- not need phones" — could enter every card and then never close the round. The
-- season could not advance past week 1. The only escapes were to make every
-- player log in and attest, defeating the entire point of that mode, or to give
-- all ten teams a no-show penalty, destroying the scores.
--
-- THE FIX
--
-- Peer attestation exists to stop players self-reporting unverified rounds. It
-- does not apply when a course owner, manager, assistant or scorekeeper
-- transcribes a signed card: that person already holds authority over the league,
-- and the entry is the verification.
--
-- save_score_batch now writes 'approved' — the value the schema already uses for
-- "accepted by the course", and the one apply_ghost_score writes. The audit trail
-- is unchanged: modified_by_user_id records who entered it, score_audit_logs
-- records every later change, and an opponent can still raise a dispute through
-- submit_score_dispute, which flips the card to 'disputed' and 'needs_review'.
--
-- Player-submitted cards are untouched. submit_player_gross_score and
-- submit_player_hole_scorecard still write 'pending' and still require the
-- opponent's attestation.
begin;

do $outer$
declare
  def text;
  patched text;
  target regprocedure := 'public.save_score_batch(uuid,uuid,integer,jsonb)'::regprocedure;
begin
  def := pg_get_functiondef(target);

  patched := replace(def,
    'insert into public.scores(
      course_id,match_id,team_id,gross_score,handicap_used,net_score,modified_by_user_id
    ) values(
      p_course_id,target_match.id,target_team.id,gross,target_team.current_handicap,
      gross-target_team.current_handicap,actor_id
    ) on conflict(match_id,team_id) do update set
      gross_score=excluded.gross_score,
      net_score=excluded.gross_score-public.scores.handicap_used,
      modified_by_user_id=actor_id,
      updated_at=now()',
    'insert into public.scores(
      course_id,match_id,team_id,gross_score,handicap_used,net_score,
      attestation_status,modified_by_user_id
    ) values(
      p_course_id,target_match.id,target_team.id,gross,target_team.current_handicap,
      gross-target_team.current_handicap,''approved'',actor_id
    ) on conflict(match_id,team_id) do update set
      gross_score=excluded.gross_score,
      net_score=excluded.gross_score-public.scores.handicap_used,
      attestation_status=''approved'',
      modified_by_user_id=actor_id,
      updated_at=now()');

  if patched = def then
    raise exception 'save_score_batch did not contain the expected score upsert';
  end if;
  if patched not like '%attestation_status=''approved''%' then
    raise exception 'save_score_batch still leaves staff-entered cards unattested';
  end if;

  execute patched;
end $outer$;

grant execute on function public.save_score_batch(uuid,uuid,integer,jsonb) to authenticated;

update public.app_metadata set schema_version=16,
  migration_name='202608300001_birvo_staff_entry_is_its_own_attestation',updated_at=now()
  where key='database';

commit;
