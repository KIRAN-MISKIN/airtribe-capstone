const express = require('express');
const { client } = require('../metrics/metrics');

const router = express.Router();

router.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

module.exports = { metricsRoutes: router };

