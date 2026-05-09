const { Queue } = require('bullmq');
const { env } = require('../config/env');
const { connection } = require('../config/redis');

const jobQueue = new Queue(env.worker.queueName, {
  connection,
  defaultJobOptions: {
    attempts: env.bullmq.attempts,
    backoff: { type: 'exponential', delay: env.bullmq.backoffDelay },
    removeOnComplete: env.bullmq.removeOnComplete,
    removeOnFail: env.bullmq.removeOnFail,
  },
});

const failedQueue = new Queue(env.worker.failedQueueName, {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 1000,
    removeOnFail: 1000,
  },
});

module.exports = { jobQueue, failedQueue };

