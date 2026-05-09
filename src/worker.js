require('dotenv').config();
const { logger } = require('./utils/logger');
const { createWorker, shutdownAll } = require('./workers/workerRuntime');

const runtime = createWorker();

async function shutdown(signal) {
  await shutdownAll(runtime, signal);
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

logger.info({ concurrency: runtime.worker.opts.concurrency }, 'Worker started');

