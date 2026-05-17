const { handleEmail } = require('./handlers/emailHandler');
const { handleReport } = require('./handlers/reportHandler');
const { handleWebhook } = require('./handlers/webhookHandler');
const { genericHandler } = require('./handlers/genericHandler');
const { handleFoodOrder } = require('./handlers/foodOrderHandler');

async function processor(job) {
  // job.data.type is set by stage-chaining (food-order next stages).
  // For initial jobs, the type lives in job.name (the BullMQ job name).
  const type = job.data?.type || job.name;
  const payload = job.data?.payload;
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
    case 'food-order':
      result = await handleFoodOrder(payload, jobId);
      break;
    case 'generic':
      result = await genericHandler(payload ?? {});
      break;
    default:
      throw new Error(`Unknown job type: ${type}`);
  }

  return { jobId, result };
}

module.exports = { processor };
