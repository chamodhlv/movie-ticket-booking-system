import { z } from "zod";
import {
  FORMATS,
  MOVIE_STATUSES,
  SEAT_TYPES,
} from "../catalog/catalog.constants";

export const objectIdString = z.string().regex(/^[a-f\d]{24}$/i, "invalid id");

// Only http(s) links are allowed. A trailer link is rendered as <a href="...">, so a
// stored "javascript:alert(1)" URL would run code in every visitor's browser (stored XSS).
const optionalHttpUrl = z
  .string()
  .trim()
  .max(500)
  .refine(
    (u) => u === "" || /^https?:\/\/\S+$/i.test(u),
    "must be an http(s) URL",
  )
  .default("");

// ---------- Movies ----------
export const movieInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(""),
  durationMinutes: z.number().int().min(1).max(600),
  genres: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
  certificate: z.string().trim().max(10).default(""),
  // HTML date inputs send "" when empty, so turn "" into "not provided"
  releaseDate: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.coerce.date().optional(),
  ),
  posterUrl: optionalHttpUrl,
  trailerUrl: optionalHttpUrl,
  status: z.enum(MOVIE_STATUSES).default("upcoming"),
});

// ---------- Cinemas ----------
export const cinemaInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  city: z.string().trim().min(1).max(60),
  address: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(30).default(""),
});

// ---------- Halls (with the seat layout) ----------
const seatInput = z.object({
  id: z.string().regex(/^[A-Z]{1,2}\d{1,3}$/), // "A1", "B12", "AA3"
  number: z.number().int().min(1).max(999),
  col: z.number().int().min(0).max(100),
  type: z.enum(SEAT_TYPES),
});

const rowInput = z.object({
  label: z.string().regex(/^[A-Z]{1,2}$/),
  seats: z.array(seatInput).min(1).max(60),
});

export const hallInputSchema = z
  .object({
    cinema: objectIdString,
    name: z.string().trim().min(1).max(50),
    formats: z.array(z.enum(FORMATS)).min(1),
    seatLayout: z.object({
      columns: z.number().int().min(1).max(100),
      rows: z.array(rowInput).min(1).max(40),
    }),
  })
  // The checks above look at one field at a time. These look ACROSS fields. The editor
  // in the browser will build the layout, but we never trust the browser: a broken
  // layout (two seats with the same id) would later let two people book the same seat.
  .superRefine((hall, ctx) => {
    const { columns, rows } = hall.seatLayout;
    const seenIds = new Set<string>();
    const seenLabels = new Set<string>();

    rows.forEach((row, r) => {
      if (seenLabels.has(row.label)) {
        ctx.addIssue({
          code: "custom",
          path: ["seatLayout", "rows", r, "label"],
          message: `Duplicate row label ${row.label}`,
        });
      }
      seenLabels.add(row.label);

      const seenCols = new Set<number>();
      row.seats.forEach((seat, s) => {
        const path = ["seatLayout", "rows", r, "seats", s];
        // The seat id must be built from the row label and seat number, e.g. row "A" + 7 = "A7"
        if (seat.id !== `${row.label}${seat.number}`) {
          ctx.addIssue({
            code: "custom",
            path,
            message: `Seat id ${seat.id} must be ${row.label}${seat.number}`,
          });
        }
        if (seenIds.has(seat.id)) {
          ctx.addIssue({
            code: "custom",
            path,
            message: `Duplicate seat id ${seat.id}`,
          });
        }
        seenIds.add(seat.id);
        if (seat.col >= columns) {
          ctx.addIssue({
            code: "custom",
            path,
            message: `Seat ${seat.id} is outside the grid (col ${seat.col}, grid has ${columns} columns)`,
          });
        }
        if (seenCols.has(seat.col)) {
          ctx.addIssue({
            code: "custom",
            path,
            message: `Two seats in row ${row.label} share column ${seat.col}`,
          });
        }
        seenCols.add(seat.col);
      });
    });
  });

// ---------- Showtimes ----------
// Prices are whole numbers in minor units (cents).
const priceCents = z.number().int().min(0).max(100_000_000);

export const showtimeInputSchema = z.object({
  movie: objectIdString,
  hall: objectIdString,
  startTime: z.coerce.date(), // accepts an ISO string such as "2026-11-25T15:00:00Z"
  language: z.string().trim().min(1).max(30),
  format: z.enum(FORMATS),
  prices: z.object({
    standard: priceCents,
    premium: priceCents.optional(),
    vip: priceCents.optional(),
    wheelchair: priceCents.optional(),
  }),
});

export type HallInput = z.infer<typeof hallInputSchema>;
export type ShowtimeInput = z.infer<typeof showtimeInputSchema>;
