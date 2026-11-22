import type { HeldSeat, SeatAvailability } from "../types/booking";

// =============================================================================
// The seat map's state and every way it can change. Pure functions only (no React): each one
// takes the current state and returns a NEW state, which makes them easy to test and reason about.
//
// Three things change the state:
//   1. the server's full answer          GET /seats                 (toSeatState)
//   2. my own clicks                     hold / release responses   (applyMy...)
//   3. other people, through the socket  seat:held / released / booked  (applyOthers..., applyBooked)
// =============================================================================

// Keep equal to MAX_SEATS_PER_BOOKING in backend/src/modules/booking/booking.constants.ts.
// (The server is the real enforcer; this only drives the "3 / 8 seats" counter.)
export const MAX_SEATS_PER_BOOKING = 8;

// `clockOffset` = server clock minus this computer's clock. Add it to Date.now() to get the
// server's time, so countdowns are right even when the visitor's clock is wrong.
export type SeatState = SeatAvailability & { clockOffset: number };

// "held" = held by someone else. "mine" = held by me.
export type SeatStatus = "available" | "booked" | "held" | "mine";

export function toSeatState(
  api: SeatAvailability,
  clientNow = Date.now(),
): SeatState {
  return { ...api, clockOffset: api.serverTime - clientNow };
}

export const serverNowOf = (state: SeatState, clientNow = Date.now()) =>
  clientNow + state.clockOffset;

// One lookup table for the whole map: seatId -> status. Seats not in the table are available.
// A hold whose deadline has passed counts as free: that is how a hold that EXPIRES on the
// server frees the seat on every screen, without the server having to announce it.
export function buildStatusMap(state: SeatState, now: number) {
  const map = new Map<string, SeatStatus>();
  for (const h of state.held)
    if (h.expiresAt > now) map.set(h.seatId, h.mine ? "mine" : "held");
  for (const id of state.booked) map.set(id, "booked"); // sold always wins over held
  return map;
}

export const mySeatIds = (state: SeatState, now: number) =>
  state.held.filter((h) => h.mine && h.expiresAt > now).map((h) => h.seatId);

// All my holds share one deadline, so any of them will do.
export function myExpiresAt(state: SeatState): number | null {
  const mine = state.held.filter((h) => h.mine);
  return mine.length ? Math.max(...mine.map((h) => h.expiresAt)) : null;
}

const without = (held: HeldSeat[], ids: string[]) =>
  held.filter((h) => !ids.includes(h.seatId));

// ---- 2. my own actions (the server's answer is the truth) ----

// The server returns ALL seats I hold now, so replace every hold of mine with that list.
export function applyMyHold(
  state: SeatState,
  seatIds: string[],
  expiresAt: number,
): SeatState {
  const others = state.held.filter(
    (h) => !h.mine && !seatIds.includes(h.seatId),
  );
  const mine = seatIds.map((seatId) => ({ seatId, expiresAt, mine: true }));
  return { ...state, held: [...others, ...mine] };
}

export function applyMyRelease(
  state: SeatState,
  released: string[],
): SeatState {
  return {
    ...state,
    held: state.held.filter((h) => !(h.mine && released.includes(h.seatId))),
  };
}

// ---- 3. other people (socket events) ----
// Events only ever change OTHER people's seats. A seat I hold is changed only by my own
// requests or by a fresh answer from the server, so a stray or late event can't take my
// seat away on my screen.

export function applyOthersHeld(
  state: SeatState,
  seatIds: string[],
  expiresAt: number,
): SeatState {
  const mine = new Set(state.held.filter((h) => h.mine).map((h) => h.seatId));
  const incoming = seatIds.filter((id) => !mine.has(id));
  return {
    ...state,
    held: [
      ...without(state.held, incoming),
      ...incoming.map((seatId) => ({ seatId, expiresAt, mine: false })),
    ],
  };
}

export function applyOthersReleased(
  state: SeatState,
  seatIds: string[],
): SeatState {
  return {
    ...state,
    held: state.held.filter((h) => h.mine || !seatIds.includes(h.seatId)),
  };
}

// Seats were sold (Part 9 sends this). Sold beats everything, including a hold.
export function applyBooked(state: SeatState, seatIds: string[]): SeatState {
  return {
    ...state,
    booked: [...new Set([...state.booked, ...seatIds])],
    held: without(state.held, seatIds),
  };
}
