export type Movie = {
  _id: string;
  title: string;
  description: string;
  durationMinutes: number;
  genres: string[];
  certificate: string;
  releaseDate?: string;
  posterUrl: string;
  trailerUrl: string;
  status: "upcoming" | "now_showing" | "archived";
};

export type Cinema = {
  _id: string;
  name: string;
  city: string;
  address: string;
  phone?: string;
};

// Prices are WHOLE NUMBERS IN MINOR UNITS (cents), exactly as the backend stores them.
export type Prices = {
  standard: number;
  premium?: number;
  vip?: number;
  wheelchair?: number;
};

export type ShowtimeItem = {
  id: string;
  startTime: string; // ISO string in UTC, e.g. "2026-11-21T08:00:00.000Z"
  endTime: string;
  language: string;
  format: string;
  hall?: string;
  prices: Prices;
};

export type ShowtimeGroup = { cinema: Cinema; showtimes: ShowtimeItem[] };

export type MoviePage = {
  items: Movie[];
  total: number;
  page: number;
  pages: number;
};

// The four browse filters. A missing key means "no filter" (the "All" option).
export type Filters = {
  city?: string;
  date?: string;
  language?: string;
  format?: string;
};
