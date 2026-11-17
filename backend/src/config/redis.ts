import Redis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

export const redis = new Redis(env.REDIS_URL);

redis.on("connect", () => logger.info("Redis connected"));
// Without an "error" listener, a Redis hiccup would crash the whole process.
redis.on("error", (err) => logger.error(err, "Redis error"));
