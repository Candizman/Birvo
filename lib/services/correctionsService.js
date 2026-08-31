/**
 * Reads for the score-correction console. Both RPCs enforce a course role of
 * their own, so a caller cannot reach another tenant's scores through them.
 */
async function getCorrectionsAdminSnapshot(client, courseId, leagueId) {
  const { data: lockedScores, error: lockedError } = await client.rpc(
    'get_locked_scores_for_corrections', { p_course_id: courseId, p_league_id: leagueId }
  );
  if (lockedError) throw lockedError;

  const { data: requests, error: requestsError } = await client.rpc(
    'get_score_correction_requests_for_admin', { p_course_id: courseId, p_league_id: leagueId }
  );
  if (requestsError) throw requestsError;

  return {
    lockedScores: lockedScores || [],
    requests: requests || []
  };
}

module.exports = {
  getCorrectionsAdminSnapshot
};
