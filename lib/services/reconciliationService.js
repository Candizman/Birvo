const { calculateNewHandicap } = require('../domain/handicap');
const dataBackend = require('../data/backend');
const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const reconciliationRepository = require('../data/supabase/reconciliationRepository');

async function getScoresPendingReconciliationAsync(db, adminClient, leagueId) {
  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    return reconciliationRepository.getScoresPendingReconciliation(adminClient, leagueId);
  }
  
  return db.prepare(`
    SELECT s.id, s.gross_score, t.name as team_name, t.current_handicap, m.week_number
    FROM scores s
    JOIN matches m ON s.match_id = m.id
    JOIN teams t ON s.team_id = t.id
    WHERE m.league_id = ? AND s.reconciliation_status = 'needs_review'
  `).all(leagueId);
}

async function resolveScoreAsync(db, adminClient, { scoreId, courseId, actorUserId, handicapUsed, grossScore }) {
  const netScore = grossScore - handicapUsed;

  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    return reconciliationRepository.resolveDisputedScore(adminClient, {
      scoreId, courseId, actorUserId, handicapUsed, grossScore, netScore
    });
  }

  // SQLite implementation
  const scoreRow = db.prepare(`
    SELECT s.team_id, s.match_id, m.league_id, m.locked_at, l.course_id
    FROM scores s
    JOIN matches m ON s.match_id = m.id
    JOIN leagues l ON m.league_id = l.id
    WHERE s.id = ?
  `).get(scoreId);

  if (!scoreRow || scoreRow.course_id !== courseId) {
    throw new Error('Unauthorized operation or score record not found.');
  }
  if (scoreRow.locked_at) throw new Error('This round is locked. Use the score correction workflow.');

  db.transaction(() => {
    // 1. Repair score record
    db.prepare(`
      UPDATE scores
      SET handicap_used = ?, net_score = ?, gross_score = ?, reconciliation_status = 'ok'
      WHERE id = ?
    `).run(handicapUsed, netScore, grossScore, scoreId);

    // 2. Recalculate team handicap
    const matchRow = db.prepare('SELECT week_number FROM matches WHERE id = ?').get(scoreRow.match_id);

    const allPastScores = db.prepare(`
      SELECT gross_score FROM scores
      JOIN matches ON scores.match_id = matches.id
      WHERE team_id = ? AND matches.week_number <= ? AND scores.reconciliation_status != 'needs_review'
    `).all(scoreRow.team_id, matchRow.week_number).map(row => row.gross_score);

    const newHandicap = calculateNewHandicap(allPastScores);
    db.prepare('UPDATE teams SET current_handicap = ? WHERE id = ?').run(newHandicap, scoreRow.team_id);
  })();

  return { success: true };
}

async function deleteScoreAsync(db, adminClient, { scoreId, courseId, actorUserId }) {
  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    return reconciliationRepository.deleteDisputedScore(adminClient, {
      scoreId, courseId, actorUserId
    });
  }

  // SQLite implementation
  const scoreRow = db.prepare(`
    SELECT s.id, m.locked_at, l.course_id
    FROM scores s
    JOIN matches m ON s.match_id = m.id
    JOIN leagues l ON m.league_id = l.id
    WHERE s.id = ?
  `).get(scoreId);

  if (!scoreRow || scoreRow.course_id !== courseId) {
    throw new Error('Unauthorized operation or score record not found.');
  }
  if (scoreRow.locked_at) throw new Error('A score from a locked round cannot be deleted. Use the score correction workflow.');

  db.prepare("DELETE FROM scores WHERE id = ? AND reconciliation_status = 'needs_review'").run(scoreId);
  return { success: true };
}

module.exports = {
  getScoresPendingReconciliationAsync,
  resolveScoreAsync,
  deleteScoreAsync
};
