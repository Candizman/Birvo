const dataBackend = require('../data/backend');
const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const leagueRepository = require('../data/supabase/leagueRepository');

async function listCourseLeaguesAsync(client, courseId) {
  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    return await leagueRepository.listCourseLeagues(client, courseId);
  }
  
  const db = require('../database');
  
  return db.prepare("SELECT id, name, status, current_week, season_length_weeks, game_format, playoff_bracket, created_at FROM leagues WHERE course_id = ? AND status != 'trashed' ORDER BY created_at DESC").all(courseId);
}

async function getLeagueAsync(client, leagueId) {
  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    const { data } = await client.from('leagues').select('*').eq('id', leagueId).single();
    return data;
  }
  const db = require('../database');
  return db.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId);
}

module.exports = {
  listCourseLeaguesAsync,
  getLeagueAsync
};
