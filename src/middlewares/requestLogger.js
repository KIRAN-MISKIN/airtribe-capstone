const { env } = require('../config/env');
const { logger } = require('../utils/logger');

function requestLogger(req, res, next) {
  if (!env.observability.enableRequestLogging) return next();
  const start = process.hrtime.bigint();

  // Capture input
  const { method, originalUrl, body, query, params } = req;

  // Intercept response to get output body
  const oldJson = res.json;
  const oldSend = res.send;
  let resBody;

  res.json = function (data) {
    resBody = data;
    return oldJson.apply(res, arguments);
  };

  res.send = function (data) {
    if (!resBody) {
      try { resBody = JSON.parse(data); } catch(e) { resBody = data; }
    }
    return oldSend.apply(res, arguments);
  };

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;

    logger.info({
      isRequestLog: true,
      requestId: req.requestId,
      method,
      originalUrl,
      query,
      params,
      body,
      status: res.statusCode,
      resBody,
      ms
    }, '');
  });

  next();
}

module.exports = { requestLogger };

