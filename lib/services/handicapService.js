const dataBackend = require('../data/backend');
const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const handicapRepository = require('../data/supabase/handicapRepository');

async function getHandicapViewDataAsync(db, adminClient, leagueId) {
  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    const [teams, auditLogs] = await Promise.all([
      handicapRepository.getTeamsForHandicapView(adminClient, leagueId),
      handicapRepository.getHandicapAuditLogs(adminClient, leagueId)
    ]);
    return { teams, auditLogs };
  }
  
  const teams = db.prepare(`
    SELECT t.id, t.name, t.current_handicap, t.low_handicap_365, t.ghin_number
    FROM teams t
    WHERE t.league_id = ? AND t.status = 'active'
    ORDER BY t.current_handicap ASC
  `).all(leagueId);

  const auditLogs = db.prepare(`
    SELECT
      hal.*,
      t.name as team_name
    FROM handicap_audit_logs hal
    JOIN teams t ON hal.team_id = t.id
    WHERE t.league_id = ?
    ORDER BY hal.created_at DESC
    LIMIT 100
  `).all(leagueId);

  return { teams, auditLogs };
}

async function adjustHandicapManuallyAsync(db, adminClient, { teamId, courseId, actorEmail, newHandicap, ghin, reason }) {
  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    return handicapRepository.adjustHandicapManually(adminClient, {
      teamId, courseId, actorEmail, newHandicap, ghin, reason
    });
  }

  // SQLite fallback
  const team = db.prepare(`
    SELECT t.id, t.current_handicap, l.course_id
    FROM teams t
    JOIN leagues l ON t.league_id = l.id
    WHERE t.id = ?
  `).get(teamId);

  if (!team || team.course_id !== courseId) {
    throw new Error("Unauthorized or team not found.");
  }

  db.transaction(() => {
    // 1. Record an audit log entry.
    db.prepare(`
      INSERT INTO handicap_audit_logs (team_id, old_handicap, new_handicap, change_type, reason, modified_by)
      VALUES (?, ?, ?, 'referee_manual', ?, ?)
    `).run(teamId, team.current_handicap, newHandicap, reason, actorEmail);

    // 2. Update the team.
    db.prepare(`
      UPDATE teams SET
        current_handicap = ?,
        ghin_number = COALESCE(?, ghin_number)
      WHERE id = ?
    `).run(newHandicap, ghin || null, teamId);
  })();

  return { success: true };
}

module.exports = {
  getHandicapViewDataAsync,
  adjustHandicapManuallyAsync
};
