const express = require('express');
const basicAuth = require('express-basic-auth');
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');

const { env } = require('../config/env');
const { jobQueue, failedQueue } = require('../queues/jobQueue');

const router = express.Router();

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(jobQueue), new BullMQAdapter(failedQueue)],
  serverAdapter,
});

router.use(
  '/admin/queues',
  basicAuth({
    users: { [env.admin.user]: env.admin.pass },
    challenge: true,
  }),
  serverAdapter.getRouter()
);

module.exports = { adminRoutes: router };

