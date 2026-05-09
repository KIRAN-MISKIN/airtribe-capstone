const { prisma } = require('../db/prismaClient');

async function getStats(req, res) {
  const totals = await prisma.job.groupBy({
    by: ['status'],
    _count: { _all: true },
  });

  const totalCount = totals.reduce((a, r) => a + r._count._all, 0);
  const failedCount = totals.find((r) => r.status === 'failed')?._count._all ?? 0;

  const avg = await prisma.$queryRaw`
    SELECT AVG(EXTRACT(EPOCH FROM ("completedAt" - "startedAt")) * 1000) AS "avgMs"
    FROM "Job"
    WHERE "startedAt" IS NOT NULL AND "completedAt" IS NOT NULL
  `;

  const avgDurationMs = avg?.[0]?.avgMs ? Number(avg[0].avgMs) : null;
  const failureRate = totalCount > 0 ? failedCount / totalCount : 0;

  res.json({
    totalCount,
    byStatus: totals.map((r) => ({ status: r.status, count: r._count._all })),
    avgDurationMs,
    failureRate,
  });
}

module.exports = { getStats };

