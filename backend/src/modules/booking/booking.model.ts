import { Schema, model } from "mongoose";
import { SEAT_TYPES } from "../catalog/catalog.constants";

// One purchase. It is written ONLY when payment has succeeded (Part 9), so a Booking
// always means "this person paid for these seats".
//
// The seats are COPIED into the booking (id, type and the price paid) instead of only
// pointing at the hall. Reason: admins can later change prices or layouts, but a ticket
// someone already paid for must never change.
export const bookingSeatSchema = new Schema(
  {
    seatId: { type: String, required: true }, // "A5"
    type: { type: String, enum: [...SEAT_TYPES], required: true },
    price: { type: Number, required: true, min: 0 }, // minor units (cents) paid for this seat
  },
  { _id: false },
);

const bookingSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    showtime: { type: Schema.Types.ObjectId, ref: "Showtime", required: true },
    seats: { type: [bookingSeatSchema], required: true },
    totalAmount: { type: Number, required: true, min: 0 }, // minor units, sum of seat prices
    currency: { type: String, required: true }, // "LKR"
    // The Stripe PaymentIntent that paid for this booking. It is how the webhook recognises
    // "I already processed this payment" (see the unique index below). It is optional only
    // because the dev helper `seed:booked` creates bookings without a real payment.
    paymentIntentId: { type: String },
    // Part 10 adds the ticket token, Part 11 uses the cancelled status.
    // confirmed = paid and not yet scanned at the door
    // used      = scanned by staff (the ticket can't be used a second time)
    // cancelled = cancelled and refunded (Part 11)
    status: {
      type: String,
      enum: ["confirmed", "cancelled", "used"],
      default: "confirmed",
    },
    // Set by the staff scanner (Part 10) at the moment the ticket is accepted.
    usedAt: { type: Date },
    usedBy: { type: Schema.Types.ObjectId, ref: "User" }, // which staff member scanned it
    // Set by the e-mail worker once the ticket e-mail was really sent, so a retried job can't
    // send the customer a second copy.
    ticketEmailSentAt: { type: Date },
  },
  { timestamps: true },
);

bookingSchema.index({ user: 1, createdAt: -1 }); // "my bookings", newest first
bookingSchema.index({ showtime: 1 }); // "all bookings of this show"
// One booking per payment, enforced by the database. If Stripe delivers the same webhook twice
// (it does that on purpose when it doesn't get an answer in time), the second insert is rejected
// instead of creating a second booking. "partial" = only applies to bookings that HAVE a payment id.
bookingSchema.index(
  { paymentIntentId: 1 },
  {
    unique: true,
    partialFilterExpression: { paymentIntentId: { $type: "string" } },
  },
);

export const Booking = model("Booking", bookingSchema);
