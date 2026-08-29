const dataBackend = require('../data/backend');
const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const operationsRepository = require('../data/supabase/operationsRepository');
const entityId = require('../security/entityId');

function persistenceId(value, activeDataBackend) {
  return activeDataBackend === DATA_BACKENDS.SUPABASE ? entityId.normalizeEntityId(value) : Number(value);
}

async function createLeagueAsync(client, courseId, leagueName, gameFormat, seasonLengthWeeks) {
  const activeDataBackend = resolveDataBackend();
  if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
    return await operationsRepository.createLeague(client, {
      courseId, name: leagueName, gameFormat, seasonLengthWeeks,
    });
  }
  
  const db = require('../database');
  return db.prepare(`
    INSERT INTO leagues (course_id, name, status, current_week, game_format, season_length_weeks)
    VALUES (?, ?, 'active', 1, ?, ?)
  `).run(courseId, leagueName, gameFormat, seasonLengthWeeks);
}

async function updateLeagueFormatAsync(client, courseId, rawLeagueId, gameFormat) {
  const activeDataBackend = resolveDataBackend();
  const leagueId = persistenceId(rawLeagueId, activeDataBackend);
  if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
    return await operationsRepository.updateLeagueFormat(client, {
      courseId, leagueId, gameFormat,
    });
  }

  const db = require('../database');
  const league = db.prepare('SELECT course_id FROM leagues WHERE id = ?').get(leagueId);
  if (!league || league.course_id !== courseId) throw new Error('Unauthorized operation');
  const scoreCount = db.prepare('SELECT COUNT(*) AS count FROM scores s JOIN matches m ON m.id=s.match_id WHERE m.league_id=?').get(leagueId).count;
  if (scoreCount > 0) throw new Error('The scoring format cannot change after score entry begins.');
  return db.prepare('UPDATE leagues SET game_format = ? WHERE id = ?').run(gameFormat, leagueId);
}

async function generatePlayoffBracketAsync(client, courseId, rawLeagueId, bracketSize) {
  const activeDataBackend = resolveDataBackend();
  const leagueId = persistenceId(rawLeagueId, activeDataBackend);
  
  let standingsData;
  if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
    const leagueRepository = require('../data/supabase/leagueRepository');
    standingsData = await leagueRepository.getLeagueStandingsData(client, { courseId, leagueId });
  } else {
    const db = require('../database');
    const league = db.prepare('SELECT course_id FROM leagues WHERE id = ?').get(leagueId);
    if (!league || league.course_id !== courseId) throw new Error('Unauthorized operation');
    const { getLeagueStandings } = require('./standingsService');
    standingsData = getLeagueStandings(db, leagueId);
  }
  
  if (!standingsData || standingsData.seasonStandings.length < 2) {
    return { error: 'At least two ranked teams are required to generate a playoff bracket.' };
  }

  const { generatePlayoffBracket } = require('../domain/tournamentFormats');
  const bracket = generatePlayoffBracket(standingsData.seasonStandings, bracketSize);
  
  if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
    await operationsRepository.saveLeaguePlayoffBracket(client, {
      courseId, leagueId, bracket,
    });
  } else {
    const db = require('../database');
    db.prepare('UPDATE leagues SET playoff_bracket = ? WHERE id = ?').run(JSON.stringify(bracket), leagueId);
  }
  
  return { success: true };
}

module.exports = {
  createLeagueAsync,
  updateLeagueFormatAsync,
  generatePlayoffBracketAsync
};
