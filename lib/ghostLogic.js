'use strict';
/**
 * Ghost Score Logic
 *
 * Returns the league's average gross score for a week when a team did not
 * play or joined the league later.
 *
 * This avoids awarding an unfair forfeit and keeps late entries from being
 * unfairly left behind.
 */

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} leagueId
 * @param {number} weekNumber
 * @returns {number} Ghost gross score (rounded average)
 */
function getGhostScore(db, leagueId, weekNumber) {
  const scoreColumns = db.pragma('table_info(scores)').map(column => column.name);
  const realScoreFilter = scoreColumns.includes('is_ghost') ? 'AND s.is_ghost = 0' : '';
  const scores = db.prepare(`
    SELECT s.gross_score
    FROM scores s
    JOIN matches m ON s.match_id = m.id
    WHERE m.league_id = ? AND m.week_number = ?
      AND s.reconciliation_status != 'needs_review'
      ${realScoreFilter}
  `).all(leagueId, weekNumber);

  // Return the standard 9-hole par when nobody played that week.
  if (!scores || scores.length === 0) return 36;

  const total = scores.reduce((sum, row) => sum + row.gross_score, 0);
  const average = total / scores.length;

  return Math.round(average);
}

/**
 * Calculates league-average points for weeks missed by teams that joined
 * mid-season (Late Entry / Average Ghost rule).
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} leagueId
 * @param {number} teamJoinedWeek  - First week in which the team actually played
 * @param {number} totalActiveTeams
 * @returns {{ weekNumber: number, ghostGross: number }[]}
 */
function getLateEntryGhostWeeks(db, leagueId, teamJoinedWeek, totalActiveTeams) {
  if (teamJoinedWeek <= 1) return [];

  const ghostWeeks = [];
  for (let week = 1; week < teamJoinedWeek; week++) {
    const ghostGross = getGhostScore(db, leagueId, week);
    ghostWeeks.push({ weekNumber: week, ghostGross });
  }
  return ghostWeeks;
}

module.exports = { getGhostScore, getLateEntryGhostWeeks };
