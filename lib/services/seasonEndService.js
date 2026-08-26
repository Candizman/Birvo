'use strict';

const { getLeagueStandings } = require('./standingsService');

function getSeasonEndStatus(db, leagueId) {
  const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId);
  if (!league) {
    return { isSeasonComplete: false };
  }

  const standingsData = getLeagueStandings(db, leagueId);
  if (!standingsData) {
    return { isSeasonComplete: false };
  }

  const { seasonStandings, summary } = standingsData;
  const completedWeeks = summary.completedWeeks;
  const totalWeeks = league.season_length_weeks || summary.totalWeeks;

  const isSeasonComplete = completedWeeks >= totalWeeks && totalWeeks > 0;

  let champion = null;
  let runnerUp = null;

  if (isSeasonComplete && seasonStandings && seasonStandings.length > 0) {
    const leader = seasonStandings[0];
    champion = {
      name: leader.name,
      totalPoints: leader.totalPoints,
      avgNet: leader.avgNet,
      weeksPlayed: leader.weeksPlayed
    };
    if (seasonStandings.length > 1) {
      runnerUp = seasonStandings[1];
    }
  }

  return {
    isSeasonComplete,
    league,
    totalWeeks,
    completedWeeks,
    champion,
    runnerUp,
    standings: seasonStandings
  };
}

function archiveLeague(db, leagueId, actorUserId) {
  const transaction = db.transaction(() => {
    db.prepare(`UPDATE leagues SET status = 'archived', archived_at = CURRENT_TIMESTAMP WHERE id = ?`).run(leagueId);

    // Add audit event
    db.prepare(`
      INSERT INTO audit_events (action, target_type, target_id, actor_user_id)
      VALUES (?, ?, ?, ?)
    `).run('league_archived', 'league', leagueId, actorUserId);
  });

  transaction();

  return { success: true };
}

module.exports = {
  getSeasonEndStatus,
  archiveLeague
};
