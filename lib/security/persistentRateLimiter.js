const { createHash } = require('node:crypto');

function hashSubject(subject) {
  return createHash('sha256').update(String(subject).trim().toLowerCase()).digest('hex');
}

function checkPersistentRateLimit(db, { scope, subject, maxRequests = 5, windowMs = 15 * 60 * 1000 }) {
  if (!scope || !subject) return { allowed: false, remaining: 0, retryAfterSeconds: 60 };
  const subjectHash = hashSubject(subject);
  const cutoff = new Date(Date.now() - windowMs).toISOString();

  return db.transaction(() => {
    db.prepare('DELETE FROM rate_limit_events WHERE occurred_at < ?').run(cutoff);
    const recent = db.prepare(`
      SELECT occurred_at FROM rate_limit_events
      WHERE scope = ? AND subject_hash = ? AND occurred_at >= ?
      ORDER BY occurred_at ASC
    `).all(scope, subjectHash, cutoff);

    if (recent.length >= maxRequests) {
      const oldest = new Date(recent[0].occurred_at).getTime();
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - Date.now()) / 1000)),
      };
    }

    db.prepare('INSERT INTO rate_limit_events (scope, subject_hash) VALUES (?, ?)').run(scope, subjectHash);
    return { allowed: true, remaining: maxRequests - recent.length - 1, retryAfterSeconds: 0 };
  })();
}

module.exports = { checkPersistentRateLimit, hashSubject };
