const rateLimit = require("express-rate-limit");

/**
 * Login brute-force protection: 5 attempts per 15 min, keyed by IP+email.
 * Returns 429 with retryAfter (seconds) when exceeded.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // Only count failed attempts — successful logins should not consume the quota.
  skipSuccessfulRequests: true,
  // keyGenerator: (req) => `${req.ip}:${(req.body?.email || "").toString().toLowerCase()}`,
  keyGenerator: (req, res) => {
    const ip = rateLimit.ipKeyGenerator(req);
    const email = (req.body?.email || "").toString().toLowerCase();
    return `${ip}:${email}`;
  },
  handler: (req, res) => {
    // eslint-disable-next-line no-console
    console.warn(`[auth] rate-limit triggered ip=${req.ip} email=${(req.body?.email || "").slice(0, 64)}`);
    res.status(429).json({
      error: "too_many_attempts",
      retryAfter: Math.ceil((req.rateLimit?.resetTime - Date.now()) / 1000) || 900,
    });
  },
});

module.exports = { loginLimiter };
