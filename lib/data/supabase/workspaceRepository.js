const { UUID_PATTERN } = require('../../security/entityId');
const { executeRpc, unwrapSupabaseResult, SupabaseDataError } = require('./errors');

function requireUuid(value, fieldName) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new SupabaseDataError(fieldName, { code: 'INVALID_UUID' });
  }
  return normalized;
}

function courseNameFromRelation(courses) {
  if (Array.isArray(courses)) return courses[0]?.name || 'Course workspace';
  return courses?.name || 'Course workspace';
}

async function listUserMemberships(client, userId) {
  const normalizedUserId = requireUuid(userId, 'list user memberships');
  const result = await client
    .from('course_memberships')
    .select('course_id,role,created_at,courses!inner(name)')
    .eq('user_id', normalizedUserId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  const rows = unwrapSupabaseResult(result, 'list user memberships') || [];
  return rows.map(row => ({
    course_id: row.course_id,
    role: row.role,
    course_name: courseNameFromRelation(row.courses),
  }));
}

async function listActiveLeagues(client, courseId) {
  const normalizedCourseId = requireUuid(courseId, 'list active leagues');
  const result = await client
    .from('leagues')
    .select('id,name,current_week,created_at')
    .eq('course_id', normalizedCourseId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  return unwrapSupabaseResult(result, 'list active leagues') || [];
}

async function getScoringWorkspace(client, { courseId, leagueId, weekNumber }) {
  const normalizedCourseId = requireUuid(courseId, 'scoring course scope');
  const normalizedLeagueId = requireUuid(leagueId, 'scoring league scope');
  const [holesResult, teesResult, teamsResult, matchesResult, leagueResult, substitutesResult] = await Promise.all([
    // hole_number and par are here for hole-by-hole entry, which needs to label
    // each box and show the scorekeeper what the hole plays to.
    client.from('course_holes').select('id,hole_number,par,stroke_index')
      .eq('course_id', normalizedCourseId).order('hole_number', { ascending: true }),
    client.from('course_tee_boxes').select('id').eq('course_id', normalizedCourseId),
    client.from('teams').select('id,name,current_handicap').eq('course_id', normalizedCourseId)
      .eq('league_id', normalizedLeagueId).eq('status', 'active').order('name', { ascending: true }),
    client.from('matches').select('id,status,locked_at').eq('course_id', normalizedCourseId)
      .eq('league_id', normalizedLeagueId).eq('week_number', weekNumber),
    client.from('leagues').select('game_format').eq('course_id', normalizedCourseId)
      .eq('id', normalizedLeagueId).maybeSingle(),
    client.from('substitutes').select('id,name,handicap')
      .eq('course_id', normalizedCourseId).eq('league_id', normalizedLeagueId)
      .eq('status', 'available').order('name', { ascending: true }),
  ]);
  const holes = unwrapSupabaseResult(holesResult, 'read scoring holes') || [];
  const league = unwrapSupabaseResult(leagueResult, 'read scoring league') || null;
  const substitutes = unwrapSupabaseResult(substitutesResult, 'read scoring substitutes') || [];
  const tees = unwrapSupabaseResult(teesResult, 'read scoring tees') || [];
  const teams = unwrapSupabaseResult(teamsResult, 'read scoring teams') || [];
  const matches = unwrapSupabaseResult(matchesResult, 'read scoring round') || [];
  const match = matches[0] || null;
  const validLayout = [9, 18].includes(holes.length)
    && new Set(holes.map(hole => hole.stroke_index)).size === holes.length;
  const blockers = [];
  if (!validLayout) blockers.push({ label: 'Hole layout', description: 'Add a complete 9- or 18-hole layout with unique stroke indexes.' });
  if (tees.length < 1) blockers.push({ label: 'Tee ratings', description: 'Add at least one tee with course and slope ratings.' });
  if (teams.length < 2) blockers.push({ label: 'Roster', description: 'Add at least two active teams.' });
  if (!match || ['cancelled', 'rained_out'].includes(match.status)) {
    blockers.push({ label: 'First round', description: 'Schedule the active week before entering scores.' });
  }
  if (match?.locked_at || match?.status === 'locked') {
    blockers.push({ label: 'Round lock', description: 'This round is locked and accepts correction requests only.' });
  }
  return {
    teams, match, holes, substitutes,
    gameFormat: league?.game_format || 'stroke_play',
    readyForScoring: blockers.length === 0,
    blockers,
  };
}

async function createTenantWorkspace(client, input) {
  return executeRpc(client, 'create_tenant_workspace', {
    p_course_name: input.courseName,
    p_address: input.address || '',
    p_city: input.city,
    p_state: input.state,
    p_postal_code: input.postalCode || '',
    p_timezone: input.timezone,
    p_league_name: input.leagueName,
    p_game_format: input.gameFormat,
    p_season_length_weeks: input.seasonLengthWeeks,
  }, 'create tenant workspace');
}

async function acceptPendingInvitations(client) {
  return executeRpc(
    client,
    'accept_pending_course_invitations',
    {},
    'accept pending course invitations'
  );
}

module.exports = {
  acceptPendingInvitations,
  createTenantWorkspace,
  getScoringWorkspace,
  listActiveLeagues,
  listUserMemberships,
  requireUuid,
};
