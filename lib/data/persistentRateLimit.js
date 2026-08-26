const { DATA_BACKENDS } = require('./backend');
const operationsRepository = require('./supabase/operationsRepository');
const sqliteRateLimiter = require('../security/persistentRateLimiter');

async function checkDataRateLimit({
  backend,
  sqliteDb,
  adminClient,
  scope,
  subject,
  maxRequests = 5,
  windowMs = 15 * 60 * 1000,
}) {
  if (backend === DATA_BACKENDS.SUPABASE) {
    if (!adminClient) {
      return { allowed: false, remaining: 0, retryAfterSeconds: 60 };
    }
    return operationsRepository.consumeRateLimit(adminClient, {
      scope,
      subjectHash: sqliteRateLimiter.hashSubject(subject),
      maxRequests,
      windowSeconds: Math.max(1, Math.ceil(windowMs / 1000)),
    });
  }
  return sqliteRateLimiter.checkPersistentRateLimit(sqliteDb, {
    scope, subject, maxRequests, windowMs,
  });
}

module.exports = { checkDataRateLimit };
