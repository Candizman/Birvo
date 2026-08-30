const { buildLeagueStandings } = require('../../domain/standings');
const { normalizeRSVPStatus } = require('../../domain/rsvp');
const { unwrapSupabaseResult } = require('./errors');
const { requireUuid } = require('./workspaceRepository');

async function maybeSingle(query, operation) {
  return unwrapSupabaseResult(await query.maybeSingle(), operation);
}

async function listCourseLeagues(client, courseId) {
  const normalizedCourseId = requireUuid(courseId, 'league-list course scope');
  const result = await client.from('leagues')
    .select('id,course_id,name,status,current_week,season_length_weeks,game_format,playoff_bracket,handicap_method,handicap_allowance_percent,created_at')
    .eq('course_id', normalizedCourseId).neq('status', 'trashed')
    .order('created_at', { ascending: false });
  return unwrapSupabaseResult(result, 'read managed leagues') || [];
}

async function getScopedLeague(client, { courseId, leagueId, activeOnly = false }) {
  const normalizedCourseId = requireUuid(courseId, 'league course scope');
  const normalizedLeagueId = requireUuid(leagueId, 'league scope');
  let query = client.from('leagues')
    .select('id,course_id,name,status,current_week,season_length_weeks,game_format,playoff_bracket,handicap_method,handicap_allowance_percent,created_at')
    .eq('id', normalizedLeagueId).eq('course_id', normalizedCourseId);
  if (activeOnly) query = query.eq('status', 'active');
  return maybeSingle(query, 'read scoped league');
}

async function listActiveLeagueTeams(client, { courseId, leagueId }) {
  const normalizedCourseId = requireUuid(courseId, 'league-team course scope');
  const normalizedLeagueId = requireUuid(leagueId, 'league-team league scope');
  const result = await client.from('teams').select('id,name,current_handicap,status,created_at')
    .eq('course_id', normalizedCourseId).eq('league_id', normalizedLeagueId)
    .eq('status', 'active').order('created_at', { ascending: true });
  return unwrapSupabaseResult(result, 'read active league teams') || [];
}

async function getLeagueStandingsData(client, { courseId, leagueId }) {
  const normalizedCourseId = requireUuid(courseId, 'standings course scope');
  const normalizedLeagueId = requireUuid(leagueId, 'standings league scope');
  const [league, teams, matchesResult] = await Promise.all([
    getScopedLeague(client, { courseId: normalizedCourseId, leagueId: normalizedLeagueId }),
    listActiveLeagueTeams(client, { courseId: normalizedCourseId, leagueId: normalizedLeagueId }),
    client.from('matches').select('id,week_number,status')
      .eq('course_id', normalizedCourseId).eq('league_id', normalizedLeagueId)
      .order('week_number', { ascending: true }),
  ]);
  if (!league) return null;
  const matches = unwrapSupabaseResult(matchesResult, 'read league standings rounds') || [];
  let scores = [];
  if (matches.length > 0) {
    const scoreResult = await client.from('scores')
      .select('match_id,team_id,gross_score,handicap_used,net_score,reconciliation_status,is_ghost')
      .eq('course_id', normalizedCourseId).in('match_id', matches.map(match => match.id));
    scores = unwrapSupabaseResult(scoreResult, 'read league standings scores') || [];
  }
  return buildLeagueStandings({ league, teams, matches, scores });
}

function attachTeamNames(rows, teams) {
  const teamById = new Map(teams.map(team => [team.id, team.name]));
  return rows.map(row => ({
    ...row,
    team1_name: row.team1_id ? teamById.get(row.team1_id) || null : null,
    team2_name: row.team2_id ? teamById.get(row.team2_id) || null : null,
  }));
}

async function getFixtureManagementSnapshot(client, { courseId, leagueId, weekNumber }) {
  const normalizedCourseId = requireUuid(courseId, 'fixture course scope');
  const normalizedLeagueId = requireUuid(leagueId, 'fixture league scope');
  const [league, teams, fixturesResult, substitutesResult, teeTimesResult, holesResult, matchesResult] = await Promise.all([
    getScopedLeague(client, { courseId: normalizedCourseId, leagueId: normalizedLeagueId, activeOnly: true }),
    listActiveLeagueTeams(client, { courseId: normalizedCourseId, leagueId: normalizedLeagueId }),
    client.from('match_fixtures')
      .select('id,week_number,team1_id,team2_id,scheduled_date,scheduled_time,is_bye')
      .eq('course_id', normalizedCourseId).eq('league_id', normalizedLeagueId)
      .order('week_number', { ascending: true }).order('created_at', { ascending: true }),
    client.from('substitutes').select('id,name,handicap,phone,email,status,created_at')
      .eq('course_id', normalizedCourseId).eq('league_id', normalizedLeagueId)
      .order('name', { ascending: true }),
    client.from('tee_times')
      .select('id,week_number,start_time,starting_hole,starting_group,team1_id,team2_id,status')
      .eq('course_id', normalizedCourseId).eq('league_id', normalizedLeagueId)
      .eq('week_number', weekNumber)
      .order('starting_hole', { ascending: true }).order('starting_group', { ascending: true }),
    client.from('course_holes').select('hole_number,par,is_under_maintenance')
      .eq('course_id', normalizedCourseId).eq('layout_name', 'Main Course')
      .order('hole_number', { ascending: true }),
    client.from('matches').select('id,status,locked_at')
      .eq('course_id', normalizedCourseId).eq('league_id', normalizedLeagueId)
      .eq('week_number', weekNumber).maybeSingle(),
  ]);
  if (!league) return null;
  const fixtures = unwrapSupabaseResult(fixturesResult, 'read league fixtures') || [];
  const substitutes = (unwrapSupabaseResult(substitutesResult, 'read league substitutes') || [])
    .map(substitute => ({ ...substitute, handicap: Number(substitute.handicap) }));
  const teeTimes = unwrapSupabaseResult(teeTimesResult, 'read fixture tee times') || [];
  const courseHoles = unwrapSupabaseResult(holesResult, 'read fixture course holes') || [];
  const currentMatch = unwrapSupabaseResult(matchesResult, 'read fixture scoring round');
  let rsvps = [];
  if (teams.length > 0) {
    const rsvpResult = await client.from('player_rsvps')
      .select('id,team_id,week_number,status,note,created_at,updated_at')
      .eq('course_id', normalizedCourseId).eq('week_number', weekNumber)
      .in('team_id', teams.map(team => team.id)).order('created_at', { ascending: false });
    const teamById = new Map(teams.map(team => [team.id, team.name]));
    rsvps = (unwrapSupabaseResult(rsvpResult, 'read league RSVPs') || []).map(item => ({
      ...item,
      status: normalizeRSVPStatus(item.status),
      team_name: teamById.get(item.team_id) || 'Unknown team',
    }));
  }
  let scoredTeamIds = new Set();
  if (currentMatch) {
    const scoresResult = await client.from('scores').select('team_id')
      .eq('course_id', normalizedCourseId).eq('match_id', currentMatch.id);
    scoredTeamIds = new Set((unwrapSupabaseResult(scoresResult, 'read fixture submitted scorecards') || [])
      .map(score => String(score.team_id)));
  }
  return {
    league,
    teams,
    fixtures: attachTeamNames(fixtures, teams),
    substitutes,
    rsvps,
    teeTimes: attachTeamNames(teeTimes, teams),
    courseHoles,
    missingTeams: teams.filter(team => !scoredTeamIds.has(String(team.id))),
  };
}

async function getLeagueCalendarData(client, { courseId, leagueId }) {
  const normalizedCourseId = requireUuid(courseId, 'calendar course scope');
  const normalizedLeagueId = requireUuid(leagueId, 'calendar league scope');
  const [league, teams, fixturesResult] = await Promise.all([
    getScopedLeague(client, { courseId: normalizedCourseId, leagueId: normalizedLeagueId }),
    listActiveLeagueTeams(client, { courseId: normalizedCourseId, leagueId: normalizedLeagueId }),
    client.from('match_fixtures')
      .select('id,week_number,team1_id,team2_id,scheduled_date,scheduled_time,is_bye')
      .eq('course_id', normalizedCourseId).eq('league_id', normalizedLeagueId)
      .order('week_number', { ascending: true }).order('created_at', { ascending: true }),
  ]);
  if (!league) return null;
  return {
    league,
    fixtures: attachTeamNames(unwrapSupabaseResult(fixturesResult, 'read calendar fixtures') || [], teams),
  };
}

module.exports = {
  getFixtureManagementSnapshot,
  getLeagueCalendarData,
  getLeagueStandingsData,
  getScopedLeague,
  listActiveLeagueTeams,
  listCourseLeagues,
};
