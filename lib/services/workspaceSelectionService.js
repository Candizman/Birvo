function normalizeWorkspaceId(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function selectLeagueForWorkspace(leagues, requestedLeagueId) {
  if (!Array.isArray(leagues) || leagues.length === 0) return null;

  const requested = normalizeWorkspaceId(requestedLeagueId);
  if (!requested) return leagues[0];

  return leagues.find(league => normalizeWorkspaceId(league?.id) === requested) || leagues[0];
}

module.exports = {
  normalizeWorkspaceId,
  selectLeagueForWorkspace,
};
