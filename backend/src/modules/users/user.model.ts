import { Schema, model } from "mongoose";

export const ROLES = ["customer", "admin", "staff"] as const;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // unique: true creates a database index, the real guarantee that two accounts
    // can't share an email (a check in code alone can race).
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // select: false = the hash is NOT returned by normal queries. We must ask for it
    // explicitly (.select("+passwordHash")) at login, so it can't leak by accident.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: [...ROLES], default: "customer" },
  },
  { timestamps: true }, // adds createdAt / updatedAt automatically
);

export const User = model("User", userSchema);
