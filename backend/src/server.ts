import mongoose from "mongoose";
import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { connectMongo } from "./config/db";
import { redis } from "./config/redis";
import { emailQueue } from "./queues/emailQueue";
import { startEmailWorker } from "./queues/emailWorker";
import { closeSocket, initSocket } from "./realtime/socket";

async function main() {
  await connectMongo();

  const server = app.listen(env.PORT, () => {
    logger.info(`API running at http://localhost:${env.PORT}`);
  });

  // Live seat updates share the same port as the REST API.
  initSocket(server);

  // Sends the ticket e-mails that the payment webhook puts on the queue. In production we usually
  // run the worker as its own process instead (EMAIL_WORKER_IN_API=false, see src/worker.ts).
  const emailWorker = env.EMAIL_WORKER_IN_API ? startEmailWorker() : null;

  // GRACEFUL SHUTDOWN: when Docker or a cloud platform stops the app, it sends SIGTERM.
  // We stop accepting new requests, let current ones finish, close connections,
  // then exit. Without this, a request in the middle of a payment could be cut off.
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    // Open websocket connections would keep server.close() waiting forever,
    // so closeSocket() disconnects them first (and closes the HTTP server).
    closeSocket(async () => {
      // worker.close() waits for an e-mail that is being sent right now to finish (it needs
      // MongoDB for that), so it must come BEFORE mongoose.disconnect().
      await emailWorker?.close();
      await emailQueue.close();
      await mongoose.disconnect();
      redis.disconnect();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT")); // Ctrl+C
  process.on("SIGTERM", () => shutdown("SIGTERM")); // Docker / cloud stop
}

main().catch((err) => {
  logger.error(err, "Failed to start server");
  process.exit(1);
});
