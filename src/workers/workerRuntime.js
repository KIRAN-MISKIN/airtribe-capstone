const { Worker } = require('bullmq');
const { env } = require('../config/env');
const { connection } = require('../config/redis');
const { jobQueue, failedQueue } = require('../queues/jobQueue');
const { queueScheduler } = require('../queues/scheduler');
const { prisma } = require('../db/prismaClient');
const { logger } = require('../utils/logger');
const { fireWebhook } = require('../services/webhookService');
const { processor } = require('./processor');

async function createEvent(jobId, event, attempt, message, meta) {
  try {
    await prisma.jobEvent.create({
      data: {
        jobId,
        event,
        attempt,
        message: message || null,
        meta: meta || null,
      },
    });
  } catch (err) {
    logger.warn({ jobId, event, err: { message: err.message } }, 'Failed to write JobEvent');
  }
}

async function updateJob(jobId, data) {
  try {
    await prisma.job.update({ where: { id: jobId }, data });
  } catch (err) {
    logger.warn({ jobId, err: { message: err.message } }, 'Failed to update Job');
  }
}

function createWorker() {
  const worker = new Worker(env.worker.queueName, processor, {
    connection,
    concurrency: env.worker.concurrency,
  });

  worker.on('active', async (job) => {
    const jobId = job?.data?.jobId;
    if (!jobId) return;
    const attempt = (job.attemptsMade ?? 0) + 1;
    await updateJob(jobId, { status: 'started', startedAt: new Date() });
    await createEvent(jobId, 'started', attempt);
  });

  worker.on('completed', async (job, result) => {
    const jobId = job?.data?.jobId;
    if (!jobId) return;
    const attempt = (job.attemptsMade ?? 0) + 1;

    // food-order intermediate stages manage their own status transitions.
    // They return _skipSucceededStatus:true to prevent overwriting the stage status.
    const skipStatus = result?.result?._skipSucceededStatus === true;

    if (!skipStatus) {
      await updateJob(jobId, { status: 'succeeded', completedAt: new Date() });
    }
    await createEvent(jobId, 'succeeded', attempt, null, { result });

    const dbJob = await prisma.job.findUnique({ where: { id: jobId } }).catch(() => null);
    if (dbJob?.callbackUrl) {
      await fireWebhook(dbJob.callbackUrl, {
        jobId,
        status: 'succeeded',
        attempt,
        result,
        ts: new Date().toISOString(),
      });
    }
  });

  worker.on('failed', async (job, err) => {
    const jobId = job?.data?.jobId;
    if (!jobId) return;
    const attempt = (job.attemptsMade ?? 0) + 1;
    const max = job?.opts?.attempts ?? env.bullmq.attempts;
    const exhausted = attempt >= max;

    if (exhausted) {
      await updateJob(jobId, { status: 'failed', attempts: attempt, completedAt: new Date() });
      await createEvent(jobId, 'failed', attempt, err?.message, { exhausted: true });

      await failedQueue.add('dead', { jobId, original: { name: job.name, data: job.data } }, { jobId });

      const dbJob = await prisma.job.findUnique({ where: { id: jobId } }).catch(() => null);
      if (dbJob?.callbackUrl) {
        await fireWebhook(dbJob.callbackUrl, {
          jobId,
          status: 'failed',
          attempt,
          error: err?.message ?? 'Job failed',
          ts: new Date().toISOString(),
        });
      }
    } else {
      await updateJob(jobId, { status: 'retrying', attempts: attempt });
      await createEvent(jobId, 'retrying', attempt, err?.message, { exhausted: false });
    }
  });

  return { worker, queueScheduler, jobQueue, failedQueue, prisma };
}

async function shutdownAll(runtime, signal) {
  logger.info({ signal }, 'Shutting down worker...');
  try {
    await runtime.worker.close();
  } catch {}
  try {
    if (runtime.queueScheduler?.close) {
      await runtime.queueScheduler.close();
    }
  } catch {}
  try {
    await connection.quit();
  } catch {}
  try {
    await runtime.prisma.$disconnect();
  } catch {}
}

module.exports = { createWorker, shutdownAll };

