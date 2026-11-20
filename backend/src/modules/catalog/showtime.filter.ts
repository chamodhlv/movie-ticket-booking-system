import { z } from "zod";
import { Cinema } from "./cinema.model";
import { FORMATS } from "./catalog.constants";
import { dayRange } from "../../utils/dateRange";

// Query-string rules: GET /api/...?city=Colombo&date=2026-11-20&language=English&format=3D
export const showtimeQuerySchema = z.object({
  city: z.string().trim().min(1).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD")
    .optional(),
  language: z.string().trim().min(1).optional(),
  format: z.enum(FORMATS).optional(),
});

export type ShowtimeQuery = z.infer<typeof showtimeQuerySchema>;

// Builds the MongoDB filter object for showtimes.
export async function buildShowtimeFilter(q: ShowtimeQuery) {
  const filter: Record<string, unknown> = { status: "scheduled" };

  if (q.city) {
    // Find the cinemas in that city first, then keep showtimes of those cinemas.
    // (If the city has no cinemas, `$in: []` matches nothing, which is correct.)
    filter.cinema = { $in: await Cinema.distinct("_id", { city: q.city }) };
  }

  const now = new Date();
  if (q.date) {
    const { start, end } = dayRange(q.date);
    // Never offer a show that has already started, even when browsing "today".
    filter.startTime = { $gte: start > now ? start : now, $lt: end };
  } else {
    filter.startTime = { $gte: now }; // no date given: all upcoming shows
  }

  if (q.language) filter.language = q.language;
  if (q.format) filter.format = q.format;

  return filter;
}
