import type { ApiLayout } from "../lib/seatLayout";
import type { Cinema, Movie, Prices } from "./catalog";

// GET /api/showtimes/:id/seats  (who has which seat right now)
export type HeldSeat = {
  seatId: string;
  expiresAt: number; // ms since 1970, on the SERVER's clock
  mine: boolean; // held by the logged-in user? (we are never told who else holds a seat)
};

export type SeatAvailability = {
  serverTime: number; // the server's clock (ms since 1970) when it answered
  booked: string[]; // sold seats, e.g. ["A1", "A2"]
  held: HeldSeat[];
};

// GET /api/showtimes/:id  (everything the seat-map page needs besides availability)
export type ShowtimeDetail = {
  showtime: {
    _id: string;
    startTime: string; // UTC ISO
    endTime: string;
    language: string;
    format: string;
    prices: Prices;
    status: "scheduled" | "cancelled";
  };
  movie: Movie;
  cinema: Cinema;
  hall: { _id: string; name: string; seatLayout: ApiLayout };
};

// POST /api/showtimes/:id/hold  -> ALL the seats I hold now + when they expire
export type HoldResponse = { seatIds: string[]; expiresAt: number };

// Events pushed by the server through Socket.IO
export type SeatHeldEvent = {
  showtimeId: string;
  seatIds: string[];
  expiresAt: number;
};
export type SeatsEvent = { showtimeId: string; seatIds: string[] };
