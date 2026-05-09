const IORedis = require('ioredis');
const { env } = require('./env');
const { logger } = require('../utils/logger');

const connection = new IORedis({
  host: env.redis.host,
  port: env.redis.port,
  password: env.redis.password,
  maxRetriesPerRequest: null,
});

connection.on('error', (err) => {
  logger.warn({ err: { message: err.message } }, 'Redis connection error');
});

module.exports = { connection };

