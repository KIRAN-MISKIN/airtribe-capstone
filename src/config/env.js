const required = (key, fallback) => {
  const val = process.env[key] ?? fallback;
  if (val === undefined) throw new Error(`Missing env var: ${key}`);
  return val;
};

const num = (key, fallback) => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid number env var: ${key}`);
  return n;
};

const bool = (key, fallback) => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
};

const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: num('PORT', 3000),
  logLevel: process.env.LOG_LEVEL ?? 'info',

  databaseUrl: process.env.DATABASE_URL,

  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: num('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  worker: {
    concurrency: num('WORKER_CONCURRENCY', 5),
    queueName: (process.env.WORKER_QUEUE_NAME ?? 'job-queue').replaceAll(':', '-'),
    failedQueueName: (process.env.WORKER_FAILED_QUEUE_NAME ?? 'job-queue-failed').replaceAll(':', '-'),
  },

  bullmq: {
    attempts: num('JOB_ATTEMPTS', 3),
    backoffDelay: num('JOB_BACKOFF_DELAY', 2000),
    removeOnComplete: num('REMOVE_ON_COMPLETE', 100),
    removeOnFail: num('REMOVE_ON_FAIL', 500),
  },

  observability: {
    webhookSecret: process.env.WEBHOOK_SECRET ?? '',
    enableRequestLogging: bool('ENABLE_REQUEST_LOGGING', true),
  },

  admin: {
    user: process.env.ADMIN_USER ?? 'admin',
    pass: process.env.ADMIN_PASS ?? 'changeme',
  },
};

module.exports = { env, required };

