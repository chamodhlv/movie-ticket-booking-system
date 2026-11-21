import { DateTime } from "luxon";
import type { Types } from "mongoose";
import { env } from "../../config/env";
import { HttpError } from "../../utils/httpError";
import type { SeatType } from "../catalog/catalog.constants";
import { Hall } from "../catalog/hall.model";
import { Movie } from "../catalog/movie.model";
import { Showtime } from "../catalog/showtime.model";
import type { ShowtimeInput } from "./admin.schemas";

const BUFFER_MINUTES = 20; // cleaning + ads between two shows in the same hall

// Used for BOTH create (no existingId) and update (existingId given).
export async function saveShowtime(
  input: ShowtimeInput,
  existingId?: Types.ObjectId,
) {
  const now = new Date();

  if (existingId) {
    const existing = await Showtime.findById(existingId).lean();
    if (!existing) throw new HttpError(404, "Showtime not found");
    // TODO(booking part): also refuse the edit when bookings exist for this showtime
    if (existing.startTime < now)
      throw new HttpError(
        409,
        "A showtime that already started can't be edited",
      );
  }
  if (input.startTime < now)
    throw new HttpError(400, "Start time must be in the future");

  const [movie, hall] = await Promise.all([
    Movie.findById(input.movie).lean(),
    Hall.findById(input.hall).lean(),
  ]);
  if (!movie) throw new HttpError(400, "Movie does not exist");
  if (!hall) throw new HttpError(400, "Hall does not exist");

  if (!hall.formats.includes(input.format)) {
    throw new HttpError(
      400,
      `${hall.name} doesn't support ${input.format} (it supports: ${hall.formats.join(", ")})`,
    );
  }

  // Mongoose's types treat a nested object as optional, so `seatLayout` could be undefined
  // as far as TypeScript knows. `?? []` means "no layout = no seat types" instead of a crash.
  const seatTypes = new Set(
    (hall.seatLayout?.rows ?? []).flatMap((row) =>
      row.seats.map((s) => s.type),
    ),
  );
  for (const type of seatTypes) {
    if (input.prices[type as SeatType] === undefined) {
      throw new HttpError(
        400,
        `This hall has ${type} seats, so a ${type} price is required`,
      );
    }
  }

  const startTime = input.startTime;
  const endTime = new Date(
    startTime.getTime() + (movie.durationMinutes + BUFFER_MINUTES) * 60_000,
  );

  // OVERLAP CHECK. Two time ranges [aStart, aEnd) and [bStart, bEnd) overlap exactly when
  //     aStart < bEnd   AND   aEnd > bStart
  // We look for any other (non-cancelled) show in the SAME hall that satisfies this.
  // When editing, we exclude the showtime itself, or it would clash with its own old self.
  const clash = await Showtime.findOne({
    hall: hall._id,
    status: { $ne: "cancelled" },
    ...(existingId ? { _id: { $ne: existingId } } : {}),
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  }).lean();

  if (clash) {
    const when = DateTime.fromJSDate(clash.startTime, {
      zone: env.APP_TIMEZONE,
    }).toFormat("MMM d, h:mm a");
    throw new HttpError(
      409,
      `Overlaps with another show in ${hall.name} starting ${when}`,
    );
  }
  // (Two admins submitting overlapping shows at the exact same millisecond could both pass
  // this check. For an admin-only action that is an acceptable risk. Seat booking, where it
  // matters, gets stronger protection in a later part.)

  const data = {
    movie: movie._id,
    hall: hall._id,
    cinema: hall.cinema, // copied from the hall, never trusted from the client
    startTime,
    endTime,
    language: input.language,
    format: input.format,
    prices: input.prices,
  };

  if (existingId)
    return Showtime.findByIdAndUpdate(existingId, data, {
      new: true,
      runValidators: true,
    });
  return Showtime.create(data);
}
