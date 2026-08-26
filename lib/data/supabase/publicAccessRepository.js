const { createHash } = require('node:crypto');
const { requireUuid } = require('./workspaceRepository');
const { unwrapSupabaseResult } = require('./errors');
const { readTokenPayload, verifyPublicAccessToken } = require('../../publicAccess');

const PURPOSES = new Set(['standings', 'tv', 'player']);

function requirePurpose(purpose) {
  const normalized = String(purpose || '').trim();
  if (!PURPOSES.has(normalized)) throw new Error('Invalid public-link purpose.');
  return normalized;
}

async function getPublicLinkVersion(client, { leagueId, purpose }) {
  const normalizedLeagueId = requireUuid(leagueId, 'public-link league scope');
  const normalizedPurpose = requirePurpose(purpose);
  const result = await client
    .from('public_link_settings')
    .select('token_version')
    .eq('league_id', normalizedLeagueId)
    .eq('purpose', normalizedPurpose)
    .maybeSingle();
  const row = unwrapSupabaseResult(result, 'read public-link version');
  return Number(row?.token_version || 1);
}

async function getPublicLinkVersions(client, { courseId, leagueId, purposes = ['standings', 'tv', 'player'] }) {
  const normalizedCourseId = requireUuid(courseId, 'public-link course scope');
  const normalizedLeagueId = requireUuid(leagueId, 'public-link league scope');
  const normalizedPurposes = [...new Set(purposes.map(requirePurpose))];
  if (normalizedPurposes.length === 0) return {};
  const result = await client
    .from('public_link_settings')
    .select('purpose,token_version')
    .eq('course_id', normalizedCourseId)
    .eq('league_id', normalizedLeagueId)
    .in('purpose', normalizedPurposes);
  const rows = unwrapSupabaseResult(result, 'read public-link versions') || [];
  const storedVersions = new Map(rows.map(row => [row.purpose, Number(row.token_version || 1)]));
  return Object.fromEntries(normalizedPurposes.map(purpose => [purpose, storedVersions.get(purpose) || 1]));
}

async function validatePublicLeagueAccess(client, token, { leagueId, purpose }, now = Date.now()) {
  const normalizedLeagueId = requireUuid(leagueId, 'validate public league access');
  const normalizedPurpose = requirePurpose(purpose);
  if (!verifyPublicAccessToken(token, { leagueId: normalizedLeagueId, purpose: normalizedPurpose }, now)) {
    return false;
  }
  const payload = readTokenPayload(token);
  if (!payload) return false;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const [version, revocationResult] = await Promise.all([
    getPublicLinkVersion(client, { leagueId: normalizedLeagueId, purpose: normalizedPurpose }),
    client.from('public_link_revocations').select('id').eq('token_hash', tokenHash).maybeSingle(),
  ]);
  const revocation = unwrapSupabaseResult(revocationResult, 'read public-link revocation');
  return Number(payload.version || 1) === version && !revocation;
}

module.exports = {
  getPublicLinkVersion,
  getPublicLinkVersions,
  validatePublicLeagueAccess,
};
