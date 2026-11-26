import { logger } from "../../config/logger";
import {
  emailQueue,
  enqueueTicketEmail,
  ticketEmailJobId,
} from "../../queues/emailQueue";
import { Booking } from "../booking/booking.model";

// A booking is only looked at once it is this old. The normal flow queues its e-mail within
// milliseconds of the booking being created; waiting 2 minutes means we never race with it.
const MIN_AGE_MS = 2 * 60 * 1000;
// ...and not forever: after 3 days we stop trying, so one broken booking can't cause an
// endless stream of e-mails (and an old ticket e-mail is worth little anyway).
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
// At most this many per sweep, so one sweep can never flood the queue. The rest wait for the next one.
const BATCH_SIZE = 100;

// Finds confirmed bookings that never received their ticket e-mail AND have no job at all,
// and queues one. Returns how many it queued.
export async function sweepMissingTicketEmails(): Promise<number> {
  const now = Date.now();
  const candidates = await Booking.find({
    status: "confirmed",
    // `null` matches both "field is null" and "field doesn't exist", which is our case:
    // ticketEmailSentAt is only written after an e-mail was really sent.
    ticketEmailSentAt: null,
    createdAt: {
      $gte: new Date(now - MAX_AGE_MS),
      $lte: new Date(now - MIN_AGE_MS),
    },
  })
    .select("_id")
    .sort({ createdAt: 1 }) // oldest first
    .limit(BATCH_SIZE)
    .lean();

  let queued = 0;
  for (const { _id } of candidates) {
    const id = _id.toString();

    // HARD PART: only queue bookings that have NO job. A job that exists is either being worked on
    // (waiting, running, or waiting to retry) or it FAILED for good after all its retries. In both
    // cases queueing again would not help and would repeat a failing send every 5 minutes. A
    // permanently failed job is a problem for a human: it is logged as "FAILED for good"; fix the
    // cause (API key, address...) and run npm run email:test. What the sweeper does catch is
    // exactly the "was never queued / the queue lost it" case.
    if (await emailQueue.getJob(ticketEmailJobId(id))) continue;

    await enqueueTicketEmail(id);
    queued++;
  }

  if (queued > 0)
    logger.warn({ queued }, "Sweeper queued ticket e-mails that were missing");
  return queued;
}
