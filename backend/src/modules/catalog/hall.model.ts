import { Schema, model } from "mongoose";
import { FORMATS, SEAT_TYPES } from "./catalog.constants";

// One physical seat. Only REAL seats are stored; aisles are just missing `col` values.
const seatSchema = new Schema(
  {
    id: { type: String, required: true }, // "A1": stable ID, will be used in bookings
    number: { type: Number, required: true }, // 1, 2, 3 (the number printed on the seat)
    col: { type: Number, required: true }, // horizontal position in the grid
    type: { type: String, enum: [...SEAT_TYPES], default: "standard" }, // decides the price
  },
  { _id: false }, // no auto-generated _id per seat: the string `id` is the identity
);

const rowSchema = new Schema(
  {
    label: { type: String, required: true }, // "A", "B", ...
    seats: { type: [seatSchema], default: [] },
  },
  { _id: false },
);

const hallSchema = new Schema(
  {
    cinema: { type: Schema.Types.ObjectId, ref: "Cinema", required: true },
    name: { type: String, required: true, trim: true },
    formats: { type: [{ type: String, enum: [...FORMATS] }], default: ["2D"] }, // what this hall can show
    seatLayout: {
      columns: { type: Number, required: true, min: 1 }, // grid width, aisles included
      rows: { type: [rowSchema], default: [] },
    },
    capacity: { type: Number, required: true, min: 0 }, // total seat count, saved for convenience
  },
  { timestamps: true },
);

// Two halls in the same cinema can't share a name. Also serves "all halls of a cinema" queries.
hallSchema.index({ cinema: 1, name: 1 }, { unique: true });

export const Hall = model("Hall", hallSchema);
