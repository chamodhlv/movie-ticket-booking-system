import { Schema, model } from "mongoose";
import { FORMATS } from "./catalog.constants";

// Reusable price rule: a whole number of minor units (cents), never negative.
const price = {
  type: Number,
  min: 0,
  validate: {
    validator: Number.isInteger,
    message: "Price must be a whole number of cents",
  },
};

const showtimeSchema = new Schema(
  {
    movie: { type: Schema.Types.ObjectId, ref: "Movie", required: true },
    hall: { type: Schema.Types.ObjectId, ref: "Hall", required: true },
    // Deliberately duplicated from hall.cinema so "showtimes in city X" is one fast query.
    cinema: { type: Schema.Types.ObjectId, ref: "Cinema", required: true },
    startTime: { type: Date, required: true }, // stored in UTC, converted to local time for display
    endTime: { type: Date, required: true }, // start + movie length + cleaning buffer
    language: { type: String, required: true, trim: true },
    format: { type: String, enum: [...FORMATS], required: true },
    prices: {
      standard: { ...price, required: true },
      premium: price,
      vip: price,
      wheelchair: price,
    },
    status: {
      type: String,
      enum: ["scheduled", "cancelled"],
      default: "scheduled",
    },
  },
  { timestamps: true },
);

// Indexes = the "table of contents" MongoDB uses to avoid scanning every document.
showtimeSchema.index({ hall: 1, startTime: 1 }); // overlap check when an admin schedules a show
showtimeSchema.index({ movie: 1, startTime: 1 }); // "when is this movie playing?"
showtimeSchema.index({ cinema: 1, startTime: 1 }); // city filter + a cinema's daily schedule

export const Showtime = model("Showtime", showtimeSchema);
