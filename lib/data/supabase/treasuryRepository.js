const { requireUuid } = require('./workspaceRepository');
const { unwrapSupabaseResult } = require('./errors');

async function getTeamsForTreasuryView(client, leagueId) {
  const normalizedLeagueId = requireUuid(leagueId, 'treasury view scope');
  const result = await client.from('teams')
    .select('id, name, dues_status, dues_paid_method, dues_paid_at, dues_note')
    .eq('league_id', normalizedLeagueId)
    .eq('status', 'active')
    .order('name', { ascending: true });

  return unwrapSupabaseResult(result, 'read treasury teams') || [];
}

module.exports = { getTeamsForTreasuryView };
