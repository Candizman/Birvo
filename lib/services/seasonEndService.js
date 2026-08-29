'use strict';

const leagueRepository = require('../data/supabase/leagueRepository');
const operationsRepository = require('../data/supabase/operationsRepository');

/**
 * Reports whether a league's season has finished and, if so, who won it.
 * The standings themselves come from buildLeagueStandings, the same pure
 * calculation the public standings page and the clubhouse display use.
 */
async function getSeasonEndStatus(client, { courseId, leagueId }) {
  const standingsData = await leagueRepository.getLeagueStandingsData(client, { courseId, leagueId });
  if (!standingsData) {
    return { isSeasonComplete: false };
  }

  const { league, seasonStandings, summary } = standingsData;
  const completedWeeks = summary.completedWeeks;
  const totalWeeks = summary.seasonLengthWeeks;

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

async function archiveLeague(client, { courseId, leagueId }) {
  return operationsRepository.archiveLeague(client, { courseId, leagueId });
}

module.exports = {
  getSeasonEndStatus,
  archiveLeague
};
