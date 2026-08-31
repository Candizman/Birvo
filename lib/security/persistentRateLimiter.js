const { createHash } = require('node:crypto');

/**
 * Hashes a rate-limit subject (an IP, an email, a team id) so the raw value never
 * reaches the database. The consume_rate_limit function in PostgreSQL stores and
 * matches on this digest, and validates its shape as 64 hex characters.
 */
function hashSubject(subject) {
  return createHash('sha256').update(String(subject).trim().toLowerCase()).digest('hex');
}

module.exports = { hashSubject };
