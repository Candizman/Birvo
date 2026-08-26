const rateLimitStore = new Map();

function checkRateLimit(key, maxRequests = 10, windowMs = 60000) {
  const now = Date.now();
  const entry = rateLimitStore.get(key) || { timestamps: [] };

  // Remove timestamps outside window
  const validTimestamps = entry.timestamps.filter(ts => now - ts < windowMs);

  if (validTimestamps.length >= maxRequests) {
    const oldest = validTimestamps[0];
    const retryAfterSeconds = Math.ceil((oldest + windowMs - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds
    };
  }

  validTimestamps.push(now);
  rateLimitStore.set(key, { timestamps: validTimestamps });

  return {
    allowed: true,
    remaining: maxRequests - validTimestamps.length,
    retryAfterSeconds: 0
  };
}

function clearRateLimits() {
  rateLimitStore.clear();
}

module.exports = {
  checkRateLimit,
  clearRateLimits
};
