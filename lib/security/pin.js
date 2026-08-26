const { randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');

const HASH_PREFIX = 'scrypt';

function isHashedTeamPin(value) {
  return typeof value === 'string' && value.startsWith(`${HASH_PREFIX}$`);
}

function hashTeamPin(pin) {
  const normalized = String(pin || '').trim();
  if (!/^\d{4}$/.test(normalized)) throw new Error('PIN must contain exactly four digits.');
  const salt = randomBytes(16).toString('base64url');
  const hash = scryptSync(normalized, salt, 32).toString('base64url');
  return `${HASH_PREFIX}$${salt}$${hash}`;
}

function verifyTeamPin(pin, storedValue) {
  const normalized = String(pin || '').trim();
  if (!/^\d{4}$/.test(normalized) || typeof storedValue !== 'string') return false;

  if (!isHashedTeamPin(storedValue)) {
    const received = Buffer.from(normalized);
    const stored = Buffer.from(storedValue);
    return received.length === stored.length && timingSafeEqual(received, stored);
  }

  const [, salt, expectedHash] = storedValue.split('$');
  if (!salt || !expectedHash) return false;
  const receivedHash = Buffer.from(scryptSync(normalized, salt, 32).toString('base64url'));
  const expected = Buffer.from(expectedHash);
  return receivedHash.length === expected.length && timingSafeEqual(receivedHash, expected);
}

module.exports = { hashTeamPin, verifyTeamPin, isHashedTeamPin };
