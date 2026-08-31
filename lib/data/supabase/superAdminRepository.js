const { unwrapSupabaseResult } = require('./errors');

async function getPlatformStats(client) {
  // Query all courses
  const coursesRes = await client.from('courses').select('id, name, city');
  const courses = unwrapSupabaseResult(coursesRes, 'read courses') || [];

  // Query all leagues
  const leaguesRes = await client.from('leagues').select('id, course_id');
  const leagues = unwrapSupabaseResult(leaguesRes, 'read leagues') || [];

  // Query all teams
  const teamsRes = await client.from('teams').select('id, league_id');
  const teams = unwrapSupabaseResult(teamsRes, 'read teams') || [];

  // Aggregate stats in-memory to avoid complex RPC for now, as volume is low
  const coursesWithStats = courses.map(course => {
    const courseLeagues = leagues.filter(l => l.course_id === course.id);
    const courseLeagueIds = new Set(courseLeagues.map(l => l.id));
    const courseTeams = teams.filter(t => courseLeagueIds.has(t.league_id));
    
    return {
      ...course,
      leaguesCount: courseLeagues.length,
      teamsCount: courseTeams.length
    };
  });

  return coursesWithStats;
}

module.exports = {
  getPlatformStats
};
