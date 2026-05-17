const nodemailer = require('nodemailer');
const { prisma } = require('../../db/prismaClient');
const { jobQueue } = require('../../queues/jobQueue');

// ─── Stage definitions ────────────────────────────────────────────────────────
const STAGES = [
  {
    key: 'order_processing',
    label: 'Order Processing',
    subject: '🛒 Your order is being processed!',
    message: 'We have received your food order and it is now being processed. Sit tight!',
  },
  {
    key: 'food_preparing',
    label: 'Food Preparing',
    subject: '👨‍🍳 Your food is being prepared!',
    message: 'Our chefs are working hard to prepare your delicious meal. It won\'t be long!',
  },
  {
    key: 'food_ready',
    label: 'Food Ready to Pick Up',
    subject: '✅ Your food is ready for pickup!',
    message: 'Your order is ready and waiting for the delivery partner to pick it up.',
  },
  {
    key: 'out_for_delivery',
    label: 'Out for Delivery',
    subject: '🚴 Your order is out for delivery!',
    message: 'Your food is on its way! Expect delivery within the estimated time.',
  },
  {
    key: 'delivered',
    label: 'Delivered',
    subject: '🎉 Your order has been delivered!',
    message: 'Your food has been delivered. Enjoy your meal! Thank you for ordering with us.',
  },
];

const STAGE_DELAY_MS = Number(process.env.FOOD_ORDER_STAGE_DELAY_MS) || (3 * 60 * 1000); // default: 3 minutes

// ─── Email transporter ────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ─── Send stage notification email ───────────────────────────────────────────
async function sendStageEmail({ to, customerName, orderId, stage }) {
  const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER;

  // If TO_EMAIL is set, redirect all emails there (useful for testing)
  const effectiveTo = process.env.TO_EMAIL || to;
  if (process.env.TO_EMAIL && process.env.TO_EMAIL !== to) {
    console.log(`[TO_EMAIL override] Redirecting food-order email from ${to} → ${effectiveTo}`);
  }

  const greeting = customerName ? `Hi ${customerName},` : 'Hello,';
  const text = `${greeting}\n\n${stage.message}\n\nOrder ID: ${orderId}\nStatus: ${stage.label}\n\nThank you for your order!\nChronos Food Delivery`;

  const info = await transporter.sendMail({
    from: fromEmail,
    to: effectiveTo,
    subject: `${stage.subject} (Order #${orderId})`,
    text,
  });

  console.log(`[FoodOrder] Stage email sent to ${effectiveTo}: ${info.messageId}`);
  return info.messageId;
}

// ─── Schedule the next stage as a delayed BullMQ job ─────────────────────────
async function scheduleNextStage({ jobId, payload, nextStageIndex }) {
  // BullMQ forbids ":" in custom job IDs — use "-" as separator
  const stageJobId = `${jobId}-stage-${nextStageIndex}`;

  await jobQueue.add(
    'food-order',
    {
      jobId,           // parent DB job ID — keeps audit trail on one record
      payload: {
        ...payload,
        _stageIndex: nextStageIndex,
      },
      type: 'food-order',
    },
    {
      jobId: stageJobId,
      delay: STAGE_DELAY_MS,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    }
  );

  console.log(`[FoodOrder] Scheduled stage ${nextStageIndex} for job ${jobId} (delay: ${STAGE_DELAY_MS}ms)`);
}

// ─── Main handler ─────────────────────────────────────────────────────────────
async function handleFoodOrder(payload, jobId) {
  const { customerEmail, customerName, orderId, items } = payload;

  // Validate required fields
  if (!customerEmail) {
    throw new Error('customerEmail is required in food-order payload');
  }
  if (!orderId) {
    throw new Error('orderId is required in food-order payload');
  }

  // Determine which stage we're processing (defaults to 0 = first stage)
  const stageIndex = typeof payload._stageIndex === 'number' ? payload._stageIndex : 0;
  const stage = STAGES[stageIndex];

  if (!stage) {
    throw new Error(`Invalid stage index: ${stageIndex}`);
  }

  console.log(`[FoodOrder] Processing stage ${stageIndex} (${stage.label}) for order ${orderId}`);

  // 1. Send email notification for this stage
  let messageId = null;
  try {
    messageId = await sendStageEmail({
      to: customerEmail,
      customerName,
      orderId,
      stage,
    });
  } catch (emailErr) {
    // Log the email failure but don't fail the whole stage —
    // the stage transition should still happen even if email is down.
    console.error(`[FoodOrder] Email failed for stage ${stageIndex}:`, emailErr.message);
  }

  // 2. Record a JobEvent for this stage transition
  if (jobId) {
    await prisma.jobEvent.create({
      data: {
        jobId,
        event: stage.key,
        attempt: stageIndex + 1,
        message: `Stage: ${stage.label}`,
        meta: {
          stageIndex,
          stageKey: stage.key,
          orderId,
          customerEmail,
          emailMessageId: messageId,
          items: items || [],
        },
      },
    });

    // 3. Update the parent job's status field to reflect current stage
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: stageIndex === STAGES.length - 1 ? 'succeeded' : stage.key,
      },
    });
  }

  // 4. If there are more stages, schedule the next one
  const nextStageIndex = stageIndex + 1;
  if (nextStageIndex < STAGES.length) {
    await scheduleNextStage({ jobId, payload, nextStageIndex });
  }

  const isCompleted = nextStageIndex >= STAGES.length;

  return {
    success: true,
    orderId,
    stage: stage.key,
    stageLabel: stage.label,
    stageIndex,
    totalStages: STAGES.length,
    emailSent: !!messageId,
    emailMessageId: messageId,
    isCompleted,
    // Tell workerRuntime NOT to overwrite the stage status with 'succeeded'
    // for intermediate stages — the final stage already sets status:'succeeded' in DB.
    _skipSucceededStatus: !isCompleted,
  };
}

module.exports = { handleFoodOrder, STAGES, STAGE_DELAY_MS };
