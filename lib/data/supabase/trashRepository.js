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

module.exports = {
  getTrashedLeagues,
  trashLeague,
  restoreLeague,
  purgeExpiredTrash
};
