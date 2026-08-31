/**
 * Round-close readiness.
 *
 * Pure: given the round's match row, its active team count and its scorecards,
 * reports whether the round can be locked and what is still missing. The same
 * rules are enforced again inside lock_round_and_advance in PostgreSQL — this
 * exists so the dashboard can show the blockers before the admin clicks.
 */
function buildRoundCloseReadiness({ match = null, activeTeams = 0, scores = [] }) {
  const entered = scores.length;
  const unattested = scores.filter(score => !['attested', 'approved'].includes(score.attestation_status)).length;
  const needsReview = scores.filter(score => score.reconciliation_status === 'needs_review').length;
  const blockers = [];
  if (!match) blockers.push('The round has not been scheduled.');
  if (activeTeams < 1) blockers.push('The league has no active teams.');
  if (entered !== activeTeams) blockers.push(`${Math.max(0, activeTeams - entered)} scorecard(s) are missing.`);
  if (unattested > 0) blockers.push(`${unattested} scorecard(s) still need attestation.`);
  if (needsReview > 0) blockers.push(`${needsReview} scorecard(s) require reconciliation.`);
  if (match?.locked_at) blockers.push('This round is already locked.');
  return { match, activeTeams, entered, unattested, needsReview, canLock: blockers.length === 0, blockers };
}

module.exports = { buildRoundCloseReadiness };
