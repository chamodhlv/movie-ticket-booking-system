import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import mongoose from "mongoose";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { redis } from "./config/redis";

// WHY app.ts AND server.ts ARE SEPARATE:
// app.ts only builds the Express app (routes, middleware) and does NOT start listening.
// Later, our tests (Supertest) will import `app` directly and call it without opening
// a real port. server.ts is the only file that actually starts the server.
export const app = express();

app.use(helmet());
// credentials: true is needed later so the browser can send our login cookie.
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(pinoHttp({ logger })); // logs every request

// LIVENESS: "is the process alive?" (Docker/Kubernetes use this to restart a dead app)
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// READINESS: "can the app actually serve traffic?" (are MongoDB and Redis connected?)
// A load balancer uses this to decide whether to send users to this instance.
app.get("/ready", (_req, res) => {
  const mongoOk = mongoose.connection.readyState === 1; // 1 = connected
  const redisOk = redis.status === "ready";
  const ready = mongoOk && redisOk;

  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    mongo: mongoOk,
    redis: redisOk,
  });
});
