import { env } from "../config/env";

// BullMQ opens its OWN Redis connections (a worker needs a dedicated one for blocking commands),
// so we hand it connection SETTINGS instead of reusing `redis` from config/redis.ts.

// The WORKER waits for jobs using "blocking" Redis commands. Those must be allowed to wait
// forever, which is what `maxRetriesPerRequest: null` means. BullMQ refuses to start without it.
export const workerConnection = {
  url: env.REDIS_URL,
  maxRetriesPerRequest: null,
};

// The QUEUE (the part that ADDS jobs) is used inside web requests. HARD PART: if Redis is down,
// the default behaviour is to hold the command and wait for Redis to come back, so `queue.add`
// would hang and so would the Stripe webhook that called it. enableOfflineQueue: false makes it
// fail immediately instead, and our code can log the problem and carry on.
export const queueConnection = {
  url: env.REDIS_URL,
  enableOfflineQueue: false,
};
