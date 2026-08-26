const { createHmac, timingSafeEqual } = require('node:crypto');
const { normalizeEntityId } = require('./security/entityId');

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 90;
const PURPOSES = new Set(['standings', 'tv', 'player']);

function getPublicLinkSecret() {
  if (process.env.PUBLIC_LINK_SECRET) return process.env.PUBLIC_LINK_SECRET;
  if (process.env.NODE_ENV !== 'production') return 'birvo-local-preview-public-link-secret';
  return null;
}

function sign(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function createPublicAccessToken({ leagueId, purpose, expiresInSeconds = DEFAULT_TTL_SECONDS, version = 1 }, now = Date.now()) {
  const secret = getPublicLinkSecret();
  const normalizedLeagueId = normalizeEntityId(leagueId);
  if (!secret || !PURPOSES.has(purpose) || !normalizedLeagueId) return null;
  const payload = Buffer.from(JSON.stringify({
    leagueId: normalizedLeagueId,
    purpose,
    version: Number(version) || 1,
    expiresAt: Math.floor(now / 1000) + expiresInSeconds,
  })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

function verifyPublicAccessToken(token, { leagueId, purpose }, now = Date.now()) {
  const secret = getPublicLinkSecret();
  if (!secret || typeof token !== 'string' || !PURPOSES.has(purpose)) return false;
  const separator = token.lastIndexOf('.');
  if (separator <= 0) return false;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = sign(payload, secret);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) return false;

  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return normalizeEntityId(value.leagueId) === normalizeEntityId(leagueId)
      && value.purpose === purpose
      && value.expiresAt > Math.floor(now / 1000);
  } catch {
    return false;
  }
}

function readTokenPayload(token) {
  try {
    const separator = token.lastIndexOf('.');
    return JSON.parse(Buffer.from(token.slice(0, separator), 'base64url').toString('utf8'));
  } catch { return null; }
}

function getPublicLinkVersion(db, leagueId, purpose) {
  if (!db?.prepare) return 1;
  const normalizedLeagueId = normalizeEntityId(leagueId);
  if (!normalizedLeagueId) return 1;
  return db.prepare('SELECT token_version FROM public_link_settings WHERE league_id = ? AND purpose = ?').get(normalizedLeagueId, purpose)?.token_version || 1;
}

function hasPublicLeagueAccess(token, options, now = Date.now(), db = options?.db || null) {
  if (verifyPublicAccessToken(token, options, now)) {
    const payload = readTokenPayload(token);
    if (!payload || Number(payload.version || 1) !== getPublicLinkVersion(db, options.leagueId, options.purpose)) return false;
    if (db?.prepare) {
      const tokenHash = require('node:crypto').createHash('sha256').update(token).digest('hex');
      if (db.prepare('SELECT 1 FROM public_link_revocations WHERE token_hash = ?').get(tokenHash)) return false;
    }
    return true;
  }
  return process.env.NODE_ENV !== 'production' && !token;
}

module.exports = {
  DEFAULT_TTL_SECONDS,
  createPublicAccessToken,
  getPublicLinkVersion,
  hasPublicLeagueAccess,
  readTokenPayload,
  verifyPublicAccessToken,
};
