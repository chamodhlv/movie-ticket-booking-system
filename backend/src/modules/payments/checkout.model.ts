import { Schema, model } from "mongoose";
import { bookingSeatSchema } from "../booking/booking.model";

// A CHECKOUT = "this user is trying to pay for these seats, with this Stripe payment".
// It is created when the user clicks "Continue to payment", BEFORE any money moves, and it freezes
// what the user agreed to pay: the seats and the price of each seat at that moment.
//
// WHY A SEPARATE RECORD? When Stripe later tells us "payment X succeeded", we must know exactly what
// that payment was for. We look the checkout up by the payment id, and create the booking from its
// frozen seats and amount. We never trust anything the browser sends at that point.
//
//   pending    waiting for payment
//   completed  paid, and the booking exists (`booking` points to it)
//   refunded   paid, but we couldn't give the seats, so the money was returned (`refundReason`)
//   canceled   the user went back, or the payment was canceled, before paying
const checkoutSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    showtime: { type: Schema.Types.ObjectId, ref: "Showtime", required: true },
    seats: { type: [bookingSeatSchema], required: true },
    totalAmount: { type: Number, required: true, min: 1 }, // minor units (cents)
    currency: { type: String, required: true }, // "LKR"
    paymentIntentId: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["pending", "completed", "refunded", "canceled"],
      default: "pending",
    },
    booking: { type: Schema.Types.ObjectId, ref: "Booking" },
    refundReason: { type: String },
  },
  { timestamps: true },
);

// "does this user already have an open checkout for this showtime?"
checkoutSchema.index({ user: 1, showtime: 1, status: 1 });

export const Checkout = model("Checkout", checkoutSchema);
