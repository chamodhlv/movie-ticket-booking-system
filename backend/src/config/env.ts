import "dotenv/config";
import { DateTime } from "luxon";
import { z } from "zod";

// Describe what a valid environment looks like.
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  // process.env values are always strings, so coerce turns "5000" into 5000
  PORT: z.coerce.number().default(5000),
  MONGO_URI: z.string().min(1),
  REDIS_URL: z.string().min(1),
  CLIENT_ORIGIN: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, "must be at least 32 characters"),
  // The timezone cinemas operate in (IANA name). Used to decide what "today" means.
  // Fail fast if someone types a timezone that doesn't exist.
  APP_TIMEZONE: z
    .string()
    .default("Asia/Colombo")
    .refine(
      (tz) => DateTime.local().setZone(tz).isValid,
      "must be a valid IANA timezone, e.g. Asia/Colombo",
    ),
});

const parsed = schema.safeParse(process.env);

// FAIL FAST: if a variable is missing, crash right now with a clear message,
// instead of crashing later with a confusing error in the middle of a booking.
if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.issues);
  process.exit(1);
}

export const env = parsed.data;

// `env.ts` loads environment variables from the `.env` file, validates them using Zod, and exports the validated configuration for use throughout the backend.
