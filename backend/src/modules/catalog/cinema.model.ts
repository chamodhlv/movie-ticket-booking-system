import { Schema, model } from "mongoose";

const cinemaSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true, index: true }, // we filter by city a lot
    address: { type: String, default: "" },
    phone: { type: String, default: "" },
  },
  { timestamps: true },
);

export const Cinema = model("Cinema", cinemaSchema);
