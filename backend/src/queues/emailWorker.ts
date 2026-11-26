import { UnrecoverableError, Worker } from "bullmq";
import { Types } from "mongoose";
import { logger } from "../config/logger";
import {
  EmailSendError,
  sendTicketEmail,
} from "../modules/tickets/ticketEmail";
import { sweepMissingTicketEmails } from "../modules/tickets/ticketEmailSweeper";
import { workerConnection } from "./connection";
import {
  EMAIL_QUEUE,
  SWEEP_JOB,
  scheduleEmailSweeper,
  type EmailJobData,
  type TicketJobData,
} from "./emailQueue";

// The worker is the other half of the queue: it waits for jobs and runs the function below for
// each one. It can run inside the API process (server.ts) or as its own process (worker.ts);
// the code here is identical either way.
export function startEmailWorker() {
  const worker = new Worker<EmailJobData>(
    EMAIL_QUEUE,
    async (job) => {
      // The scheduled safety-net job (see scheduleEmailSweeper) has its own handler.
      if (job.name === SWEEP_JOB) {
        await sweepMissingTicketEmails();
        return;
      }
      // Any other job is a ticket e-mail. (A job's data type is the same for all names, so we
      // tell TypeScript which shape this name carries.)
      const { bookingId } = job.data as TicketJobData;
      try {
        await sendTicketEmail(new Types.ObjectId(bookingId));
      } catch (err) {
        // An error we KNOW can't be fixed by trying again (bad API key, a recipient Resend
        // forbids...) must not be retried 8 times. UnrecoverableError tells BullMQ to fail the
        // job at once. Everything else (network, Resend down, rate limit) is rethrown as it
        // is and BullMQ retries it after the backoff pause.
        if (err instanceof EmailSendError && !err.retryable) {
          throw new UnrecoverableError(err.message);
        }
        throw err;
      }
    },
    {
      connection: workerConnection,
      concurrency: 5, // up to 5 e-mails being prepared at once...
      // ...but never more than 2 sends per second: that is Resend's default rate limit.
      limiter: { max: 2, duration: 1000 },
    },
  );

  worker.on("failed", (job, err) => {
    // `failed` fires after EVERY failed attempt. It is only final when the attempts ran out or
    // the error was unrecoverable.
    const attempts = job?.opts.attempts ?? 1;
    const final =
      err instanceof UnrecoverableError || (job?.attemptsMade ?? 0) >= attempts;
    const what = job?.name === SWEEP_JOB ? "E-mail sweep" : "Ticket e-mail";
    const details = {
      jobId: job?.id,
      bookingId: job?.data.bookingId,
      attempt: job?.attemptsMade,
      err,
    };
    if (final) logger.error(details, `${what} FAILED for good`);
    else logger.warn(details, `${what} failed, will retry`);
  });
  worker.on("error", (err) => logger.error(err, "Email worker error"));

  // Whoever runs a worker also makes sure the safety-net schedule exists. It is safe to do from
  // every process (upsert), and a missing schedule must never stop the worker itself.
  scheduleEmailSweeper().catch((err) =>
    logger.error(err, "Could not schedule the e-mail sweeper"),
  );

  return worker;
}
