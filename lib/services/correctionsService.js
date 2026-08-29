const dataBackend = require('../data/backend');
const { DATA_BACKENDS, resolveDataBackend } = dataBackend;

async function getCorrectionsAdminSnapshotAsync(client, courseId, leagueId) {
  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    const { data: lockedScores, error: lockedError } = await client.rpc('get_locked_scores_for_corrections', { p_course_id: courseId, p_league_id: leagueId });
    if (lockedError) throw lockedError;
    const { data: requests, error: requestsError } = await client.rpc('get_score_correction_requests_for_admin', { p_course_id: courseId, p_league_id: leagueId });
    if (requestsError) throw requestsError;
    
    return {
      lockedScores: lockedScores || [],
      requests: requests || []
    };
  }

  const db = require('../database');
  const lockedScores = db.prepare(`SELECT s.id,s.gross_score,m.week_number,t.name AS team_name FROM scores s JOIN matches m ON m.id=s.match_id JOIN leagues l ON l.id=m.league_id JOIN teams t ON t.id=s.team_id WHERE l.course_id=? AND l.id=? AND m.locked_at IS NOT NULL ORDER BY m.week_number DESC,t.name`).all(courseId, leagueId);
  const requests = db.prepare(`SELECT r.*,s.gross_score AS old_gross,m.week_number,t.name AS team_name FROM score_correction_requests r JOIN scores s ON s.id=r.score_id JOIN matches m ON m.id=s.match_id JOIN leagues l ON l.id=m.league_id JOIN teams t ON t.id=s.team_id WHERE r.course_id=? AND l.id=? ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 100`).all(courseId, leagueId);
  
  return { lockedScores, requests };
}

module.exports = {
  getCorrectionsAdminSnapshotAsync
};
