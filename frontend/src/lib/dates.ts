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
