const { createHmac, timingSafeEqual } = require('node:crypto');
const { normalizeEntityId, toRuntimeEntityId } = require('./security/entityId');

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const JOIN_RECEIPT_TTL_SECONDS = 60 * 10;

function getSessionSecret() {
  const secret = process.env.PLAYER_SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== 'production') return 'birvo-local-preview-session-secret';
  return null;
}

function createSignature(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function createPlayerSessionToken(teamId, now = Date.now()) {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error('PLAYER_SESSION_SECRET must be configured before player login is enabled.');
  }

  const normalizedTeamId = normalizeEntityId(teamId);
  if (!normalizedTeamId) throw new Error('A valid team ID is required.');
  const expiresAt = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const payload = `${normalizedTeamId}.${expiresAt}`;
  return `${payload}.${createSignature(payload, secret)}`;
}

function verifyPlayerSessionToken(token, now = Date.now()) {
  const secret = getSessionSecret();
  if (!secret || typeof token !== 'string') return null;

  const [teamIdPart, expiresAtPart, signature] = token.split('.');
  const teamId = toRuntimeEntityId(teamIdPart);
  const expiresAt = Number.parseInt(expiresAtPart, 10);
  if (!teamId || !Number.isInteger(expiresAt) || expiresAt <= Math.floor(now / 1000) || !signature) {
    return null;
  }

  const payload = `${teamId}.${expiresAt}`;
  const expected = createSignature(payload, secret);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) {
    return null;
  }

  return { teamId, expiresAt };
}

function createJoinReceiptToken({ teamId, leagueId, pin, access = '' }, now = Date.now()) {
  const secret = getSessionSecret();
  if (!secret) throw new Error('PLAYER_SESSION_SECRET must be configured before registration is enabled.');
  const normalizedTeamId = normalizeEntityId(teamId);
  const normalizedLeagueId = normalizeEntityId(leagueId);
  if (!normalizedTeamId || !normalizedLeagueId) throw new Error('Valid team and league IDs are required.');
  const payload = Buffer.from(JSON.stringify({
    teamId: normalizedTeamId,
    leagueId: normalizedLeagueId,
    pin: String(pin),
    access: String(access),
    expiresAt: Math.floor(now / 1000) + JOIN_RECEIPT_TTL_SECONDS,
  })).toString('base64url');
  return `${payload}.${createSignature(payload, secret)}`;
}

function verifyJoinReceiptToken(token, now = Date.now()) {
  const secret = getSessionSecret();
  if (!secret || typeof token !== 'string') return null;
  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = createSignature(payload, secret);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) return null;

  try {
    const receipt = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const teamId = toRuntimeEntityId(receipt.teamId);
    const leagueId = toRuntimeEntityId(receipt.leagueId);
    if (!teamId || !leagueId || !/^\d{4}$/.test(receipt.pin) || typeof receipt.access !== 'string' || receipt.expiresAt <= Math.floor(now / 1000)) return null;
    return { ...receipt, teamId, leagueId };
  } catch {
    return null;
  }
}

module.exports = {
  JOIN_RECEIPT_TTL_SECONDS,
  SESSION_TTL_SECONDS,
  createJoinReceiptToken,
  createPlayerSessionToken,
  verifyJoinReceiptToken,
  verifyPlayerSessionToken,
};
