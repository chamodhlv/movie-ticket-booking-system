import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { HttpError } from "../../utils/httpError";
import { parseObjectId } from "../../utils/objectId";
import { dayRange } from "../../utils/dateRange";
import { Cinema } from "../catalog/cinema.model";
import { Hall } from "../catalog/hall.model";
import { Movie } from "../catalog/movie.model";
import { Showtime } from "../catalog/showtime.model";
import {
  cinemaInputSchema,
  hallInputSchema,
  movieInputSchema,
  objectIdString,
  showtimeInputSchema,
  type HallInput,
} from "./admin.schemas";
import { countSeats, layoutSignature } from "./hall.service";
import { saveShowtime } from "./showtime.service";

export const adminRouter = Router();

// Registered ONCE for the whole router, so a route added later can't forget the check.
// (Staff cannot use these; the "staff" role is for scanning tickets later.)
adminRouter.use(requireAuth, requireRole("admin"));

// ====================== MOVIES ======================
// (The list and detail endpoints already exist publicly: GET /api/movies and /api/movies/:id)

adminRouter.post("/movies", validate(movieInputSchema), async (req, res) => {
  const movie = await Movie.create(req.body);
  res.status(201).json({ movie });
});

adminRouter.put("/movies/:id", validate(movieInputSchema), async (req, res) => {
  const movie = await Movie.findByIdAndUpdate(
    parseObjectId(req.params.id),
    req.body,
    { new: true, runValidators: true },
  );
  if (!movie) throw new HttpError(404, "Movie not found");
  res.json({ movie });
});

adminRouter.delete("/movies/:id", async (req, res) => {
  const id = parseObjectId(req.params.id);
  // MongoDB has no foreign keys, so WE must stop deleting things that others point to.
  if (await Showtime.exists({ movie: id })) {
    throw new HttpError(
      409,
      "This movie has showtimes. Set its status to archived instead of deleting it.",
    );
  }
  if (!(await Movie.findByIdAndDelete(id)))
    throw new HttpError(404, "Movie not found");
  res.status(204).end();
});

// ====================== CINEMAS ======================
// (List: GET /api/cinemas)

adminRouter.post("/cinemas", validate(cinemaInputSchema), async (req, res) => {
  const cinema = await Cinema.create(req.body);
  res.status(201).json({ cinema });
});

adminRouter.put(
  "/cinemas/:id",
  validate(cinemaInputSchema),
  async (req, res) => {
    const cinema = await Cinema.findByIdAndUpdate(
      parseObjectId(req.params.id),
      req.body,
      { new: true, runValidators: true },
    );
    if (!cinema) throw new HttpError(404, "Cinema not found");
    res.json({ cinema });
  },
);

adminRouter.delete("/cinemas/:id", async (req, res) => {
  const id = parseObjectId(req.params.id);
  if (await Hall.exists({ cinema: id }))
    throw new HttpError(409, "This cinema still has halls. Delete them first.");
  if (!(await Cinema.findByIdAndDelete(id)))
    throw new HttpError(404, "Cinema not found");
  res.status(204).end();
});

// ====================== HALLS ======================

adminRouter.get("/halls", async (req, res) => {
  const { cinema } = z
    .object({ cinema: objectIdString.optional() })
    .parse(req.query);
  // The seat layout is big, so the list leaves it out. Fetch one hall to get the layout.
  const halls = await Hall.find(cinema ? { cinema } : {})
    .select("-seatLayout")
    .sort({ name: 1 })
    .lean();
  res.json({ halls });
});

adminRouter.get("/halls/:id", async (req, res) => {
  const hall = await Hall.findById(parseObjectId(req.params.id)).lean();
  if (!hall) throw new HttpError(404, "Hall not found");
  res.json({ hall });
});

adminRouter.post("/halls", validate(hallInputSchema), async (req, res) => {
  const body = req.body as HallInput;
  if (!(await Cinema.exists({ _id: body.cinema })))
    throw new HttpError(400, "Cinema does not exist");
  // capacity is always computed here, never accepted from the client
  const hall = await Hall.create({
    ...body,
    capacity: countSeats(body.seatLayout),
  });
  res.status(201).json({ hall });
});

adminRouter.put("/halls/:id", validate(hallInputSchema), async (req, res) => {
  const id = parseObjectId(req.params.id);
  const body = req.body as HallInput;

  const existing = await Hall.findById(id).lean();
  if (!existing) throw new HttpError(404, "Hall not found");

  const upcoming = {
    hall: id,
    status: "scheduled" as const,
    startTime: { $gte: new Date() },
  };

  // Moving, removing or re-typing a seat would break showtimes (and later, bookings)
  // that already refer to it, so this is only allowed while nothing upcoming uses the hall.
  if (
    layoutSignature(existing.seatLayout) !== layoutSignature(body.seatLayout) &&
    (await Showtime.exists(upcoming))
  ) {
    throw new HttpError(
      409,
      "This hall has upcoming showtimes, so its seat layout can't be changed.",
    );
  }
  // Same idea for formats: don't remove a format that an upcoming show uses.
  if (await Showtime.exists({ ...upcoming, format: { $nin: body.formats } })) {
    throw new HttpError(
      409,
      "An upcoming showtime uses a format you removed from this hall.",
    );
  }

  // A hall can't be moved to another cinema (`body.cinema` is ignored on purpose),
  // because every showtime stores a copy of its hall's cinema.
  const hall = await Hall.findByIdAndUpdate(
    id,
    {
      name: body.name,
      formats: body.formats,
      seatLayout: body.seatLayout,
      capacity: countSeats(body.seatLayout),
    },
    { new: true, runValidators: true },
  );
  res.json({ hall });
});

adminRouter.delete("/halls/:id", async (req, res) => {
  const id = parseObjectId(req.params.id);
  if (await Showtime.exists({ hall: id }))
    throw new HttpError(409, "This hall has showtimes. Remove them first.");
  if (!(await Hall.findByIdAndDelete(id)))
    throw new HttpError(404, "Hall not found");
  res.status(204).end();
});

// ====================== SHOWTIMES ======================

// Admin view: includes PAST shows too (the public API hides them).
adminRouter.get("/showtimes", async (req, res) => {
  const q = z
    .object({
      hall: objectIdString.optional(),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD")
        .optional(),
    })
    .parse(req.query);

  const filter: Record<string, unknown> = {};
  if (q.hall) filter.hall = q.hall;
  if (q.date) {
    const { start, end } = dayRange(q.date);
    filter.startTime = { $gte: start, $lt: end };
  }

  const showtimes = await Showtime.find(filter)
    .sort({ startTime: 1 })
    .limit(200)
    .lean();
  const movies = await Movie.find({
    _id: { $in: showtimes.map((s) => s.movie) },
  })
    .select("title")
    .lean();
  const titleById = new Map(movies.map((m) => [m._id.toString(), m.title]));

  res.json({
    showtimes: showtimes.map((s) => ({
      ...s,
      movieTitle: titleById.get(s.movie.toString()) ?? "(deleted movie)",
    })),
  });
});

adminRouter.post(
  "/showtimes",
  validate(showtimeInputSchema),
  async (req, res) => {
    const showtime = await saveShowtime(req.body);
    res.status(201).json({ showtime });
  },
);

adminRouter.put(
  "/showtimes/:id",
  validate(showtimeInputSchema),
  async (req, res) => {
    const showtime = await saveShowtime(req.body, parseObjectId(req.params.id));
    res.json({ showtime });
  },
);

adminRouter.delete("/showtimes/:id", async (req, res) => {
  // TODO(booking part): once bookings exist, refuse when any exist, or cancel + refund them.
  const deleted = await Showtime.findByIdAndDelete(
    parseObjectId(req.params.id),
  );
  if (!deleted) throw new HttpError(404, "Showtime not found");
  res.status(204).end();
});
