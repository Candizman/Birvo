const { calculateNewHandicap } = require('../domain/handicap');

function saveScoresBatch(db, leagueId, weekNumber, scoresData, { actorUserId = 'system' } = {}) {
  return db.transaction(() => {
    let match = db.prepare('SELECT id, status, locked_at FROM matches WHERE league_id = ? AND week_number = ?').get(leagueId, weekNumber);
    if (!match) {
      const matchId = db.prepare('INSERT INTO matches (league_id, week_number) VALUES (?, ?)').run(leagueId, weekNumber).lastInsertRowid;
      match = { id: matchId, status: 'pending' };
    }
    if (match.locked_at || match.status === 'locked') {
      throw new Error('This round is locked. Submit a score correction request instead.');
    }

    for (const { teamId, grossScore } of scoresData) {
      if (!Number.isInteger(grossScore) || grossScore < 1 || grossScore > 200) {
        throw new Error(`Team ${teamId}: Invalid gross score.`);
      }

      const team = db.prepare('SELECT current_handicap, status FROM teams WHERE id = ? AND league_id = ?').get(teamId, leagueId);
      if (!team || team.status !== 'active') {
        throw new Error(`Team ${teamId}: Invalid or inactive team.`);
      }

      const handicapUsed = team.current_handicap;
      const netScore = grossScore - handicapUsed;

      const existingScore = db.prepare('SELECT id, gross_score FROM scores WHERE match_id = ? AND team_id = ?').get(match.id, teamId);
      // Duplicate-score protection: preserve the handicap snapshot on conflict.
      db.prepare(`
        INSERT INTO scores (match_id, team_id, gross_score, handicap_used, net_score)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(match_id, team_id) DO UPDATE SET
          gross_score = excluded.gross_score,
          net_score = excluded.gross_score - scores.handicap_used,
          updated_at = CURRENT_TIMESTAMP
      `).run(match.id, teamId, grossScore, handicapUsed, netScore);

      if (existingScore && existingScore.gross_score !== grossScore) {
        db.prepare(`
          INSERT INTO score_audit_logs (score_id, old_gross, new_gross, reason, modified_by)
          VALUES (?, ?, ?, 'Administrative score correction before round lock', ?)
        `).run(existingScore.id, existingScore.gross_score, grossScore, actorUserId);
      }

      // Update the handicap for future weeks using only the current and prior weeks.
      const allPastScores = db.prepare(`
        SELECT gross_score FROM scores
        JOIN matches ON scores.match_id = matches.id
        WHERE team_id = ? AND matches.week_number <= ? AND scores.reconciliation_status != 'needs_review'
      `).all(teamId, weekNumber).map(row => row.gross_score);

      const newHandicap = calculateNewHandicap(allPastScores);
      db.prepare('UPDATE teams SET current_handicap = ? WHERE id = ?').run(newHandicap, teamId);
    }
    return { success: true };
  })();
}

async function submitPlayerGrossScoreAsync(client, teamId, grossScore) {
  const dataBackend = require('../data/backend');
  const { DATA_BACKENDS, resolveDataBackend } = dataBackend;

  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    const operationsRepository = require('../data/supabase/operationsRepository');
    return await operationsRepository.submitPlayerGrossScore(client, { teamId, grossScore });
  }

  const db = require('../database');
  const team = db.prepare('SELECT league_id FROM teams WHERE id = ?').get(teamId);
  if (!team) throw new Error('Team not found');

  const leagueId = team.league_id;
  const league = db.prepare("SELECT current_week FROM leagues WHERE id = ?").get(leagueId);
  const weekNumber = league ? league.current_week : 1;
  saveScoresBatch(db, leagueId, weekNumber, [{ teamId, grossScore }]);
  return true;
}

module.exports = { saveScoresBatch, submitPlayerGrossScoreAsync };
