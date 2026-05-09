const crypto = require('crypto');
const { env } = require('../config/env');

function signPayload(payload) {
  const secret = env.observability.webhookSecret || '';
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

module.exports = { signPayload };

