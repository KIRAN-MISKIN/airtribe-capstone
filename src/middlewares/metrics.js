const { httpRequestDuration } = require('../metrics/metrics');

function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;
    const route = req.route?.path ? `${req.baseUrl || ''}${req.route.path}` : 'unknown';
    httpRequestDuration
      .labels(req.method, route, String(res.statusCode))
      .observe(ms);
  });
  next();
}

module.exports = { metricsMiddleware };

