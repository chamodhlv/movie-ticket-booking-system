import type { ApiLayout, SeatType } from "../lib/seatLayout";
import type { Prices } from "./catalog";

// What the admin form sends to POST/PUT /api/admin/movies.
export type MovieInput = {
  title: string;
  description: string;
  durationMinutes: number;
  genres: string[];
  certificate: string;
  releaseDate: string; // "YYYY-MM-DD" or "" when unknown
  posterUrl: string;
  trailerUrl: string;
  status: "upcoming" | "now_showing" | "archived";
};

export type CinemaInput = {
  name: string;
  city: string;
  address: string;
  phone: string;
};

// GET /api/admin/halls?cinema=  (the list leaves the big seat layout out)
export type HallSummary = {
  _id: string;
  cinema: string;
  name: string;
  formats: string[];
  capacity: number;
};

// GET /api/admin/halls/:id  (with the layout)
export type HallDetail = HallSummary & { seatLayout: ApiLayout };

export type HallInput = {
  cinema: string;
  name: string;
  formats: string[];
  seatLayout: ApiLayout;
};

export type AdminShowtime = {
  _id: string;
  movie: string;
  hall: string;
  cinema: string;
  startTime: string; // UTC ISO
  endTime: string;
  language: string;
  format: string;
  prices: Prices;
  status: "scheduled" | "cancelled";
  movieTitle: string;
};

export type ShowtimeInput = {
  movie: string;
  hall: string;
  startTime: string; // UTC ISO (converted from the cinema's local time in the form)
  language: string;
  format: string;
  prices: Partial<Record<SeatType, number>>; // cents
};
