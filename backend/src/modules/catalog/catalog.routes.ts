import { Router } from "express";
import { z } from "zod";
import { Movie } from "./movie.model";
import { Cinema } from "./cinema.model";
import { Hall } from "./hall.model";
import { Showtime } from "./showtime.model";
import { MOVIE_STATUSES } from "./catalog.constants";
import { buildShowtimeFilter, showtimeQuerySchema } from "./showtime.filter";
import { HttpError } from "../../utils/httpError";
import { parseObjectId } from "../../utils/objectId";
import { escapeRegex } from "../../utils/escapeRegex";

export const catalogRouter = Router();

// NOTE: in Express 5, req.query can't be replaced by middleware, so each handler
// validates it itself with .parse() (a bad query throws and becomes a 400).
const movieListQuerySchema = showtimeQuerySchema.extend({
  status: z.enum(MOVIE_STATUSES).optional(),
  genre: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).max(100).optional(), // title search
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

// Dropdown data for the city filter
catalogRouter.get("/cities", async (_req, res) => {
  const cities = await Cinema.distinct("city");
  res.json({ cities: cities.sort() });
});

catalogRouter.get("/cinemas", async (req, res) => {
  const { city } = z
    .object({ city: z.string().trim().min(1).optional() })
    .parse(req.query);
  const cinemas = await Cinema.find(city ? { city } : {})
    .sort({ name: 1 })
    .lean();
  res.json({ cinemas });
});

// Movie grid. With city/date/language/format given, it returns only movies that
// have at least one matching showtime ("what's playing in Kandy tonight in 3D?").
catalogRouter.get("/movies", async (req, res) => {
  const q = movieListQuerySchema.parse(req.query);

  const filter: Record<string, unknown> = {};
  if (q.status) filter.status = q.status;
  if (q.genre) filter.genres = q.genre; // matches if the genres array contains it
  if (q.q) filter.title = { $regex: escapeRegex(q.q), $options: "i" }; // "i" = ignore case

  if (q.city || q.date || q.language || q.format) {
    // distinct("movie", filter) = the list of unique movie IDs among matching showtimes
    const movieIds = await Showtime.distinct(
      "movie",
      await buildShowtimeFilter(q),
    );
    filter._id = { $in: movieIds };
  }

  // Run the page query and the count query at the same time
  const [items, total] = await Promise.all([
    Movie.find(filter)
      .sort({ releaseDate: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(), // .lean() = plain objects, faster than full Mongoose documents
    Movie.countDocuments(filter),
  ]);

  res.json({ items, total, page: q.page, pages: Math.ceil(total / q.limit) });
});

catalogRouter.get("/movies/:id", async (req, res) => {
  const movie = await Movie.findById(parseObjectId(req.params.id)).lean();
  if (!movie) throw new HttpError(404, "Movie not found");
  res.json({ movie });
});

// A movie's showtimes grouped by cinema: the data behind the "pick a showtime" screen.
catalogRouter.get("/movies/:id/showtimes", async (req, res) => {
  const movieId = parseObjectId(req.params.id);
  const q = showtimeQuerySchema.parse(req.query);

  const filter = { ...(await buildShowtimeFilter(q)), movie: movieId };
  const showtimes = await Showtime.find(filter).sort({ startTime: 1 }).lean();

  // Manual "join": fetch the related cinemas and halls in 2 queries (not 1 per showtime),
  // then look them up in Maps. (Mongoose's .populate() does something similar.)
  const [cinemas, halls] = await Promise.all([
    Cinema.find({ _id: { $in: showtimes.map((s) => s.cinema) } }).lean(),
    Hall.find({ _id: { $in: showtimes.map((s) => s.hall) } })
      .select("name")
      .lean(),
  ]);
  const cinemaById = new Map(cinemas.map((c) => [c._id.toString(), c]));
  const hallById = new Map(halls.map((h) => [h._id.toString(), h]));

  const groups = new Map<
    string,
    { cinema: (typeof cinemas)[number]; showtimes: object[] }
  >();
  for (const s of showtimes) {
    const key = s.cinema.toString();
    if (!groups.has(key))
      groups.set(key, { cinema: cinemaById.get(key)!, showtimes: [] });
    groups.get(key)!.showtimes.push({
      id: s._id,
      startTime: s.startTime,
      endTime: s.endTime,
      language: s.language,
      format: s.format,
      hall: hallById.get(s.hall.toString())?.name,
      prices: s.prices,
    });
  }

  res.json({ groups: [...groups.values()] });
});

// Everything the seat-map screen needs, including the hall's seat layout.
catalogRouter.get("/showtimes/:id", async (req, res) => {
  const showtime = await Showtime.findById(parseObjectId(req.params.id)).lean();
  if (!showtime) throw new HttpError(404, "Showtime not found");

  const [movie, cinema, hall] = await Promise.all([
    Movie.findById(showtime.movie).lean(),
    Cinema.findById(showtime.cinema).lean(),
    Hall.findById(showtime.hall).lean(),
  ]);

  res.json({ showtime, movie, cinema, hall });
});
