import { Schema, model } from "mongoose";
import { MOVIE_STATUSES } from "./catalog.constants";

const movieSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    durationMinutes: { type: Number, required: true, min: 1 },
    genres: { type: [String], default: [] },
    certificate: { type: String, default: "" }, // age rating, e.g. "PG-13"
    releaseDate: { type: Date },
    posterUrl: { type: String, default: "" },
    trailerUrl: { type: String, default: "" },
    status: {
      type: String,
      enum: [...MOVIE_STATUSES],
      default: "upcoming",
      index: true,
    },
  },
  { timestamps: true },
);

export const Movie = model("Movie", movieSchema);
