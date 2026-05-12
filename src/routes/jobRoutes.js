const express = require('express');
const { asyncHandler } = require('../middlewares/asyncHandler');
const { verifyToken } = require('../middlewares/authMiddleware');
const {
  postJob,
  listJobs,
  getJob,
  getJobEvents,
  listDeadLetter,
  retryDead,
  cancelJob,
  rescheduleJob
} = require('../controllers/jobController');
const { getStats } = require('../controllers/statsController');

const router = express.Router();

// Apply verifyToken to all routes defined in this router
router.use(verifyToken);

router.post('/jobs', asyncHandler(postJob));
router.get('/jobs', asyncHandler(listJobs));
router.get('/jobs/stats', asyncHandler(getStats));
router.get('/jobs/dead-letter', asyncHandler(listDeadLetter));
router.post('/jobs/:id/retry-dead', asyncHandler(retryDead));
router.get('/jobs/:id', asyncHandler(getJob));
router.delete('/jobs/:id', asyncHandler(cancelJob));
router.patch('/jobs/:id', asyncHandler(rescheduleJob));
router.get('/jobs/:id/events', asyncHandler(getJobEvents));

module.exports = { jobRoutes: router };
