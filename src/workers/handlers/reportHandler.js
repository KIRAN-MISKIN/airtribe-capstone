const fs = require('fs');
const path = require('path');
const { prisma } = require('../../db/prismaClient');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function handleReport(payload, jobId) {
  const { reportType, userId, dateRange, outputPath } = payload;

  if (!reportType || !outputPath) {
    throw new Error('Missing reportType or outputPath in report payload');
  }

  // Simulate data processing
  await sleep(1500);

  let data = {};
  let rowCount = 0;

  if (reportType === 'weekly_sales') {
    data = {
      totalRevenue: 48320.50,
      totalOrders: 312,
      averageOrderValue: 154.87,
      topProduct: "Widget Pro"
    };
    rowCount = 312;
  } else if (reportType === 'user_activity') {
    data = {
      logins: 45,
      actions: 120,
      sessions: 30
    };
    rowCount = 120;
  } else if (reportType === 'system_health') {
    data = {
      queueDepth: 5,
      errorRate: 0.01,
      jobSuccessRate: 99.5
    };
    rowCount = 3;
  } else {
    data = { message: "Unknown report type" };
  }

  const result = {
    reportType,
    generatedAt: new Date().toISOString(),
    userId,
    dateRange,
    data
  };

  // Write to outputPath
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');

  if (jobId) {
    await prisma.jobEvent.create({
      data: {
        jobId,
        event: 'report_generated',
        attempt: 1,
        meta: { outputPath, rowCount }
      }
    });
  }

  return { summary: `Report generated at ${outputPath}`, rowCount };
}

module.exports = { handleReport };
