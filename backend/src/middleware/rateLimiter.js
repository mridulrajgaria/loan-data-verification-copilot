/**
 * In-Memory Sliding Window Rate Limiter
 *
 * Protects costly AI LLM endpoints from runaway loops, scraping, and cost spikes.
 * Limit: 30 requests per 60-second window per IP / User.
 */

const requestCounts = new Map();

/**
 * Express middleware to rate limit requests.
 *
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds (default 60s)
 * @param {number} options.maxRequests - Max allowed requests per window (default 30)
 */
function createRateLimiter({ windowMs = 60000, maxRequests = 30 } = {}) {
  return (req, res, next) => {
    const key = req.headers['x-user-id'] || req.ip || req.connection.remoteAddress || 'unknown-client';
    const now = Date.now();

    const record = requestCounts.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > record.resetAt) {
      record.count = 0;
      record.resetAt = now + windowMs;
    }

    record.count++;
    requestCounts.set(key, record);

    const remaining = Math.max(0, maxRequests - record.count);
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetAt / 1000));

    if (record.count > maxRequests) {
      return res.status(429).json({
        success: false,
        error: `Too Many Requests: Rate limit of ${maxRequests} AI calls per minute exceeded. Please retry in ${Math.ceil((record.resetAt - now) / 1000)} seconds.`,
      });
    }

    next();
  };
}

module.exports = {
  createRateLimiter,
  aiRateLimiter: createRateLimiter({ windowMs: 60000, maxRequests: 30 }),
};
