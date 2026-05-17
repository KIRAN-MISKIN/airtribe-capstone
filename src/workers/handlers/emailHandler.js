const { UnrecoverableError } = require('bullmq');
const nodemailer = require('nodemailer');
const { prisma } = require('../../db/prismaClient');

// Create a transporter using SMTP config from environment variables
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function handleEmail(payload, jobId) {
  const { to, subject, body } = payload;
  
  if (!to || !subject || !body) {
    throw new UnrecoverableError('Missing to, subject, or body in email payload');
  }

  try {
    const fromEmail = payload.from || process.env.FROM_EMAIL || process.env.SMTP_USER;

    // If TO_EMAIL is set, redirect all emails there (useful for testing)
    const effectiveTo = process.env.TO_EMAIL || to;
    if (process.env.TO_EMAIL && process.env.TO_EMAIL !== to) {
      console.log(`[TO_EMAIL override] Redirecting email from ${to} → ${effectiveTo}`);
    }
    console.log(`Sending email to ${effectiveTo}: ${subject}`);
    
    // Send email using Nodemailer
    const info = await transporter.sendMail({
      from: fromEmail,
      to: effectiveTo,
      subject,
      text: body,
    });

    console.log(`Message sent: ${info.messageId}`);

    // Log the JobEvent
    if (jobId) {
      await prisma.jobEvent.create({
        data: {
          jobId,
          event: 'completed',
          attempt: 1,
          message: `Email sent to ${effectiveTo} (intended: ${to}). Message ID: ${info.messageId}`,
        }
      });
    }

    return { success: true, to: effectiveTo, intendedTo: to, subject, messageId: info.messageId };
  } catch (err) {
    console.error('Email sending failed:', err);
    // Hard bounce detection based on typical SMTP 550 codes
    if (err.responseCode === 550 || err.code === 550 || err.message.includes('550')) {
      // Hard bounce - move straight to DLQ without retrying
      throw new UnrecoverableError(`Hard bounce: ${err.message}`);
    }
    // Transient error - throw normally to trigger BullMQ retries
    throw err;
  }
}

module.exports = { handleEmail };
