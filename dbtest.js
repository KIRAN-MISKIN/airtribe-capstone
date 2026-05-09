// test.js
const { prisma } = require("./src/db/prisma");

async function main() {
  const job = await prisma.job.create({
    data: {
      type: "test",
      payload: { message: "hello" },
      scheduleAt: new Date(),
    },
  });

  console.log(job);
}

main();