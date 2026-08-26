'use strict';
const { getGhostScore } = require('../ghostLogic');
const { writeAuditEvent } = require('./auditService');

function getMissingScorecards(db, { courseId, leagueId, weekNumber }) {
  const league = db.prepare("SELECT id, current_week FROM leagues WHERE id = ? AND course_id = ? AND status = 'active'").get(leagueId, courseId);
  if (!league) return { matchId: null, missingTeams: [], weekNumber, totalTeams: 0 };
  const teams = db.prepare(`
    SELECT t.id, t.name, t.current_handicap
    FROM teams t JOIN leagues l ON l.id=t.league_id
    WHERE t.league_id=? AND l.course_id=? AND t.status='active' ORDER BY t.name
  `).all(leagueId, courseId);
  const match = db.prepare('SELECT id FROM matches WHERE league_id = ? AND week_number = ?').get(leagueId, weekNumber);
  if (!match) return { matchId: null, missingTeams: teams, weekNumber, totalTeams: teams.length };
  const scoredTeamIds = new Set(db.prepare('SELECT team_id FROM scores WHERE match_id = ?').all(match.id).map(r => r.team_id));
  const missingTeams = teams.filter(t => !scoredTeamIds.has(t.id));
  return { matchId: match.id, missingTeams, weekNumber, totalTeams: teams.length };
}

function applyGhostPenalty(db, { courseId, leagueId, weekNumber, teamId, actorUserId = 'system' }) {
  return db.transaction(() => {
    const league = db.prepare("SELECT id, current_week FROM leagues WHERE id=? AND course_id=? AND status='active'").get(leagueId, courseId);
    if (!league) throw new Error('Active league not found.');
    if (Number(weekNumber) !== Number(league.current_week)) throw new Error('Ghost scores can be applied only to the current week.');
    const team = db.prepare(`
      SELECT t.id,t.name,t.current_handicap FROM teams t
      JOIN leagues l ON l.id=t.league_id
      WHERE t.id=? AND t.league_id=? AND l.course_id=? AND t.status='active'
    `).get(teamId, leagueId, courseId);
    if (!team) throw new Error('Team not found or inactive.');
    let match = db.prepare('SELECT id, status, locked_at FROM matches WHERE league_id = ? AND week_number = ?').get(leagueId, weekNumber);
    if (!match) {
      const id = db.prepare("INSERT INTO matches (league_id, week_number, status) VALUES (?, ?, 'open')").run(leagueId, weekNumber).lastInsertRowid;
      match = { id, status: 'open', locked_at: null };
    }
    if (match.locked_at || ['locked', 'rained_out', 'cancelled'].includes(match.status)) throw new Error('This round does not accept ghost scores.');
    const existing = db.prepare('SELECT id, is_ghost FROM scores WHERE match_id=? AND team_id=?').get(match.id, teamId);
    if (existing && !existing.is_ghost) throw new Error('A submitted scorecard cannot be replaced with a ghost score.');
    const ghostGross = getGhostScore(db, leagueId, weekNumber);
    const netScore = ghostGross - team.current_handicap;
    const result = db.prepare(`INSERT INTO scores (match_id, team_id, gross_score, handicap_used, net_score, reconciliation_status, attestation_status, is_ghost)
      VALUES (?, ?, ?, ?, ?, 'ok', 'approved', 1)
      ON CONFLICT(match_id, team_id) DO UPDATE SET
        gross_score=excluded.gross_score,handicap_used=excluded.handicap_used,net_score=excluded.net_score,
        reconciliation_status='ok',attestation_status='approved',is_ghost=1,updated_at=CURRENT_TIMESTAMP
    `).run(match.id, teamId, ghostGross, team.current_handicap, netScore);
    const scoreId = existing?.id || Number(result.lastInsertRowid);
    writeAuditEvent(db, {
      courseId, actorUserId, action: 'score.ghost.applied', targetType: 'score', targetId: scoreId,
      metadata: { leagueId, teamId, teamName: team.name, weekNumber, ghostGross, netScore },
    });
    return { success: true, scoreId, ghostGross, netScore };
  })();
}

module.exports = { getMissingScorecards, applyGhostPenalty };
