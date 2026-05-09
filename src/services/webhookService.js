const { logger } = require('../utils/logger');
const { signPayload } = require('../utils/sign');

async function fireWebhook(url, payload) {
  if (!url) return;
  const body = JSON.stringify(payload);
  const signature = signPayload(body);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-chronos-signature': signature,
      },
      body,
    });

    if (!res.ok) {
      logger.warn({ url, status: res.status }, 'Webhook delivery non-2xx');
    }
  } catch (err) {
    logger.warn({ url, err: { message: err.message } }, 'Webhook delivery failed');
  }
}

module.exports = { fireWebhook };

