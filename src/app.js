const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { createRateLimiter } = require('./middlewares/rateLimit');
const { requestId } = require('./middlewares/requestId');
const { responseTime } = require('./middlewares/responseTime');
const { requestLogger } = require('./middlewares/requestLogger');
const { metricsMiddleware } = require('./middlewares/metrics');

const { authRoutes } = require('./routes/authRoutes');
const { jobRoutes } = require('./routes/jobRoutes');
const { healthRoutes } = require('./routes/healthRoutes');
const { metricsRoutes } = require('./routes/metricsRoutes');
const { adminRoutes } = require('./routes/adminRoutes');

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.use(requestId);
  app.use(responseTime);
  app.use(createRateLimiter());
  app.use(metricsMiddleware);
  app.use(requestLogger);

  app.use(healthRoutes);
  app.use(metricsRoutes);
  app.use(adminRoutes);
  app.use(authRoutes);
  app.use(jobRoutes);

  // Error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.statusCode || 500;
    res.status(status).json({
      error: err.message || 'Internal server error',
      requestId: req.requestId,
    });
  });

  return app;
}

module.exports = { createApp };

