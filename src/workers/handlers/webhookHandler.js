const { UnrecoverableError } = require('bullmq');
const { prisma } = require('../../db/prismaClient');

async function handleWebhook(payload, jobId) {
  const { url, method = 'POST', headers = {}, body, timeoutMs = 5000 } = payload;

  if (!url) {
    throw new UnrecoverableError('Missing url in webhook payload');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const status = response.status;
    const responseText = await response.text();
    const bodyPreview = responseText.substring(0, 200);

    // Log the response status and body preview
    if (jobId) {
      await prisma.jobEvent.create({
        data: {
          jobId,
          event: 'webhook_called',
          attempt: 1, // BullMQ worker runtime tracks actual attempt, we'll just log 1 here or skip attempt field
          meta: { status, bodyPreview }
        }
      });
    }

    if (status >= 200 && status < 300) {
      return { success: true, status, response: bodyPreview };
    }

    if (status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      // For now, we just throw to let BullMQ handle the backoff
      throw new Error(`Rate limited (429). Retry-After: ${retryAfter || 'unknown'}`);
    }

    if (status >= 400 && status < 500) {
      // 4xx errors (except 429) should NOT retry
      return { success: false, status, reason: `Client error: ${status}` };
    }

    if (status >= 500) {
      throw new Error(`Server error: ${status}`);
    }

    return { success: true, status };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Network timeout after ${timeoutMs}ms`);
    }
    // Any other error (network error, dns, etc.) will throw and trigger retry
    throw err;
  }
}

module.exports = { handleWebhook };
