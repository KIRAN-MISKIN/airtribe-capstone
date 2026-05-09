const { genericHandler } = require('./handlers/genericHandler');

const handlers = {
  generic: genericHandler,
};

async function processor(job) {
  const jobId = job.data?.jobId;
  const type = job.name;
  const handler = handlers[type] || handlers.generic;
  const result = await handler({ ...job.data, type });
  return { jobId, result };
}

module.exports = { processor };

