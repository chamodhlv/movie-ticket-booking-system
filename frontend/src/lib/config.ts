// Must match APP_TIMEZONE in the backend, because "today" depends on it.
// Both have defaults, so you don't need to add anything to .env right now.
export const APP_TIMEZONE: string =
  import.meta.env.VITE_APP_TIMEZONE ?? "Asia/Colombo";
// Display only for now. We choose the real payment currency in the payments part.
export const CURRENCY: string = import.meta.env.VITE_CURRENCY ?? "LKR";
