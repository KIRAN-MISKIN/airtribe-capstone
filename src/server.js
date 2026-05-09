require('dotenv').config();
const http = require('http');
const { env } = require('./config/env');
const { createApp } = require('./app');
const { logger } = require('./utils/logger');
const { prisma } = require('./db/prismaClient');
const { connection } = require('./config/redis');

let server;

async function start() {
  const app = createApp();
  server = http.createServer(app);

  server.listen(env.port, () => {
    logger.info({ port: env.port }, 'API server listening');
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down server...');
    await new Promise((resolve) => server.close(resolve));
    try {
      await connection.quit();
    } catch {}
    try {
      await prisma.$disconnect();
    } catch {}
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { start };

