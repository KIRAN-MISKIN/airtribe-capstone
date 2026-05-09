// In bullmq v5, scheduler is automatically handled by Queue and Worker
// QueueScheduler is no longer needed to be explicitly instantiated

const queueScheduler = {
  close: async () => {
    // No-op: scheduler is handled automatically
  },
};

module.exports = { queueScheduler };

