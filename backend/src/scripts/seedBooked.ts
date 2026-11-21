// DEVELOPMENT HELPER until real payments exist (Part 9).
// Pretends a user bought some seats, so you can see "booked" seats on the seat map.
//
//   npm run seed:booked --workspace backend -- <showtimeId> <seatIds> <userEmail>
//   npm run seed:booked --workspace backend -- 6740f0c2a1b2c3d4e5f60718 A1,A2 admin@example.com
//
// It writes the same documents a real purchase will write: one Booking and one BookedSeat
// per seat. (This script runs in its own process, so open seat maps update on refresh,
// not live. Real purchases in Part 9 are pushed live.)
import mongoose from "mongoose";
import { connectMongo } from "../config/db";
import { Booking } from "../modules/booking/booking.model";
import { BookedSeat } from "../modules/booking/bookedSeat.model";
import { Hall } from "../modules/catalog/hall.model";
import { Showtime } from "../modules/catalog/showtime.model";
import { User } from "../modules/users/user.model";

async function main() {
  const [showtimeId, seatList, email] = process.argv.slice(2);
  if (!showtimeId || !seatList || !email)
    throw new Error("Usage: seed:booked <showtimeId> <A1,A2,...> <userEmail>");
  const seatIds = [...new Set(seatList.split(",").map((s) => s.trim()))];

  await connectMongo();
  const [showtime, user] = await Promise.all([
    Showtime.findById(showtimeId).lean(),
    User.findOne({ email: email.toLowerCase() }).lean(),
  ]);
  if (!showtime) throw new Error("Showtime not found");
  if (!user) throw new Error(`No user with email ${email}`);
  const hall = await Hall.findById(showtime.hall).lean();

  // Look every seat up in the hall layout, to copy its type and work out its price.
  const allSeats = (hall?.seatLayout?.rows ?? []).flatMap((r) => r.seats);
  const seats = seatIds.map((id) => {
    const seat = allSeats.find((s) => s.id === id);
    if (!seat) throw new Error(`Seat ${id} is not in this hall`);
    const price = showtime.prices?.[seat.type as "standard"] ?? 0;
    return { seatId: id, type: seat.type as "standard", price };
  });

  const booking = await Booking.create({
    user: user._id,
    showtime: showtime._id,
    seats,
    totalAmount: seats.reduce((sum, s) => sum + s.price, 0),
    currency: "LKR",
  });
  // If a seat is already sold, the UNIQUE index rejects this insert (that's its whole job).
  await BookedSeat.insertMany(
    seats.map((s) => ({
      showtime: showtime._id,
      seatId: s.seatId,
      booking: booking._id,
    })),
  );

  console.log(`Booked ${seatIds.join(", ")} for ${email}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message ?? err);
  await mongoose.disconnect();
  process.exit(1);
});
