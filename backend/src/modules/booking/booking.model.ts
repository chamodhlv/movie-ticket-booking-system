import { Schema, model } from "mongoose";
import { SEAT_TYPES } from "../catalog/catalog.constants";

// One purchase. It is written ONLY when payment has succeeded (Part 9), so a Booking
// always means "this person paid for these seats".
//
// The seats are COPIED into the booking (id, type and the price paid) instead of only
// pointing at the hall. Reason: admins can later change prices or layouts, but a ticket
// someone already paid for must never change.
const bookingSeatSchema = new Schema(
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
    // Part 9 adds payment fields (provider id, ...), Part 10 adds the ticket token,
    // Part 11 uses the cancelled status.
    status: {
      type: String,
      enum: ["confirmed", "cancelled", "used"],
      default: "confirmed",
    },
  },
  { timestamps: true },
);

bookingSchema.index({ user: 1, createdAt: -1 }); // "my bookings", newest first
bookingSchema.index({ showtime: 1 }); // "all bookings of this show"

export const Booking = model("Booking", bookingSchema);
