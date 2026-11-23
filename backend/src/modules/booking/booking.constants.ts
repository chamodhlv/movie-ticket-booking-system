// Product rules for seat holds. Change a number here and the whole app follows.

// How long a user has to finish choosing + paying. The countdown on the seat map starts
// when they hold their FIRST seat and ends for ALL their seats at the same moment.
export const HOLD_TTL_MS = 8 * 60 * 1000; // 8 minutes

// The most seats one person can hold (and therefore book) for one showtime.
export const MAX_SEATS_PER_BOOKING = 8;

// The currency tickets are sold in. Prices in the database are in its MINOR units (cents):
// 120000 = LKR 1,200.00. Stripe wants the code in lowercase ("lkr"), and LKR is a normal
// two-decimal currency there, so our cents match Stripe's amounts exactly.
export const CURRENCY = "LKR";

// When the user clicks "Continue to payment" their hold is extended ONCE so that at least this
// much time is left to type card details (see prepareCheckoutHolds in holds.ts).
export const CHECKOUT_MIN_HOLD_MS = 5 * 60 * 1000; // 5 minutes
