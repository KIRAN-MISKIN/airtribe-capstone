const { handleEmail } = require('./handlers/emailHandler');
const { handleReport } = require('./handlers/reportHandler');
const { handleWebhook } = require('./handlers/webhookHandler');
const { genericHandler } = require('./handlers/genericHandler');

async function processor(job) {
  const { type, payload } = job.data;
  const jobId = job.data?.jobId;

  let result;
  switch (type) {
    case 'email':
      result = await handleEmail(payload, jobId);
      break;
    case 'report':
      result = await handleReport(payload, jobId);
      break;
    case 'webhook':
      result = await handleWebhook(payload, jobId);
      break;
    default:
      if (type === 'generic' || job.name === 'generic') {
         result = await genericHandler({ ...job.data, type });
         break;
      }
      throw new Error(`Unknown job type: ${type}`);
  }

  return { jobId, result };
}

module.exports = { processor };
