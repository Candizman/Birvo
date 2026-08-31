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


module.exports = {
  DEFAULT_TTL_SECONDS,
  createPublicAccessToken,
  readTokenPayload,
  verifyPublicAccessToken,
};
