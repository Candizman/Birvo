const { buildCourseDetails } = require('../../services/courseService');
const { unwrapSupabaseResult } = require('./errors');
const { requireUuid } = require('./workspaceRepository');

async function maybeSingle(query, operation) {
  return unwrapSupabaseResult(await query.maybeSingle(), operation);
}

async function getCourseManagementDetails(client, courseId) {
  const normalizedCourseId = requireUuid(courseId, 'course-management scope');
  const [course, holesResult, teeBoxesResult, membersResult, invitationsResult] = await Promise.all([
    maybeSingle(
      client.from('courses')
        .select('id,name,address,city,state,postal_code,country_code,timezone,contact_email,contact_phone,primary_color,local_rules,weather_lat,weather_lon')
        .eq('id', normalizedCourseId),
      'read managed course'
    ),
    client.from('course_holes')
      .select('id,hole_number,par,stroke_index,pin_position,is_under_maintenance,notes')
      .eq('course_id', normalizedCourseId).eq('layout_name', 'Main Course')
      .order('hole_number', { ascending: true }),
    client.from('course_tee_boxes')
      .select('id,name,color_hex,gender,course_rating,slope_rating,total_yards')
      .eq('course_id', normalizedCourseId).eq('layout_name', 'Main Course')
      .order('total_yards', { ascending: false }),
    client.from('course_memberships')
      .select('id,email,role,status,joined_at,user_id')
      .eq('course_id', normalizedCourseId).neq('status', 'removed'),
    client.from('course_invitations')
      .select('id,email,role,status,created_at,expires_at,last_error')
      .eq('course_id', normalizedCourseId).in('status', ['pending', 'failed']),
  ]);
  if (!course) return null;
  const holes = unwrapSupabaseResult(holesResult, 'read managed course holes') || [];
  const teeBoxes = unwrapSupabaseResult(teeBoxesResult, 'read managed tee boxes') || [];
  const members = (unwrapSupabaseResult(membersResult, 'read course staff') || []).map(member => ({
    ...member,
    created_at: member.joined_at,
    access_type: 'member',
  }));
  const invitations = (unwrapSupabaseResult(invitationsResult, 'read course invitations') || []).map(invitation => ({
    ...invitation,
    user_id: null,
    access_type: 'invitation',
  }));
  const staff = [...members, ...invitations].sort((left, right) => left.email.localeCompare(right.email));
  return buildCourseDetails({ course, holes, teeBoxes, staff });
}

async function getLeagueTeeTimes(client, { courseId, leagueId, weekNumber }) {
  const normalizedCourseId = requireUuid(courseId, 'tee-time course scope');
  const normalizedLeagueId = requireUuid(leagueId, 'tee-time league scope');
  const teeTimesResult = await client.from('tee_times')
    .select('id,start_time,starting_hole,starting_group,team1_id,team2_id,status')
    .eq('course_id', normalizedCourseId).eq('league_id', normalizedLeagueId)
    .eq('week_number', weekNumber)
    .order('starting_hole', { ascending: true })
    .order('starting_group', { ascending: true })
    .order('start_time', { ascending: true });
  const teeTimes = unwrapSupabaseResult(teeTimesResult, 'read league tee times') || [];
  const teamIds = [...new Set(teeTimes.flatMap(item => [item.team1_id, item.team2_id]).filter(Boolean))];
  let teams = [];
  if (teamIds.length > 0) {
    const teamsResult = await client.from('teams').select('id,name')
      .eq('course_id', normalizedCourseId).eq('league_id', normalizedLeagueId).in('id', teamIds);
    teams = unwrapSupabaseResult(teamsResult, 'read tee-time teams') || [];
  }
  const teamById = new Map(teams.map(team => [team.id, team.name]));
  return teeTimes.map(item => ({
    ...item,
    team1_name: item.team1_id ? teamById.get(item.team1_id) || null : null,
    team2_name: item.team2_id ? teamById.get(item.team2_id) || null : null,
  }));
}

module.exports = {
  getCourseManagementDetails,
  getLeagueTeeTimes,
};
