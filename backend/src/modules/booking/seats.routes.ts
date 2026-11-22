import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { Hall } from "../catalog/hall.model";
import { Showtime } from "../catalog/showtime.model";
import { BookedSeat } from "./bookedSeat.model";
import { MAX_SEATS_PER_BOOKING } from "./booking.constants";
import { holdSeats, listHolds, releaseAllSeats, releaseSeats } from "./holds";
import { optionalAuth, requireAuth } from "../../middleware/auth";
import { emitSeatsHeld, emitSeatsReleased } from "../../realtime/socket";
import { HttpError } from "../../utils/httpError";
import { parseObjectId } from "../../utils/objectId";

// Mounted at /api/showtimes (see app.ts):
//   GET    /:id/seats   who has which seat right now          (public, login optional)
//   POST   /:id/hold    hold seats (all or none)              (login required)
//   DELETE /:id/hold    release some or all of my held seats  (login required)
export const seatsRouter = Router();

// A seat id looks like "A5" or "AB12". The same rule is applied to the hall layout.
const seatId = z.string().regex(/^[A-Z]{1,2}\d{1,3}$/, "Invalid seat id");

const holdBodySchema = z.object({
  seatIds: z
    .array(seatId)
    .min(1)
    .max(
      MAX_SEATS_PER_BOOKING,
      `You can hold at most ${MAX_SEATS_PER_BOOKING} seats`,
    )
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate seats"),
});
const releaseBodySchema = z.object({
  seatIds: z.array(seatId).min(1).max(MAX_SEATS_PER_BOOKING).optional(),
});

// Hold clicks are cheap but could be spammed, which would flood every watcher's screen with
// events. Allow 120 actions per minute per logged-in USER (not per IP: many people can share one).
const holdLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  keyGenerator: (req) => req.user!.id,
  standardHeaders: true,
  legacyHeaders: false,
});

// The browser sends its Socket.IO id in this header, so we don't echo its own action back to it
// (see emitSeatsHeld). A made-up value is harmless: it just matches no connection.
const socketIdOf = (req: { header(name: string): string | undefined }) =>
  req.header("x-socket-id")?.slice(0, 64);

// The showtime + the set of seat ids that really exist in its hall.
async function loadShowtimeSeats(rawId: string | string[] | undefined) {
  const id = parseObjectId(rawId);
  const showtime = await Showtime.findById(id).lean();
  if (!showtime) throw new HttpError(404, "Showtime not found");
  const hall = await Hall.findById(showtime.hall).select("seatLayout").lean();
  const seatIds = new Set(
    (hall?.seatLayout?.rows ?? []).flatMap((row) => row.seats.map((s) => s.id)),
  );
  return { id, showtime, seatIds };
}

seatsRouter.get("/:id/seats", optionalAuth, async (req, res) => {
  const { id } = await loadShowtimeSeats(req.params.id);
  const showtimeId = id.toString();

  // Two independent sources of truth, fetched at the same time:
  //   MongoDB = seats that are SOLD (permanent)
  //   Redis   = seats that are HELD (temporary)
  const [sold, { now, holds }] = await Promise.all([
    BookedSeat.find({ showtime: id }).select("seatId").lean(),
    listHolds(showtimeId),
  ]);

  res.set("Cache-Control", "no-store"); // this changes every second: never cache it
  res.json({
    // Redis's clock. The browser compares it with its own clock to count down correctly
    // even if the visitor's computer clock is wrong.
    serverTime: now,
    booked: sold.map((b) => b.seatId),
    // We tell the browser WHICH seats are held and until when, but never WHO holds them.
    held: holds.map((h) => ({
      seatId: h.seatId,
      expiresAt: h.expiresAt,
      mine: h.userId === req.user?.id,
    })),
  });
});

seatsRouter.post("/:id/hold", requireAuth, holdLimiter, async (req, res) => {
  const { seatIds } = holdBodySchema.parse(req.body);
  const {
    id,
    showtime,
    seatIds: validIds,
  } = await loadShowtimeSeats(req.params.id);
  const showtimeId = id.toString();

  if (showtime.status !== "scheduled")
    throw new HttpError(409, "This showtime was cancelled");
  if (showtime.startTime.getTime() <= Date.now())
    throw new HttpError(409, "This showtime has already started");

  const unknown = seatIds.filter((s) => !validIds.has(s));
  if (unknown.length)
    throw new HttpError(400, `Seat not in this hall: ${unknown.join(", ")}`);

  // Already SOLD? Redis knows nothing about sold seats, so ask MongoDB.
  const sold = await BookedSeat.find({ showtime: id, seatId: { $in: seatIds } })
    .select("seatId")
    .lean();
  if (sold.length)
    throw new HttpError(
      409,
      `Already booked: ${sold.map((s) => s.seatId).join(", ")}`,
    );

  const result = await holdSeats(showtimeId, req.user!.id, seatIds);
  if (!result.ok) {
    if (result.reason === "taken")
      throw new HttpError(
        409,
        `Just taken by someone else: ${result.seatIds.join(", ")}`,
      );
    throw new HttpError(
      400,
      `You can hold at most ${MAX_SEATS_PER_BOOKING} seats`,
    );
  }

  // Tell everyone watching this showtime (only about seats that are newly held).
  if (result.newSeatIds.length)
    emitSeatsHeld(
      showtimeId,
      result.newSeatIds,
      result.expiresAt,
      socketIdOf(req),
    );

  res.json({ seatIds: result.mySeatIds, expiresAt: result.expiresAt });
});

// DELETE with a body is unusual but allowed. No body = release everything I hold.
seatsRouter.delete("/:id/hold", requireAuth, holdLimiter, async (req, res) => {
  const { seatIds } = releaseBodySchema.parse(req.body ?? {});
  const id = parseObjectId(req.params.id);
  const showtimeId = id.toString();

  const released = seatIds
    ? await releaseSeats(showtimeId, req.user!.id, seatIds)
    : await releaseAllSeats(showtimeId, req.user!.id);

  if (released.length) emitSeatsReleased(showtimeId, released, socketIdOf(req));
  res.json({ released });
});
