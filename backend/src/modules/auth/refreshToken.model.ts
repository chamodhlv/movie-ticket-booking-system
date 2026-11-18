import { Schema, model } from "mongoose";

const refreshTokenSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // We store only the HASH of the token. If the database ever leaks, the
    // attacker gets hashes that can't be used as cookies.
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// TTL index: MongoDB automatically deletes a document once `expiresAt` passes
// (expireAfterSeconds: 0 means "delete exactly at that time"; the cleanup job
// runs about every 60 seconds). No cron job needed.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = model("RefreshToken", refreshTokenSchema);
