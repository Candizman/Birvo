const leagueRepository = require('../data/supabase/leagueRepository');

async function listCourseLeagues(client, courseId) {
  return leagueRepository.listCourseLeagues(client, courseId);
}

async function getLeague(client, leagueId) {
  const { data } = await client.from('leagues').select('*').eq('id', leagueId).single();
  return data;
}

module.exports = {
  listCourseLeagues,
  getLeague
};
