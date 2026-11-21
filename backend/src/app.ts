import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import mongoose from "mongoose";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { redis } from "./config/redis";
import { authRouter } from "./modules/auth/auth.routes";
import { errorHandler } from "./middleware/errorHandler";
import { catalogRouter } from "./modules/catalog/catalog.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { seatsRouter } from "./modules/booking/seats.routes";

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
app.use(cookieParser()); // fills req.cookies

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

// All business routes live under /api
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api", catalogRouter); // /api/movies, /api/cities, /api/showtimes/:id, ...
app.use("/api/showtimes", seatsRouter); // /api/showtimes/:id/seats and /hold (before catalogRouter)

// Unknown URL
app.use((_req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// MUST be registered LAST so it catches errors from everything above.
app.use(errorHandler);
