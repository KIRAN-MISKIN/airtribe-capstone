const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

function apiKeyFromReq(req) {
  const apiKey = req.header('x-api-key') || req.query.apiKey;
  if (apiKey) return String(apiKey);
  return ipKeyGenerator(req);
}

function createRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: apiKeyFromReq,
  });
}

module.exports = { createRateLimiter };

