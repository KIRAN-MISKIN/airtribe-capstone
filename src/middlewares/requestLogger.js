const { env } = require('../config/env');
const { logger } = require('../utils/logger');

function requestLogger(req, res, next) {
  if (!env.observability.enableRequestLogging) return next();
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;

    logger.info(
      {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Number(ms.toFixed(2)),
      },
      'request'
    );
  });

  next();
}

module.exports = { requestLogger };

