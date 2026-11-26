import { Types } from "mongoose";
import { HttpError } from "../../utils/httpError";
import { Booking } from "../booking/booking.model";
import { Cinema } from "../catalog/cinema.model";
import { Hall } from "../catalog/hall.model";
import { Movie } from "../catalog/movie.model";
import { Showtime } from "../catalog/showtime.model";
import { User } from "../users/user.model";
import { ensureManualCode, formatManualCode } from "./manualCode";
import { qrDataUrl } from "./qr";
import { createTicketToken } from "./ticketToken";

// The short code people read out loud or see on screen, e.g. "7F3A9C21". It is just the last 8
// characters of the booking id. Not secret and not enough to open a ticket; it is only a label.
export function bookingReference(bookingId: Types.ObjectId | string): string {
  return bookingId.toString().slice(-8).toUpperCase();
}

// Gathers EVERYTHING we know about one booking, in one place. Three callers need this:
// the ticket page (this file), the e-mail worker (Batch 2) and the staff scanner (Batch 4).
// Returns null when the booking doesn't exist.
//
// A booking only stores ids (showtime, user). We fetch the readable details with separate small
// queries. This is clearer than .populate() and keeps TypeScript types exact.
export async function loadTicketData(bookingId: Types.ObjectId) {
  const booking = await Booking.findById(bookingId).lean();
  if (!booking) return null;

  // New bookings get their code when they are created. Bookings made before manual codes existed
  // get one the first time anything loads them (the page, the e-mail, the scanner).
  const manualCode =
    booking.manualCode ?? (await ensureManualCode(booking._id));

  const showtime = await Showtime.findById(booking.showtime).lean();
  if (!showtime) throw new Error(`Booking ${bookingId} has no showtime`);

  // These four don't depend on each other, so run them at the same time.
  const [movie, cinema, hall, user] = await Promise.all([
    Movie.findById(showtime.movie).lean(),
    Cinema.findById(showtime.cinema).lean(),
    Hall.findById(showtime.hall).select("name").lean(),
    User.findById(booking.user).select("name email").lean(),
  ]);
  if (!movie || !cinema || !hall || !user)
    throw new Error(`Booking ${bookingId} has incomplete data`);

  return { booking, manualCode, showtime, movie, cinema, hall, user };
}

export type TicketData = NonNullable<
  Awaited<ReturnType<typeof loadTicketData>>
>;

// What the "My ticket" page receives. We pick the fields one by one on purpose: loadTicketData
// contains the customer's e-mail, and an API response should never include more than the page needs.
export async function getTicketForViewer(
  bookingId: Types.ObjectId,
  viewer: { id: string; role: string },
) {
  const data = await loadTicketData(bookingId);

  // Only the owner (or an admin, for customer support) may open a ticket. Everyone else gets
  // the SAME "not found" as for an id that doesn't exist, so a stranger can't use this endpoint
  // to discover which booking ids are real.
  const allowed =
    data &&
    (data.booking.user.toString() === viewer.id || viewer.role === "admin");
  if (!data || !allowed) throw new HttpError(404, "Booking not found");

  const { booking, manualCode, showtime, movie, cinema, hall } = data;
  const token = createTicketToken(booking._id.toString());

  return {
    booking: {
      id: booking._id.toString(),
      reference: bookingReference(booking._id),
      status: booking.status,
      seats: booking.seats,
      totalAmount: booking.totalAmount,
      currency: booking.currency,
      usedAt: booking.usedAt ?? null,
      createdAt: booking.createdAt,
    },
    showtime: {
      id: showtime._id.toString(),
      startTime: showtime.startTime,
      endTime: showtime.endTime,
      language: showtime.language,
      format: showtime.format,
      status: showtime.status,
    },
    movie: {
      title: movie.title,
      posterUrl: movie.posterUrl,
      certificate: movie.certificate,
      durationMinutes: movie.durationMinutes,
    },
    cinema: { name: cinema.name, city: cinema.city, address: cinema.address },
    hall: { name: hall.name },
    // Only a ticket that can still get you in shows a QR code. A used or cancelled one
    // shows its status instead (the page handles that).
    ticket:
      booking.status === "confirmed"
        ? {
            token,
            qrDataUrl: await qrDataUrl(token),
            manualCode: formatManualCode(manualCode), // "K7M2-9QXP"
          }
        : null,
  };
}
