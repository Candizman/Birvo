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
const { buildRoundFormatResults, getFormatDefinition } = require('../domain/leagueFormats');
const { attachSkinsMoney } = require('../domain/treasury');

// Match play does not rank against the field: a team's week is decided by the
// fixture it played, so the points come straight from the match result.
function rankByMatchPoints(teamsWithMatchPoints) {
  const sorted = [...teamsWithMatchPoints].sort((a, b) => b.matchPoints - a.matchPoints);
  let rank = 1;
  return sorted.map((team, index) => {
    if (index > 0 && team.matchPoints !== sorted[index - 1].matchPoints) rank = index + 1;
    return { ...team, pointsEarned: team.matchPoints, rank };
  });
}

function groupHoleScoresByTeam(holeScores, scoresForMatch) {
  const scoreIdToTeam = new Map(
    scoresForMatch.map(score => [String(score.id), String(score.team_id)])
  );
  const grouped = new Map();
  for (const row of holeScores) {
    const teamId = scoreIdToTeam.get(String(row.score_id));
    if (!teamId) continue;
    if (!grouped.has(teamId)) grouped.set(teamId, []);
    grouped.get(teamId).push(row);
  }
  return grouped;
}

function buildLeagueStandings({
  league,
  teams = [],
  matches = [],
  scores = [],
  holeScores = [],
  fixtures = [],
  courseHoles = [],
}) {
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
        // The round counts for the league but was played by someone else, so it
        // is left out of the team's handicap. Worth showing rather than hiding.
        playedBySubstitute: Boolean(scoreRecord?.substitute_id),
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

    // What the league's format makes of this round. A format that needs
    // hole-by-hole scores and does not have them falls back to net stroke play
    // and says so, rather than quietly pretending it ran.
    const formatted = buildRoundFormatResults({
      format: league.game_format,
      teams: teamsWithNetScores,
      holeScoresByTeam: groupHoleScoresByTeam(holeScores, matchScores),
      holes: courseHoles,
      fixtures: fixtures.filter(
        fixture => Number(fixture.week_number) === Number(match.week_number)
      ),
    });

    const results = formatted.basis === 'match'
      ? rankByMatchPoints(formatted.teams)
      : calculateLeaguePoints(formatted.teams, totalActiveTeams);

    // A skins side game reports its counts either way; it only carries dollar
    // amounts once the league has set an entry fee, and only once every entrant
    // has a complete card (the same condition buildRoundFormatResults already
    // required to run the side game at all).
    const sideGame = attachSkinsMoney(formatted.sideGame, {
      entryFeeCents: Number(league.skins_entry_fee_cents) || 0,
      teamsCount: formatted.teams.length,
      holesCount: courseHoles.length,
    });

    const week = {
      weekNumber: Number(match.week_number),
      matchId: match.id,
      matchStatus: match.status,
      results,
      scoresEnteredCount: matchScores.length,
      totalActiveTeams,
      scoringBasis: formatted.basis,
      holeDataMissing: formatted.holeDataMissing,
      sideGame,
    };
    weeklyResultsList.push(week);
    weeksData[match.week_number] = {
      matchId: match.id,
      status: match.status,
      results,
      scoresEnteredCount: matchScores.length,
      scoringBasis: formatted.basis,
      holeDataMissing: formatted.holeDataMissing,
      sideGame,
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
      // Two different numbers, and conflating them read as "a 0-week season" on a
      // league whose fixtures had not been generated yet:
      //   scheduledWeeks    — rounds that exist as match rows
      //   seasonLengthWeeks — the season the league was configured for
      scheduledWeeks: orderedMatches.length,
      seasonLengthWeeks: Number(league.season_length_weeks) || orderedMatches.length,
      currentWeek: Number(league.current_week),
      leagueAvgNet: totalNetCount > 0 ? Number((totalLeagueNet / totalNetCount).toFixed(1)) : null,
      format: {
        value: league.game_format || 'stroke_play',
        ...getFormatDefinition(league.game_format),
        // Rounds the format could not be applied to for want of hole-by-hole
        // scores. The paper entry mode records a total gross and nothing else,
        // so for a course scoring on paper this is every round.
        roundsMissingHoleScores: weeklyResultsList
          .filter(week => week.holeDataMissing && week.scoresEnteredCount > 0)
          .map(week => week.weekNumber),
      },
    },
  };
}

module.exports = { buildLeagueStandings };
