import { DateTime } from "luxon";
import mongoose from "mongoose";
import { connectMongo } from "../config/db";
import { env } from "../config/env";
import { Movie } from "../modules/catalog/movie.model";
import { Cinema } from "../modules/catalog/cinema.model";
import { Hall } from "../modules/catalog/hall.model";
import { Showtime } from "../modules/catalog/showtime.model";

type SeatDef = { id: string; number: number; col: number; type: string };
type RowDef = { label: string; seats: SeatDef[] };

// Builds a realistic seat map: rows A, B, C...; `aisleAfter` lists the seat numbers
// after which an empty column (an aisle) is inserted; the LAST rows are "premium".
function buildLayout(
  rowCount: number,
  seatsPerRow: number,
  aisleAfter: number[],
  premiumRows: number,
) {
  const rows: RowDef[] = [];
  let columns = 0;

  for (let r = 0; r < rowCount; r++) {
    const label = String.fromCharCode(65 + r); // 65 is "A" in ASCII
    const seats: SeatDef[] = [];
    let col = 0;

    for (let n = 1; n <= seatsPerRow; n++) {
      seats.push({
        id: `${label}${n}`,
        number: n,
        col,
        type: r >= rowCount - premiumRows ? "premium" : "standard",
      });
      col++;
      if (aisleAfter.includes(n)) col++; // skipping one column = a visible aisle gap
    }
    columns = Math.max(columns, col);
    rows.push({ label, seats });
  }
  return { columns, rows };
}

const countSeats = (layout: { rows: RowDef[] }) =>
  layout.rows.reduce((sum, row) => sum + row.seats.length, 0);
const poster = (title: string) =>
  `https://placehold.co/400x600/1e293b/e2e8f0/png?text=${encodeURIComponent(title)}`;

async function main() {
  if (env.NODE_ENV === "production")
    throw new Error("Refusing to seed in production");
  await connectMongo();

  // DEV ONLY: wipes the catalog (movies, cinemas, halls, showtimes). Users are untouched.
  await Promise.all([
    Showtime.deleteMany({}),
    Hall.deleteMany({}),
    Cinema.deleteMany({}),
    Movie.deleteMany({}),
  ]);

  const movies = await Movie.insertMany([
    {
      title: "The Last Lighthouse",
      description:
        "A keeper discovers the light has been guiding something home.",
      durationMinutes: 112,
      genres: ["Drama", "Mystery"],
      certificate: "PG-13",
      releaseDate: new Date("2026-10-30"),
      status: "now_showing",
      posterUrl: poster("The Last Lighthouse"),
    },
    {
      title: "Neon Monsoon",
      description: "A courier races across a rain-soaked megacity before dawn.",
      durationMinutes: 128,
      genres: ["Action", "Sci-Fi"],
      certificate: "PG-13",
      releaseDate: new Date("2026-11-06"),
      status: "now_showing",
      posterUrl: poster("Neon Monsoon"),
    },
    {
      title: "Orbit Zero",
      description: "Four astronauts, one broken ship, and 90 minutes of air.",
      durationMinutes: 141,
      genres: ["Sci-Fi", "Thriller"],
      certificate: "PG-13",
      releaseDate: new Date("2026-11-13"),
      status: "now_showing",
      posterUrl: poster("Orbit Zero"),
    },
    {
      title: "Paradise Road",
      description: "Two estranged sisters take one last road trip.",
      durationMinutes: 104,
      genres: ["Comedy", "Drama"],
      certificate: "PG",
      releaseDate: new Date("2026-11-01"),
      status: "now_showing",
      posterUrl: poster("Paradise Road"),
    },
    {
      title: "Laugh Track",
      description: "A struggling comedian accidentally becomes a viral hit.",
      durationMinutes: 98,
      genres: ["Comedy"],
      certificate: "PG",
      releaseDate: new Date("2026-11-08"),
      status: "now_showing",
      posterUrl: poster("Laugh Track"),
    },
    {
      title: "Hollow Crown",
      description: "A royal court hides a secret that could end a dynasty.",
      durationMinutes: 150,
      genres: ["Historical", "Drama"],
      certificate: "R",
      releaseDate: new Date("2026-12-12"),
      status: "upcoming",
      posterUrl: poster("Hollow Crown"),
    },
  ]);

  const cinemas = await Cinema.insertMany([
    {
      name: "Star Cinema Colombo",
      city: "Colombo",
      address: "12 Main Street, Colombo 03",
      phone: "0110000001",
    },
    {
      name: "Galaxy Multiplex",
      city: "Colombo",
      address: "45 Lake Road, Colombo 07",
      phone: "0110000002",
    },
    {
      name: "Hilltop Cinema",
      city: "Kandy",
      address: "8 Temple Street, Kandy",
      phone: "0810000003",
    },
  ]);

  // Every cinema gets Hall 1 and Hall 2; the first cinema also gets an IMAX hall.
  const hallDefs = cinemas.flatMap((cinema, i) => {
    const defs = [
      {
        name: "Hall 1",
        formats: ["2D"],
        layout: buildLayout(8, 12, [4, 8], 2),
      },
      {
        name: "Hall 2",
        formats: ["2D", "3D"],
        layout: buildLayout(10, 14, [5, 9], 3),
      },
    ];
    if (i === 0)
      defs.push({
        name: "IMAX Hall",
        formats: ["IMAX", "2D"],
        layout: buildLayout(12, 16, [4, 12], 3),
      });
    return defs.map((d) => ({
      cinema: cinema._id,
      name: d.name,
      formats: d.formats,
      seatLayout: d.layout,
      capacity: countSeats(d.layout),
    }));
  });
  const halls = await Hall.insertMany(hallDefs);

  // Showtimes: 4 slots a day for the next 7 days in every hall.
  // Slots are 3.5 hours apart; the longest movie (150 min) + 20 min cleaning = 170 min,
  // so shows in the same hall never overlap.
  const nowShowing = movies.filter((m) => m.status === "now_showing");
  const SLOTS = [
    { h: 10, m: 0 },
    { h: 13, m: 30 },
    { h: 17, m: 0 },
    { h: 20, m: 30 },
  ];
  const LANGUAGES = ["English", "Sinhala", "Tamil"];
  const PRICE_MULTIPLIER: Record<string, number> = {
    "2D": 1,
    "3D": 1.25,
    IMAX: 1.5,
    "4DX": 1.6,
  };
  const BUFFER_MINUTES = 20;
  const priceFor = (baseUnits: number, format: string) =>
    Math.round(baseUnits * 100 * PRICE_MULTIPLIER[format]); // cents

  const today = DateTime.now().setZone(env.APP_TIMEZONE).startOf("day");
  const showtimes = [];
  let counter = 0;

  for (const hall of halls) {
    for (let day = 0; day < 7; day++) {
      for (const slot of SLOTS) {
        const start = today
          .plus({ days: day })
          .set({ hour: slot.h, minute: slot.m });
        if (start.toMillis() < Date.now()) continue; // don't create shows in the past

        const movie = nowShowing[counter % nowShowing.length];
        const format = hall.formats[counter % hall.formats.length];
        showtimes.push({
          movie: movie._id,
          hall: hall._id,
          cinema: hall.cinema,
          startTime: start.toJSDate(),
          endTime: start
            .plus({ minutes: movie.durationMinutes + BUFFER_MINUTES })
            .toJSDate(),
          language: LANGUAGES[counter % LANGUAGES.length],
          format,
          prices: {
            standard: priceFor(1200, format),
            premium: priceFor(1800, format),
          },
        });
        counter++;
      }
    }
  }
  await Showtime.insertMany(showtimes);

  console.log(
    `Seeded: ${movies.length} movies, ${cinemas.length} cinemas, ${halls.length} halls, ${showtimes.length} showtimes`,
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
