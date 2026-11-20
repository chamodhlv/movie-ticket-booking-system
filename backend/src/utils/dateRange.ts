import { DateTime } from "luxon";
import { env } from "../config/env";
import { HttpError } from "./httpError";

// Turns "2026-11-20" into the exact moment that day starts and ends IN THE CINEMA'S
// TIMEZONE. Example in Colombo (UTC+5:30): Nov 20 runs from Nov 19 18:30 UTC to
// Nov 20 18:30 UTC. Using UTC midnight instead would file late-night shows under the wrong date.
export function dayRange(isoDate: string) {
  const start = DateTime.fromISO(isoDate, { zone: env.APP_TIMEZONE }).startOf(
    "day",
  );
  if (!start.isValid) throw new HttpError(400, "Invalid date, use YYYY-MM-DD");
  return { start: start.toJSDate(), end: start.plus({ days: 1 }).toJSDate() };
}
