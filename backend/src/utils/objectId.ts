import { Types } from "mongoose";
import { HttpError } from "./httpError";

// Without this check, GET /api/movies/abc makes Mongoose throw a CastError (a 500).
// An unknown ID should simply be a 404.
export function parseObjectId(id: string) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(404, "Not found");
  return new Types.ObjectId(id);
}
