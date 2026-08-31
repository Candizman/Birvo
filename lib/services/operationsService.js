const operationsRepository = require('../data/supabase/operationsRepository');
const leagueRepository = require('../data/supabase/leagueRepository');
const entityId = require('../security/entityId');
const { generatePlayoffBracket } = require('../domain/tournamentFormats');

async function createLeague(client, courseId, leagueName, gameFormat, seasonLengthWeeks) {
  return operationsRepository.createLeague(client, {
    courseId, name: leagueName, gameFormat, seasonLengthWeeks,
  });
}

async function updateLeagueFormat(client, courseId, rawLeagueId, gameFormat) {
  return operationsRepository.updateLeagueFormat(client, {
    courseId,
    leagueId: entityId.normalizeEntityId(rawLeagueId),
    gameFormat,
  });
}

/**
 * Seeds a playoff bracket from the current season standings. The seed-to-league
 * check runs again inside save_league_playoff_bracket, so a tampered bracket
 * cannot smuggle in a team from another league.
 */
async function generateLeaguePlayoffBracket(client, courseId, rawLeagueId, bracketSize) {
  const leagueId = entityId.normalizeEntityId(rawLeagueId);
  const standingsData = await leagueRepository.getLeagueStandingsData(client, { courseId, leagueId });

  if (!standingsData || standingsData.seasonStandings.length < 2) {
    return { error: 'At least two ranked teams are required to generate a playoff bracket.' };
  }

  const bracket = generatePlayoffBracket(standingsData.seasonStandings, bracketSize);
  await operationsRepository.saveLeaguePlayoffBracket(client, { courseId, leagueId, bracket });

  return { success: true };
}

async function setLeagueHandicapMethod(client, { courseId, leagueId, method, allowancePercent }) {
  return operationsRepository.setLeagueHandicapMethod(client, {
    courseId, leagueId: entityId.normalizeEntityId(leagueId), method, allowancePercent,
  });
}

async function setLeagueTreasurySettings(client, { courseId, leagueId, duesAmountCents, skinsEntryFeeCents }) {
  return operationsRepository.setLeagueTreasurySettings(client, {
    courseId, leagueId: entityId.normalizeEntityId(leagueId), duesAmountCents, skinsEntryFeeCents,
  });
}

async function setTeamDuesStatus(client, { courseId, teamId, status, method, note }) {
  return operationsRepository.setTeamDuesStatus(client, {
    courseId, teamId: entityId.normalizeEntityId(teamId), status, method, note,
  });
}

module.exports = {
  setLeagueHandicapMethod,
  setLeagueTreasurySettings,
  setTeamDuesStatus,
  createLeague,
  updateLeagueFormat,
  generateLeaguePlayoffBracket,
};
