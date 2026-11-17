import mongoose from "mongoose";
import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { connectMongo } from "./config/db";
import { redis } from "./config/redis";

async function main() {
  await connectMongo();

  const server = app.listen(env.PORT, () => {
    logger.info(`API running at http://localhost:${env.PORT}`);
  });

  // GRACEFUL SHUTDOWN: when Docker or a cloud platform stops the app, it sends SIGTERM.
  // We stop accepting new requests, let current ones finish, close connections,
  // then exit. Without this, a request in the middle of a payment could be cut off.
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
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
