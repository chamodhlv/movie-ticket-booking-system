import { Types } from "mongoose";
import { stripe } from "../../config/stripe";
import { HttpError } from "../../utils/httpError";
import { BookedSeat } from "../booking/bookedSeat.model";
import { CURRENCY } from "../booking/booking.constants";
import { prepareCheckoutHolds } from "../booking/holds";
import { Hall } from "../catalog/hall.model";
import { Showtime } from "../catalog/showtime.model";
import { User } from "../users/user.model";
import { Checkout } from "./checkout.model";
import { priceSeats, type SeatLine } from "./pricing";

// States of a Stripe PaymentIntent in which the customer can still (re)try to pay.
const PAYABLE = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
]);

export type CheckoutStart =
  | {
      state: "payable";
      checkoutId: string;
      clientSecret: string; // lets Stripe.js in the browser finish THIS payment (and nothing else)
      amount: number;
      currency: string;
      seats: SeatLine[];
      holdExpiresAt: number; // Redis clock, ms since 1970
      serverTime: number; // Redis clock now, so the browser can count down correctly
    }
  | { state: "processing"; checkoutId: string }; // already paid, waiting for the webhook

// STEP 1 OF PAYING: "Continue to payment". Turns the seats the user holds into a Stripe payment.
// It is safe to call twice (React in development calls effects twice, users double-click, pages
// get reloaded): an identical open checkout is REUSED instead of creating a second payment.
export async function createCheckout(
  userId: string,
  showtimeId: Types.ObjectId,
): Promise<CheckoutStart> {
  const showtime = await Showtime.findById(showtimeId).lean();
  if (!showtime) throw new HttpError(404, "Showtime not found");
  if (showtime.status !== "scheduled")
    throw new HttpError(409, "This showtime was cancelled");
  if (showtime.startTime.getTime() <= Date.now())
    throw new HttpError(409, "This showtime has already started");

  // WHICH SEATS? Not from the browser: from OUR holds. These are exactly the seats this user
  // holds right now, and the call also gives them enough time to pay (extended once).
  const hold = await prepareCheckoutHolds(showtimeId.toString(), userId);
  if (hold.seatIds.length === 0)
    throw new HttpError(
      409,
      "You don't have any seats held. Pick your seats again.",
    );
  const seatIds = [...hold.seatIds].sort();

  // A hold only protects a seat from OTHER people's holds. It can't un-sell a seat, so check.
  const sold = await BookedSeat.find({
    showtime: showtimeId,
    seatId: { $in: seatIds },
  })
    .select("seatId")
    .lean();
  if (sold.length)
    throw new HttpError(
      409,
      `Already booked: ${sold.map((s) => s.seatId).join(", ")}`,
    );

  const hall = await Hall.findById(showtime.hall).select("seatLayout").lean();
  const { lines, total } = priceSeats(
    showtime.prices,
    hall?.seatLayout?.rows ?? [],
    seatIds,
  );
  if (total <= 0) throw new HttpError(409, "These seats have no price set");

  // ---- Is there already an open checkout for this user + showtime? ----
  const existing = await Checkout.findOne({
    user: userId,
    showtime: showtimeId,
    status: "pending",
  });
  if (existing) {
    const pi = await stripe.paymentIntents.retrieve(existing.paymentIntentId);

    // The customer already paid and we are just waiting for Stripe's webhook to tell us.
    // NEVER create a second payment now: that could charge them twice.
    if (pi.status === "succeeded" || pi.status === "processing")
      return { state: "processing", checkoutId: existing._id.toString() };

    const sameSeats =
      existing.seats.map((s) => s.seatId).join() === seatIds.join();
    if (sameSeats && existing.totalAmount === total && PAYABLE.has(pi.status))
      return payable(existing._id, pi.client_secret!, total, lines, hold);

    // Different seats or price (or a dead payment): retire the old one and start a new one.
    try {
      await stripe.paymentIntents.cancel(existing.paymentIntentId);
    } catch {
      // Already canceled or finished on Stripe's side: nothing left to cancel.
    }
    await Checkout.updateOne(
      { _id: existing._id, status: "pending" },
      { status: "canceled" },
    );
  }

  // ---- Create the Stripe payment ----
  const user = await User.findById(userId).select("email").lean();
  const checkoutId = new Types.ObjectId();
  const pi = await stripe.paymentIntents.create(
    {
      amount: total, // minor units, same as our database
      currency: CURRENCY.toLowerCase(),
      // Let Stripe offer every payment method enabled in the Dashboard (cards, wallets...).
      automatic_payment_methods: { enabled: true },
      receipt_email: user?.email,
      description: `Cinema tickets: ${seatIds.join(", ")}`,
      // Stripe stores this next to the payment, handy when you look at it in the Dashboard.
      metadata: {
        checkoutId: checkoutId.toString(),
        showtimeId: showtimeId.toString(),
        userId,
      },
    },
    { idempotencyKey: `checkout-${checkoutId}` },
  );

  await Checkout.create({
    _id: checkoutId,
    user: userId,
    showtime: showtimeId,
    seats: lines,
    totalAmount: total,
    currency: CURRENCY,
    paymentIntentId: pi.id,
  });

  return payable(checkoutId, pi.client_secret!, total, lines, hold);
}

function payable(
  checkoutId: Types.ObjectId,
  clientSecret: string,
  amount: number,
  seats: SeatLine[],
  hold: { deadline: number; now: number },
): CheckoutStart {
  return {
    state: "payable",
    checkoutId: checkoutId.toString(),
    clientSecret,
    amount,
    currency: CURRENCY,
    seats,
    holdExpiresAt: hold.deadline,
    serverTime: hold.now,
  };
}

// The user pressed "Back to seats": stop the payment so it can't be completed by accident later.
export async function cancelCheckout(
  userId: string,
  checkoutId: Types.ObjectId,
) {
  const checkout = await Checkout.findOne({ _id: checkoutId, user: userId });
  if (!checkout) throw new HttpError(404, "Checkout not found");
  if (checkout.status !== "pending") return checkout.status; // nothing to cancel

  try {
    await stripe.paymentIntents.cancel(checkout.paymentIntentId);
  } catch (err) {
    // Cancel is refused once the customer has paid or the payment is being processed.
    const pi = await stripe.paymentIntents.retrieve(checkout.paymentIntentId);
    if (pi.status === "succeeded" || pi.status === "processing")
      throw new HttpError(409, "Your payment is already being processed");
    if (pi.status !== "canceled") throw err;
  }
  await Checkout.updateOne(
    { _id: checkout._id, status: "pending" },
    { status: "canceled" },
  );
  return "canceled" as const;
}

// What the browser polls while it waits for the webhook to turn "paid" into "booked".
export async function getCheckout(userId: string, checkoutId: Types.ObjectId) {
  const checkout = await Checkout.findOne({
    _id: checkoutId,
    user: userId,
  }).lean();
  if (!checkout) throw new HttpError(404, "Checkout not found");
  return {
    checkoutId: checkout._id.toString(),
    status: checkout.status,
    bookingId: checkout.booking?.toString(),
    refundReason: checkout.refundReason,
    seats: checkout.seats,
    totalAmount: checkout.totalAmount,
    currency: checkout.currency,
  };
}
