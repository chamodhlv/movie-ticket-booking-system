import { Queue } from "bullmq";
import { logger } from "../config/logger";
import { queueConnection } from "./connection";

export const EMAIL_QUEUE = "email";

// This queue carries two kinds of job, told apart by the job's NAME:
//   "ticket" -> { bookingId }  send the ticket e-mail for one booking
//   "sweep"  -> {}             look for bookings whose e-mail never got queued (see below)
export const TICKET_JOB = "ticket";
export const SWEEP_JOB = "sweep";
export type TicketJobData = { bookingId: string };
export type EmailJobData = TicketJobData | Record<string, never>;

// WHY A QUEUE AT ALL? The Stripe webhook must answer quickly, and sending e-mail is slow and can
// fail (Resend down, rate limit, no internet). With a queue the webhook only writes a small job
// to Redis ("send a ticket for booking X") and returns. A separate worker does the sending,
// and if it fails the job is kept and retried by BullMQ.
export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE, {
  connection: queueConnection,
  defaultJobOptions: {
    // 8 tries with a doubling pause: 10s, 20s, 40s, 80s, 160s, 320s, 640s (about 20 minutes in total).
    attempts: 8,
    backoff: { type: "exponential", delay: 10_000 },
    // Keep finished jobs a day (handy for debugging), failed ones a week, then Redis forgets them.
    removeOnComplete: { age: 24 * 3600, count: 1000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

// Without an "error" listener a Redis problem would crash the whole process (same as config/redis.ts).
emailQueue.on("error", (err) => logger.error(err, "Email queue error"));

// The job id is the booking: adding the same job twice (a duplicate webhook, say) is ignored
// by BullMQ while the first one still exists. Use "-" not ":" in custom ids; ":" is
// Redis's own separator and BullMQ rejects it.
export const ticketEmailJobId = (bookingId: string) =>
  `ticket-email-${bookingId}`;

export async function enqueueTicketEmail(bookingId: string) {
  await emailQueue.add(
    TICKET_JOB,
    { bookingId },
    { jobId: ticketEmailJobId(bookingId) },
  );
}

// THE SAFETY NET. Queueing can fail (Redis was down at the moment of payment) or the queued job
// can be lost (Redis restarted without saving). A "job scheduler" is BullMQ's cron: every
// 5 minutes it adds a "sweep" job, and the worker runs modules/tickets/ticketEmailSweeper.ts.
// upsert = "create it, or update it if it already exists", so calling this on every start-up,
// from any number of processes, never produces duplicate schedules.
export async function scheduleEmailSweeper() {
  await emailQueue.upsertJobScheduler(
    "ticket-email-sweeper",
    { every: 5 * 60 * 1000 },
    {
      name: SWEEP_JOB,
      data: {},
      // One try is enough: the next sweep runs in 5 minutes anyway. And don't pile up history.
      opts: {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: { count: 20 },
      },
    },
  );
}
