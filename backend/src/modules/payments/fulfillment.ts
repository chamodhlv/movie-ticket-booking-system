import mongoose from "mongoose";
import type Stripe from "stripe";
import { logger } from "../../config/logger";
import { stripe } from "../../config/stripe";
import { emitSeatsBooked } from "../../realtime/socket";
import { BookedSeat } from "../booking/bookedSeat.model";
import { Booking } from "../booking/booking.model";
import { releaseSeats } from "../booking/holds";
import { Checkout } from "./checkout.model";
import { enqueueTicketEmail } from "../../queues/emailQueue";
import { createUniqueManualCode } from "../tickets/manualCode";

// =============================================================================
// TURNING A PAID PAYMENT INTO A BOOKING. This runs ONLY from Stripe's webhook, never because the
// browser says "I paid". The browser can lie or disconnect; Stripe's signed message can't be forged.
//
// THE RULES THAT KEEP IT SAFE
//  1. IDEMPOTENT. Stripe may send the same event several times, even at the same moment. Running
//     this twice must give exactly ONE booking. Two unique indexes enforce it:
//       Booking.paymentIntentId      -> one booking per payment
//       BookedSeat (showtime,seatId) -> one buyer per seat
//  2. ALL OR NOTHING. The booking and its seats are written in ONE database transaction.
//  3. MONEY BACK IF WE CAN'T DELIVER. If the seats were sold to someone else first, we refund.
//     Whichever payment SUCCEEDS first wins the seat; a Redis hold is only a courtesy lock.
// =============================================================================

// "Already exists" error from MongoDB's unique index (code 11000).
function isDuplicateKey(err: unknown) {
  const e = err as { code?: number; cause?: { code?: number } };
  return e?.code === 11000 || e?.cause?.code === 11000;
}

// Same error, but caused by one SPECIFIC unique index (MongoDB names the field in keyPattern).
function isDuplicateOn(err: unknown, field: string) {
  const e = err as {
    keyPattern?: Record<string, unknown>;
    cause?: { keyPattern?: Record<string, unknown> };
  };
  return !!(e?.keyPattern?.[field] ?? e?.cause?.keyPattern?.[field]);
}

// Thrown inside the transaction when someone else already finished this checkout.
class AlreadyProcessed extends Error {}

export type FulfillResult = "booked" | "already_done" | "refunded" | "unknown";

export async function fulfillPayment(
  pi: Stripe.PaymentIntent,
): Promise<FulfillResult> {
  const checkout = await Checkout.findOne({ paymentIntentId: pi.id });
  if (!checkout) {
    // A payment that isn't ours (e.g. created by hand in the Stripe Dashboard).
    logger.warn({ paymentIntent: pi.id }, "Payment has no checkout, ignoring");
    return "unknown";
  }
  if (checkout.status === "completed" || checkout.status === "refunded")
    return "already_done";

  // The amount actually charged must be exactly what we froze in the checkout.
  if (
    pi.amount_received !== checkout.totalAmount ||
    pi.currency !== checkout.currency.toLowerCase()
  ) {
    logger.error(
      {
        paymentIntent: pi.id,
        received: pi.amount_received,
        expected: checkout.totalAmount,
      },
      "Payment amount does not match the checkout, refunding",
    );
    await refund(checkout._id, pi.id, "amount_mismatch");
    return "refunded";
  }

  const showtimeId = checkout.showtime.toString();
  const seatIds = checkout.seats.map((s) => s.seatId);
  // Filled in inside the transaction below, used after it. The "!" tells TypeScript "I promise this
  // is assigned before it is read": it is, because the only way to reach the code that reads it
  // is for the transaction to have finished without throwing.
  let bookingId!: string;
  // The short code for the ticket. Made BEFORE the transaction, on purpose: a duplicate-key error
  // inside it is read as "someone else bought the seat", so we make sure the code is already
  // unique and that error can't come from here.
  const manualCode = await createUniqueManualCode();
  const session = await mongoose.startSession();
  try {
    // withTransaction retries by itself on harmless transient conflicts, e.g. when two copies of
    // the same webhook arrive at once and briefly collide.
    await session.withTransaction(async () => {
      const [booking] = await Booking.create(
        [
          {
            user: checkout.user,
            showtime: checkout.showtime,
            seats: checkout.seats,
            totalAmount: checkout.totalAmount,
            currency: checkout.currency,
            paymentIntentId: pi.id,
            manualCode,
            status: "confirmed",
          },
        ],
        { session },
      );
      bookingId = booking._id.toString();
      // If ANY seat is already sold, this throws a duplicate-key error and the whole transaction
      // (including the booking above) is rolled back as if nothing happened.
      await BookedSeat.insertMany(
        seatIds.map((seatId) => ({
          showtime: checkout.showtime,
          seatId,
          booking: booking._id,
        })),
        { session },
      );
      const done = await Checkout.updateOne(
        { _id: checkout._id, status: { $in: ["pending", "canceled"] } },
        { status: "completed", booking: booking._id },
        { session },
      );
      if (done.modifiedCount === 0) throw new AlreadyProcessed();
    });
  } catch (err) {
    if (err instanceof AlreadyProcessed) return "already_done";
    // Two payments drew the SAME manual code in the same instant (about 1 in a trillion). That is
    // NOT a seat conflict, so never refund for it: fail, and Stripe re-sends the webhook, which
    // draws a new code.
    if (isDuplicateOn(err, "manualCode")) throw err;
    if (!isDuplicateKey(err)) throw err; // a real failure: let Stripe retry the webhook later

    // Duplicate key: either THIS payment was already turned into a booking by a parallel copy of
    // the webhook (fine), or somebody else bought one of the seats first (we must refund).
    if (await Booking.exists({ paymentIntentId: pi.id })) {
      await Checkout.updateOne(
        { _id: checkout._id, status: { $in: ["pending", "canceled"] } },
        { status: "completed" },
      );
      return "already_done";
    }
    logger.warn(
      { paymentIntent: pi.id, showtimeId, seatIds },
      "Seats were sold to someone else first, refunding",
    );
    await refund(checkout._id, pi.id, "seats_unavailable");
    return "refunded";
  } finally {
    await session.endSession();
  }

  await afterBooked(showtimeId, checkout.user.toString(), seatIds, bookingId);
  return "booked";
}

// Best-effort tidying AFTER the booking is safely committed. A failure here must not undo the
// booking, so errors are only logged. (Part 10 will also queue the ticket e-mail here.)
// Best-effort tidying AFTER the booking is safely committed. A failure here must not undo the
// booking, so errors are only logged. Each step has its OWN try/catch so that one failing
// (say Redis is down) doesn't stop the others.
async function afterBooked(
  showtimeId: string,
  userId: string,
  seatIds: string[],
  bookingId: string,
) {
  try {
    await releaseSeats(showtimeId, userId, seatIds); // the seats are sold: drop our Redis holds
    emitSeatsBooked(showtimeId, seatIds); // everyone watching sees them turn "booked"
  } catch (err) {
    logger.error({ err, showtimeId }, "Post-booking cleanup failed");
  }

  try {
    // Queue the ticket e-mail. We do NOT send it here: the webhook must answer Stripe fast, and
    // the queue worker retries if sending fails. If even queueing fails the customer still has
    // the ticket page; only the e-mail is missing (npm run email:test can re-send it).
    await enqueueTicketEmail(bookingId);
  } catch (err) {
    logger.error({ err, bookingId }, "Could not queue the ticket e-mail");
  }
}

// Return the customer's money and record why. The idempotency key means that if we retry after a
// crash, Stripe won't refund twice.
export async function refund(
  checkoutId: mongoose.Types.ObjectId,
  paymentIntentId: string,
  reason: "seats_unavailable" | "amount_mismatch",
) {
  await stripe.refunds.create(
    { payment_intent: paymentIntentId, metadata: { reason } },
    { idempotencyKey: `refund-${paymentIntentId}` },
  );
  await Checkout.updateOne(
    { _id: checkoutId, status: { $in: ["pending", "canceled"] } },
    { status: "refunded", refundReason: reason },
  );
}

// The payment was canceled before it was paid (user went back, or it expired).
export async function markCanceled(paymentIntentId: string) {
  await Checkout.updateOne(
    { paymentIntentId, status: "pending" },
    { status: "canceled" },
  );
}
