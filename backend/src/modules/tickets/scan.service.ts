import { Types } from "mongoose";
import { logger } from "../../config/logger";
import { Booking } from "../booking/booking.model";
import { normalizeManualCode } from "./manualCode";
import { bookingReference, loadTicketData } from "./ticket.service";
import { readTicketToken } from "./ticketToken";

// Doors open this long before the show starts. (Your choice: 2 hours before the start until the
// end of the show.)
export const ENTRY_OPENS_BEFORE_MS = 2 * 60 * 60 * 1000;

// What staff see about the ticket they just scanned. Deliberately NO customer name or e-mail:
// the door only needs to know which show and which seats.
export type ScanTicketInfo = {
  reference: string;
  movieTitle: string;
  cinemaName: string;
  hallName: string;
  format: string;
  language: string;
  startTime: Date;
  endTime: Date;
  seats: string[];
};

// The verdict. These are normal outcomes of a scan (a used ticket is not a server error), so the
// endpoint answers 200 and the app reads `result`. Real problems (not logged in, not staff) stay
// HTTP errors.
export type ScanResult =
  | { result: "invalid" } // not one of our tickets at all
  | {
      result:
        | "admitted"
        | "already_used"
        | "cancelled"
        | "showing_cancelled"
        | "too_early"
        | "show_over";
      ticket: ScanTicketInfo;
      usedAt?: Date | null; // admitted / already_used: when it was scanned
      entryOpensAt?: Date; // too_early: when it will work
    };

// A scanned QR is the long "<id>.<signature>" token; typed input is the short code.
// Returns the booking's id, or null if it isn't a ticket of ours.
async function findBookingId(scanned: string): Promise<Types.ObjectId | null> {
  const text = scanned.trim();

  if (text.includes(".")) {
    const id = readTicketToken(text); // checks the signature
    return id ? new Types.ObjectId(id) : null;
  }

  const code = normalizeManualCode(text);
  if (!code) return null;
  const booking = await Booking.findOne({ manualCode: code })
    .select("_id")
    .lean();
  return booking?._id ?? null;
}

export async function scanTicket(
  scanned: string,
  staffId: string,
): Promise<ScanResult> {
  const bookingId = await findBookingId(scanned);
  if (!bookingId) return { result: "invalid" };

  const data = await loadTicketData(bookingId);
  if (!data) return { result: "invalid" }; // genuine signature, but the booking is gone
  const { booking, showtime, movie, cinema, hall } = data;

  const ticket: ScanTicketInfo = {
    reference: bookingReference(booking._id),
    movieTitle: movie.title,
    cinemaName: cinema.name,
    hallName: hall.name,
    format: showtime.format,
    language: showtime.language,
    startTime: showtime.startTime,
    endTime: showtime.endTime,
    seats: booking.seats
      .map((s) => s.seatId)
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true })),
  };

  // ---- Checks that need no write. The order matters: say the most useful thing first. ----
  if (booking.status === "cancelled") return { result: "cancelled", ticket };
  if (showtime.status === "cancelled")
    return { result: "showing_cancelled", ticket };
  if (booking.status === "used")
    return { result: "already_used", ticket, usedAt: booking.usedAt };

  const now = Date.now();
  const entryOpensAt = new Date(
    showtime.startTime.getTime() - ENTRY_OPENS_BEFORE_MS,
  );
  if (now < entryOpensAt.getTime())
    return { result: "too_early", ticket, entryOpensAt };
  if (now > showtime.endTime.getTime()) return { result: "show_over", ticket };

  // ---- Let them in: flip confirmed -> used. ----
  // HARD PART: two scanners can read this same ticket as "confirmed" at the same moment (a
  // screenshot shared with a friend, two doors). If we simply saved status = "used" both would
  // succeed and BOTH people get in. Instead we send ONE database command that says "set it to
  // used, but ONLY IF it is still confirmed". MongoDB runs commands on one document one at a
  // time, so exactly one of them matches and gets the document back; the other gets null.
  const admitted = await Booking.findOneAndUpdate(
    { _id: bookingId, status: "confirmed" },
    {
      $set: {
        status: "used",
        usedAt: new Date(),
        usedBy: new Types.ObjectId(staffId),
      },
    },
    { returnDocument: "after" },
  ).lean();

  if (!admitted) {
    // We lost the race. Say what the winner did.
    const fresh = await Booking.findById(bookingId)
      .select("status usedAt")
      .lean();
    if (fresh?.status === "used")
      return { result: "already_used", ticket, usedAt: fresh.usedAt };
    return { result: "cancelled", ticket };
  }

  logger.info(
    { bookingId: bookingId.toString(), staffId },
    "Ticket scanned, entry allowed",
  );
  return { result: "admitted", ticket, usedAt: admitted.usedAt };
}
