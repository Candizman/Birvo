const { requireUuid } = require('./workspaceRepository');
const { unwrapSupabaseResult } = require('./errors');

async function getCourseAndLeague(client, courseId, leagueId) {
  const normCourseId = requireUuid(courseId, 'cart signs course');
  const normLeagueId = requireUuid(leagueId, 'cart signs league');

  const courseRes = await client.from('courses').select('name, city').eq('id', normCourseId).maybeSingle();
  const leagueRes = await client.from('leagues').select('id, name, current_week').eq('id', normLeagueId).eq('course_id', normCourseId).maybeSingle();

  return {
    course: unwrapSupabaseResult(courseRes, 'read course'),
    league: unwrapSupabaseResult(leagueRes, 'read league')
  };
}

async function getActiveTeams(client, leagueId) {
  const normLeagueId = requireUuid(leagueId, 'cart signs teams');
  const res = await client.from('teams').select('id, name, current_handicap').eq('league_id', normLeagueId).eq('status', 'active').order('id', { ascending: true });
  return unwrapSupabaseResult(res, 'read active teams') || [];
}

async function getTeeTimesForWeek(client, leagueId, weekNumber) {
  const normLeagueId = requireUuid(leagueId, 'cart signs tee times');
  
  // Need to join teams twice (team1 and team2)
  const res = await client.from('tee_times')
    .select(`
      id, starting_hole, starting_group, start_time,
      team1:team1_id(name, current_handicap),
      team2:team2_id(name, current_handicap)
    `)
    .eq('league_id', normLeagueId)
    .eq('week_number', weekNumber)
    .order('starting_hole', { ascending: true })
    .order('starting_group', { ascending: true });

  const teeTimes = unwrapSupabaseResult(res, 'read tee times') || [];
  return teeTimes.map(tt => ({
    id: tt.id,
    starting_hole: tt.starting_hole,
    starting_group: tt.starting_group,
    start_time: tt.start_time,
    team1_name: tt.team1?.name,
    team1_hcp: tt.team1?.current_handicap,
    team2_name: tt.team2?.name,
    team2_hcp: tt.team2?.current_handicap
  }));
}

async function getFixturesForWeek(client, leagueId, weekNumber) {
  const normLeagueId = requireUuid(leagueId, 'cart signs fixtures');
  
  const res = await client.from('match_fixtures')
    .select(`
      id, scheduled_time, is_bye,
      team1:team1_id(name, current_handicap),
      team2:team2_id(name, current_handicap)
    `)
    .eq('league_id', normLeagueId)
    .eq('week_number', weekNumber)
    .order('id', { ascending: true });

  const fixtures = unwrapSupabaseResult(res, 'read fixtures') || [];
  return fixtures.map(f => ({
    id: f.id,
    scheduled_time: f.scheduled_time,
    is_bye: f.is_bye,
    team1_name: f.team1?.name,
    team1_hcp: f.team1?.current_handicap,
    team2_name: f.team2?.name,
    team2_hcp: f.team2?.current_handicap
  }));
}

module.exports = {
  getCourseAndLeague,
  getActiveTeams,
  getTeeTimesForWeek,
  getFixturesForWeek
};
