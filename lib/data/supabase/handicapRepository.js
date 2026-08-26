const { requireUuid } = require('./workspaceRepository');
const { unwrapSupabaseResult } = require('./errors');

async function getTeamsForHandicapView(client, leagueId) {
  const normalizedLeagueId = requireUuid(leagueId, 'handicap view scope');
  const result = await client.from('teams')
    .select('id, name, current_handicap, low_handicap_365, ghin_number')
    .eq('league_id', normalizedLeagueId)
    .eq('status', 'active')
    .order('current_handicap', { ascending: true });

  const teams = unwrapSupabaseResult(result, 'read handicap teams') || [];
  return teams.map(t => ({
    ...t,
    current_handicap: Number(t.current_handicap),
    low_handicap_365: t.low_handicap_365 !== null ? Number(t.low_handicap_365) : null
  }));
}

async function getHandicapAuditLogs(client, leagueId) {
  const normalizedLeagueId = requireUuid(leagueId, 'handicap log scope');
  const result = await client.from('handicap_audit_logs')
    .select('*, teams!inner(name)')
    .eq('teams.league_id', normalizedLeagueId)
    .order('created_at', { ascending: false })
    .limit(100);

  const logs = unwrapSupabaseResult(result, 'read handicap audit logs') || [];
  return logs.map(log => ({
    ...log,
    team_name: log.teams.name,
    old_handicap: Number(log.old_handicap),
    new_handicap: Number(log.new_handicap)
  }));
}

async function adjustHandicapManually(client, { teamId, courseId, actorEmail, newHandicap, ghin, reason }) {
  const result = await client.rpc('adjust_handicap_manually', {
    p_team_id: requireUuid(teamId, 'adjust handicap target'),
    p_course_id: requireUuid(courseId, 'adjust handicap course'),
    p_actor_email: actorEmail,
    p_new_handicap: newHandicap,
    p_ghin: ghin,
    p_reason: reason
  });
  return unwrapSupabaseResult(result, 'adjust handicap manually');
}

module.exports = {
  getTeamsForHandicapView,
  getHandicapAuditLogs,
  adjustHandicapManually
};
