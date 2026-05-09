const { prisma } = require('../db/prismaClient');
const { jobQueue } = require('../queues/jobQueue');
const { env } = require('../config/env');

async function enqueueJob(job) {
  const scheduleAtMs = new Date(job.scheduleAt).getTime();
  const delay = Math.max(0, scheduleAtMs - Date.now());

  await jobQueue.add(
    job.type,
    { jobId: job.id, payload: job.payload },
    {
      jobId: job.id,
      delay,
      priority: job.priority,
      attempts: job.maxAttempts ?? env.bullmq.attempts,
      backoff: { type: 'exponential', delay: env.bullmq.backoffDelay },
      removeOnComplete: env.bullmq.removeOnComplete,
      removeOnFail: env.bullmq.removeOnFail,
    }
  );
}

async function createJob({ type, payload, scheduleAt, priority, callbackUrl, tags, maxAttempts }) {
  const job = await prisma.job.create({
    data: {
      type,
      payload,
      scheduleAt: new Date(scheduleAt),
      priority: priority ?? 5,
      callbackUrl: callbackUrl ?? null,
      tags: Array.isArray(tags) ? tags : [],
      maxAttempts: maxAttempts ?? env.bullmq.attempts,
      status: 'queued',
    },
  });

  await prisma.jobEvent.create({
    data: { jobId: job.id, event: 'queued', attempt: 0 },
  });

  await enqueueJob(job);

  return job;
}

async function getJobWithLatestEvent(id) {
  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      events: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  return job;
}

module.exports = { createJob, enqueueJob, getJobWithLatestEvent };

