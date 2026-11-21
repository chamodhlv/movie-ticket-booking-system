// Product rules for seat holds. Change a number here and the whole app follows.

// How long a user has to finish choosing + paying. The countdown on the seat map starts
// when they hold their FIRST seat and ends for ALL their seats at the same moment.
export const HOLD_TTL_MS = 8 * 60 * 1000; // 8 minutes

// The most seats one person can hold (and therefore book) for one showtime.
export const MAX_SEATS_PER_BOOKING = 8;
