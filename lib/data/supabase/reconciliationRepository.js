const { requireUuid } = require('./workspaceRepository');
const { unwrapSupabaseResult } = require('./errors');

async function getScoresPendingReconciliation(client, leagueId) {
  const normalizedLeagueId = requireUuid(leagueId, 'reconciliation list scope');
  const result = await client.from('scores')
    .select('id, gross_score, teams!inner(name, current_handicap), matches!inner(week_number)')
    .eq('matches.league_id', normalizedLeagueId)
    .eq('reconciliation_status', 'needs_review');

  const scores = unwrapSupabaseResult(result, 'read pending reconciliation') || [];
  return scores.map(s => ({
    id: s.id,
    gross_score: Number(s.gross_score),
    team_name: s.teams.name,
    current_handicap: s.teams.current_handicap,
    week_number: s.matches.week_number
  }));
}

async function resolveDisputedScore(client, { scoreId, courseId, actorUserId, handicapUsed, grossScore, netScore }) {
  const result = await client.rpc('resolve_score', {
    p_score_id: requireUuid(scoreId, 'resolve score target'),
    p_course_id: requireUuid(courseId, 'resolve score course'),
    p_actor_id: requireUuid(actorUserId, 'resolve score actor'),
    p_handicap_used: handicapUsed,
    p_gross_score: grossScore,
    p_net_score: netScore
  });
  return unwrapSupabaseResult(result, 'resolve disputed score');
}

async function deleteDisputedScore(client, { scoreId, courseId, actorUserId }) {
  const result = await client.rpc('delete_disputed_score', {
    p_score_id: requireUuid(scoreId, 'delete score target'),
    p_course_id: requireUuid(courseId, 'delete score course'),
    p_actor_id: requireUuid(actorUserId, 'delete score actor')
  });
  return unwrapSupabaseResult(result, 'delete disputed score');
}

module.exports = {
  getScoresPendingReconciliation,
  resolveDisputedScore,
  deleteDisputedScore
};
