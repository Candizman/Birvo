const operationsRepository = require('./supabase/operationsRepository');
const { hashSubject } = require('../security/persistentRateLimiter');

async function checkDataRateLimit({
  adminClient,
  scope,
  subject,
  maxRequests = 5,
  windowMs = 15 * 60 * 1000,
}) {
  if (!adminClient) {
    return { allowed: false, remaining: 0, retryAfterSeconds: 60 };
  }
  return operationsRepository.consumeRateLimit(adminClient, {
    scope,
    subjectHash: hashSubject(subject),
    maxRequests,
    windowSeconds: Math.max(1, Math.ceil(windowMs / 1000)),
  });
}

module.exports = { checkDataRateLimit };
