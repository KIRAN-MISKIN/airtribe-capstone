const express = require('express');
const { asyncHandler } = require('../middlewares/asyncHandler');
const {
  postJob,
  listJobs,
  getJob,
  getJobEvents,
  listDeadLetter,
  retryDead,
} = require('../controllers/jobController');
const { getStats } = require('../controllers/statsController');

const router = express.Router();

router.post('/jobs', asyncHandler(postJob));
router.get('/jobs', asyncHandler(listJobs));
router.get('/jobs/stats', asyncHandler(getStats));
router.get('/jobs/dead-letter', asyncHandler(listDeadLetter));
router.post('/jobs/:id/retry-dead', asyncHandler(retryDead));
router.get('/jobs/:id', asyncHandler(getJob));
router.get('/jobs/:id/events', asyncHandler(getJobEvents));

module.exports = { jobRoutes: router };

