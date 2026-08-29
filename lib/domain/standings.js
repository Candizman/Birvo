/**
 * League standings calculation.
 *
 * Pure: the caller supplies league, teams, matches and scores, and this returns
 * weekly and season standings. Lives in the domain layer because the repository
 * layer calls it directly, and a service-level home inverted the dependency
 * between repositories and services.
 */
'use strict';

const { calculateLeaguePoints, calculateSeasonStandings } = require('../domain/scoring');

function buildLeagueStandings({ league, teams = [], matches = [], scores = [] }) {
  if (!league) return null;
  const activeTeams = teams.filter(team => team.status === 'active');
  const totalActiveTeams = activeTeams.length;
  const orderedMatches = [...matches].sort((a, b) => Number(a.week_number) - Number(b.week_number));
  const matchById = new Map(orderedMatches.map(match => [String(match.id), match]));
  const validScores = scores.filter(score => score.reconciliation_status !== 'needs_review'
    && score.net_score !== null && score.net_score !== undefined && matchById.has(String(score.match_id)));
  const weeklyResultsList = [];
  const weeksData = {};

  for (const match of orderedMatches) {
    const matchScores = validScores.filter(score => String(score.match_id) === String(match.id));
    const teamsWithNetScores = activeTeams.map(team => {
      const scoreRecord = matchScores.find(score => String(score.team_id) === String(team.id));
      return {
        id: team.id,
        name: team.name,
        handicap: Number(scoreRecord?.handicap_used ?? team.current_handicap ?? 0),
        currentGross: scoreRecord ? Number(scoreRecord.gross_score) : null,
        netScore: scoreRecord ? Number(scoreRecord.net_score) : null,
        isGhost: Boolean(scoreRecord?.is_ghost),
      };
    }).filter(team => team.netScore !== null);

    const scoredTeamIds = new Set(teamsWithNetScores.map(team => String(team.id)));
    const missingTeams = activeTeams.filter(team => !scoredTeamIds.has(String(team.id)));
    const recordedGrossScores = matchScores
      .map(score => Number(score.gross_score))
      .filter(Number.isFinite);
    const ghostGross = recordedGrossScores.length
      ? Math.round(recordedGrossScores.reduce((sum, value) => sum + value, 0) / recordedGrossScores.length)
      : 36;

    for (const missingTeam of missingTeams) {
      const hasPlayedBefore = validScores.some(score => {
        const scoreMatch = matchById.get(String(score.match_id));
        return String(score.team_id) === String(missingTeam.id)
          && Number(scoreMatch?.week_number) < Number(match.week_number);
      });
      if (!hasPlayedBefore && teamsWithNetScores.length > 0) {
        const ghostHandicap = Number(missingTeam.current_handicap || 0);
        teamsWithNetScores.push({
          id: missingTeam.id,
          name: missingTeam.name,
          handicap: ghostHandicap,
          currentGross: ghostGross,
          netScore: ghostGross - ghostHandicap,
          isGhost: true,
        });
      }
    }

    const results = calculateLeaguePoints(teamsWithNetScores, totalActiveTeams);
    const week = {
      weekNumber: Number(match.week_number),
      matchId: match.id,
      matchStatus: match.status,
      results,
      scoresEnteredCount: matchScores.length,
      totalActiveTeams,
    };
    weeklyResultsList.push(week);
    weeksData[match.week_number] = {
      matchId: match.id,
      status: match.status,
      results,
      scoresEnteredCount: matchScores.length,
    };
  }

  const seasonStandings = calculateSeasonStandings(activeTeams, weeklyResultsList);
  const leader = seasonStandings[0] || null;
  const completedWeeks = weeklyResultsList.filter(
    week => week.scoresEnteredCount === totalActiveTeams && totalActiveTeams > 0
  ).length;
  let totalLeagueNet = 0;
  let totalNetCount = 0;
  for (const team of seasonStandings) {
    if (team.weeksPlayed > 0) {
      totalLeagueNet += team.totalNet;
      totalNetCount += team.weeksPlayed;
    }
  }

  return {
    league,
    teams: activeTeams,
    totalActiveTeams,
    seasonStandings,
    weeklyResultsList,
    weeksData,
    summary: {
      leader,
      completedWeeks,
      totalWeeks: orderedMatches.length,
      currentWeek: Number(league.current_week),
      leagueAvgNet: totalNetCount > 0 ? Number((totalLeagueNet / totalNetCount).toFixed(1)) : null,
    },
  };
}

module.exports = { buildLeagueStandings };
