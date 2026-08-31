const { requireUuid } = require('./workspaceRepository');
const { unwrapSupabaseResult } = require('./errors');

async function getTrashedLeagues(client, courseId) {
  const normCourseId = requireUuid(courseId, 'trash scope');
  const res = await client.from('leagues')
    .select('id, name, trashed_at')
    .eq('course_id', normCourseId)
    .eq('status', 'trashed');
  
  return unwrapSupabaseResult(res, 'read trashed leagues') || [];
}

async function trashLeague(client, leagueId, courseId) {
  const res = await client.rpc('trash_league', {
    p_league_id: requireUuid(leagueId, 'trash target'),
    p_course_id: requireUuid(courseId, 'trash scope')
  });
  return unwrapSupabaseResult(res, 'trash league');
}

async function restoreLeague(client, leagueId, courseId) {
  const res = await client.rpc('restore_league', {
    p_league_id: requireUuid(leagueId, 'restore target'),
    p_course_id: requireUuid(courseId, 'restore scope')
  });
  return unwrapSupabaseResult(res, 'restore league');
}

async function purgeExpiredTrash(client) {
  const res = await client.rpc('purge_expired_trash');
  return unwrapSupabaseResult(res, 'purge expired trash');
}

// Closing stops the clock and is reversible; purging destroys the workspace and
// everything in it, and the database refuses it on a course that is still open.
// These carry their own owner check, so they run as the signed-in user rather
// than through the admin client.
async function closeCourse(client, courseId) {
  const res = await client.rpc('close_course', {
    p_course_id: requireUuid(courseId, 'close course scope'),
  });
  return unwrapSupabaseResult(res, 'close course');
}

async function reopenCourse(client, courseId) {
  const res = await client.rpc('reopen_course', {
    p_course_id: requireUuid(courseId, 'reopen course scope'),
  });
  return unwrapSupabaseResult(res, 'reopen course');
}

async function purgeCourse(client, courseId) {
  const res = await client.rpc('purge_course', {
    p_course_id: requireUuid(courseId, 'purge course scope'),
  });
  return unwrapSupabaseResult(res, 'purge course');
}

module.exports = {
  getTrashedLeagues,
  trashLeague,
  restoreLeague,
  purgeExpiredTrash,
  closeCourse,
  reopenCourse,
  purgeCourse,
};
