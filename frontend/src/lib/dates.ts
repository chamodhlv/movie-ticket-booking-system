import { APP_TIMEZONE, CURRENCY } from "./config";

// WHY Intl INSTEAD OF new Date().toLocaleString()?
// The backend sends UTC timestamps. A show at 20:30 in the cinema's timezone must
// display as 8:30 PM for EVERYONE, even a visitor whose laptop is set to another
// timezone. Passing `timeZone` to Intl.DateTimeFormat forces the cinema's timezone.
const isoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  // The "en-CA" locale happens to print dates as YYYY-MM-DD, which is exactly the
  // format our API wants for the `date` filter.
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dayLabelFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIMEZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIMEZONE,
  hour: "numeric",
  minute: "2-digit",
});
const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: CURRENCY,
});

// The next `count` days (today first) as { iso: "2026-11-21", label: "Sat, Nov 21" }.
export function upcomingDays(count = 7) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.now() + i * DAY_MS);
    return {
      iso: isoDateFormatter.format(d),
      label: dayLabelFormatter.format(d),
    };
  });
}

export const formatDayLabel = (iso: string) =>
  dayLabelFormatter.format(new Date(iso));
export const formatTime = (iso: string) => timeFormatter.format(new Date(iso));

// Backend sends minor units (cents). This assumes a currency with 2 decimals (LKR, USD...).
export const formatMoney = (minorUnits: number) =>
  moneyFormatter.format(minorUnits / 100);

export const todayIso = () => isoDateFormatter.format(new Date());

// 24-hour clock, because <input type="time"> works in "HH:mm".
// (hourCycle "h23" avoids the "24:05" some browsers print for just after midnight.)
const wallClockFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIMEZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

// How far ahead of UTC the cinema's clock is at a given moment, in ms
// (Colombo = +5:30 = 19_800_000).
function zoneOffsetMs(utcMs: number): number {
  const secondPrecise = Math.floor(utcMs / 1000) * 1000;
  const parts = wallClockFormatter.formatToParts(new Date(secondPrecise));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  // Read the wall-clock time the cinema shows at that instant, pretend it was UTC,
  // and compare with the real instant: the difference is the offset.
  const wallAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return wallAsUtc - secondPrecise;
}

// "2026-11-25" + "20:30" (cinema time)  ->  "2026-11-25T15:00:00.000Z"
export function cinemaTimeToIso(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, hh, mm);
  // We want `utc` such that utc + offset(utc) = wall time. The offset depends on `utc`
  // itself (daylight saving!), so guess, measure the offset there, and correct once.
  // Colombo has no daylight saving, but this keeps working if the timezone ever changes.
  const guess = wallAsUtc - zoneOffsetMs(wallAsUtc);
  return new Date(wallAsUtc - zoneOffsetMs(guess)).toISOString();
}

// The reverse, to fill the edit form: UTC ISO -> { date: "2026-11-25", time: "20:30" }
export function isoToCinemaTime(iso: string) {
  const d = new Date(iso);
  const parts = wallClockFormatter.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

// "1200" or "1200.50" (major units, what a human types) -> 120050 (cents).
// Returns null when the text isn't a valid amount. We parse the TEXT instead of using
// parseFloat * 100 because floating point gives answers like 1.15 * 100 = 114.99999.
export function majorToMinor(text: string): number | null {
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
}

// 120050 -> "1200.50" (to fill an input)
export const minorToMajor = (minor: number) => (minor / 100).toFixed(2);
