import mongoose from "mongoose";
import { connectMongo } from "./config/db";
import { logger } from "./config/logger";
import { emailQueue } from "./queues/emailQueue";
import { startEmailWorker } from "./queues/emailWorker";

// A process that ONLY sends e-mails: no web server, no sockets, no routes. Run it with
//   npm run dev:worker       (development)
//   node dist/worker.js      (production, after npm run build)
// and set EMAIL_WORKER_IN_API=false for the API so the two don't both do the work. (Running both
// would not break anything: BullMQ gives each job to exactly one worker.)
//
// Why separate? E-mails can be slow or fail; keeping that away from the API means a Resend outage
// can't slow down requests, you can restart or update one without the other, and under heavy
// load you can run more workers without running more APIs.
async function main() {
  await connectMongo(); // the worker reads bookings and marks them as e-mailed

  const emailWorker = startEmailWorker();
  logger.info("E-mail worker running");

  // Same graceful shutdown idea as server.ts: finish the e-mail being sent, then close everything.
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down the worker`);
    await emailWorker.close(); // waits for the job in progress
    await emailQueue.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error(err, "Failed to start the worker");
  process.exit(1);
});
