import pino from "pino";
import { env } from "./env";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  // Pretty colored logs while developing, plain JSON in production
  // (JSON is what log tools like CloudWatch or Grafana Loki understand).
  transport:
    env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
});
