const { prisma } = require('../db/prismaClient');
const { jobQueue } = require('../queues/jobQueue');
const { env } = require('../config/env');

async function enqueueJob(job) {
  const scheduleAtMs = job.scheduleAt ? new Date(job.scheduleAt).getTime() : Date.now();
  const delay = Math.max(0, scheduleAtMs - Date.now());

  const options = {
    jobId: job.id,
    priority: job.priority,
    attempts: job.maxAttempts ?? env.bullmq.attempts,
    backoff: { type: 'exponential', delay: env.bullmq.backoffDelay },
    removeOnComplete: env.bullmq.removeOnComplete,
    removeOnFail: env.bullmq.removeOnFail,
  };

  if (job.cron) {
    options.repeat = { pattern: job.cron };
  } else {
    options.delay = delay;
  }

  await jobQueue.add(
    job.type,
    { jobId: job.id, payload: job.payload },
    options
  );
}

async function createJob({ type, payload, scheduleAt, priority, callbackUrl, tags, maxAttempts, cron }) {
  const job = await prisma.job.create({
    data: {
      type,
      payload,
      scheduleAt: scheduleAt ? new Date(scheduleAt) : new Date(),
      priority: priority ?? 5,
      callbackUrl: callbackUrl ?? null,
      tags: Array.isArray(tags) ? tags : [],
      maxAttempts: maxAttempts ?? env.bullmq.attempts,
      status: 'queued',
      // Store cron in payload since it's not in the db schema natively, wait.
      // The schema doesn't have cron. Let's add it to payload or update schema?
      // Spec says: Accept an optional `cron` field in the request body.
      // It doesn't mention adding cron to the DB schema, but we need it for enqueueJob.
      // I'll attach it to the job object before returning it, or pass it to enqueueJob directly.
    },
  });

  job.cron = cron; // attach for enqueueJob

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

