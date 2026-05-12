const { prisma } = require('../db/prismaClient');
const { createJob, getJobWithLatestEvent } = require('../services/jobService');
const { failedQueue } = require('../queues/jobQueue');

function parseIntSafe(v, fallback) {
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function postJob(req, res) {
  const { type, payload, scheduleAt, priority, callbackUrl, tags, maxAttempts, cron } = req.body || {};
  if (!type || (!scheduleAt && !cron)) {
    return res.status(400).json({ error: 'type and scheduleAt (or cron) are required' });
  }
  if (scheduleAt && cron) {
    return res.status(400).json({ error: 'scheduleAt and cron are mutually exclusive' });
  }

  const job = await createJob({
    type,
    payload: payload ?? {},
    scheduleAt,
    priority: parseIntSafe(priority, undefined),
    callbackUrl,
    tags,
    maxAttempts: parseIntSafe(maxAttempts, undefined),
    cron,
  });

  res.status(201).json({ job });
}

async function listJobs(req, res) {
  const limit = Math.min(parseIntSafe(req.query.limit, 25), 100);
  const cursor = req.query.cursor ? String(req.query.cursor) : null;

  const where = {};
  if (req.query.status) where.status = String(req.query.status);
  if (req.query.priority) where.priority = parseIntSafe(req.query.priority, undefined);
  if (req.query.tag) where.tags = { has: String(req.query.tag) };
  if (req.query.from || req.query.to) {
    where.createdAt = {};
    if (req.query.from) where.createdAt.gte = new Date(String(req.query.from));
    if (req.query.to) where.createdAt.lte = new Date(String(req.query.to));
  }

  const jobs = await prisma.job.findMany({
    where,
    orderBy: { id: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const nextCursor = jobs.length > limit ? jobs[limit].id : null;
  res.json({ jobs: jobs.slice(0, limit), nextCursor });
}

async function getJob(req, res) {
  const id = req.params.id;
  const job = await getJobWithLatestEvent(id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ job });
}

async function getJobEvents(req, res) {
  const id = req.params.id;
  const events = await prisma.jobEvent.findMany({
    where: { jobId: id },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ jobId: id, events });
}

async function listDeadLetter(req, res) {
  const start = parseIntSafe(req.query.start, 0);
  const end = parseIntSafe(req.query.end, 49);
  const jobs = await failedQueue.getJobs(['waiting', 'delayed', 'active', 'completed', 'failed'], start, end);
  res.json({
    count: jobs.length,
    jobs: jobs.map((j) => ({
      id: j.id,
      name: j.name,
      data: j.data,
      timestamp: j.timestamp,
      attemptsMade: j.attemptsMade,
      failedReason: j.failedReason,
    })),
  });
}

async function retryDead(req, res) {
  const id = req.params.id;
  const dead = await failedQueue.getJob(id);
  if (!dead) return res.status(404).json({ error: 'Dead-letter job not found' });

  const dbJob = await prisma.job.findUnique({ where: { id } });
  if (!dbJob) return res.status(404).json({ error: 'DB job not found' });

  await prisma.job.update({ where: { id }, data: { status: 'queued', attempts: 0, completedAt: null, startedAt: null } });
  await prisma.jobEvent.create({ data: { jobId: id, event: 'queued', attempt: 0, meta: { source: 'dead-letter' } } });

  const { enqueueJob } = require('../services/jobService');
  await enqueueJob(dbJob);

  await dead.remove();

  res.json({ ok: true, jobId: id });
}

async function cancelJob(req, res) {
  const id = req.params.id;
  const dbJob = await prisma.job.findUnique({ where: { id } });
  
  if (!dbJob) return res.status(404).json({ error: 'Job not found' });
  if (dbJob.status === 'completed' || dbJob.status === 'failed') {
    return res.status(400).json({ error: `Cannot cancel a job with status '${dbJob.status}'` });
  }

  // Remove from bull queue. The bull job ID is the same as our DB job ID.
  const { jobQueue } = require('../queues/jobQueue');
  const bullJob = await jobQueue.getJob(id);
  if (bullJob) {
    await bullJob.remove();
  }

  await prisma.job.update({ where: { id }, data: { status: 'cancelled' } });
  await prisma.jobEvent.create({ data: { jobId: id, event: 'cancelled', attempt: 0 } });

  res.json({ message: 'Job cancelled successfully', jobId: id });
}

async function rescheduleJob(req, res) {
  const id = req.params.id;
  const { scheduleAt, priority } = req.body;

  if (!scheduleAt) {
    return res.status(400).json({ error: 'scheduleAt is required' });
  }

  const dbJob = await prisma.job.findUnique({ where: { id } });
  if (!dbJob) return res.status(404).json({ error: 'Job not found' });
  
  if (dbJob.status !== 'pending' && dbJob.status !== 'queued') {
    return res.status(400).json({ error: `Cannot reschedule a job with status '${dbJob.status}'. Must be pending or queued.` });
  }

  const { jobQueue } = require('../queues/jobQueue');
  const bullJob = await jobQueue.getJob(id);
  if (bullJob) {
    await bullJob.remove();
  }

  const updatedData = { scheduleAt: new Date(scheduleAt) };
  if (priority !== undefined) {
    updatedData.priority = parseIntSafe(priority, undefined);
  }

  await prisma.job.update({ where: { id }, data: updatedData });
  
  const scheduleAtMs = new Date(scheduleAt).getTime();
  const delay = Math.max(0, scheduleAtMs - Date.now());

  await jobQueue.add(
    dbJob.type,
    { jobId: id, payload: dbJob.payload },
    {
      jobId: id,
      delay,
      priority: updatedData.priority ?? dbJob.priority,
      attempts: dbJob.maxAttempts,
      // fallback other opts safely
    }
  );

  await prisma.jobEvent.create({ 
    data: { 
      jobId: id, 
      event: 'rescheduled', 
      attempt: 0,
      meta: { oldSchedule: dbJob.scheduleAt, newSchedule: updatedData.scheduleAt }
    } 
  });

  const updatedJob = await prisma.job.findUnique({ where: { id } });
  res.json({ job: updatedJob });
}

module.exports = { postJob, listJobs, getJob, getJobEvents, listDeadLetter, retryDead, cancelJob, rescheduleJob };
