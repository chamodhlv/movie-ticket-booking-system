import { Schema, model } from "mongoose";

// ONE DOCUMENT PER SOLD SEAT. This looks redundant (the Booking already lists its seats),
// but it exists for one reason: the UNIQUE INDEX below.
//
// MongoDB guarantees that no two documents can have the same (showtime, seatId).
// Even if every other safeguard fails (Redis holds, our code, a bug, two servers racing),
// inserting a second sale of "A5 for showtime X" is rejected by the database itself.
// That is the last line of defence against double booking.
//
// When a booking is cancelled (Part 11) its BookedSeat documents are DELETED,
// which frees the seats so someone else can buy them.
const bookedSeatSchema = new Schema(
  {
    showtime: {
      type: Schema.Types.ObjectId,
      ref: "Showtime",
      required: true,
    },
    seatId: { type: String, required: true },
    booking: { type: Schema.Types.ObjectId, ref: "Booking", required: true },
  },
  { timestamps: true },
);

bookedSeatSchema.index({ showtime: 1, seatId: 1 }, { unique: true });

export const BookedSeat = model("BookedSeat", bookedSeatSchema);
