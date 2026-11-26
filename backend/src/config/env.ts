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
  // Stripe (payments). Test-mode keys look like sk_test_... and whsec_...
  // The secret key lets the SERVER create payments: it must never reach the browser or git.
  STRIPE_SECRET_KEY: z
    .string()
    .startsWith("sk_", "must be a Stripe secret key (sk_test_...)"),
  // Used to check that a webhook request really came from Stripe (see webhook.ts).
  STRIPE_WEBHOOK_SECRET: z
    .string()
    .startsWith(
      "whsec_",
      "must be a Stripe webhook signing secret (whsec_...)",
    ),
  // Signs the QR code on every ticket (see modules/tickets/ticketToken.ts). It is a DIFFERENT secret
  // from JWT_ACCESS_SECRET on purpose: if one leaks, the other still protects its own job.
  TICKET_SECRET: z.string().min(32, "must be at least 32 characters"),
  // Resend sends the ticket e-mails. Create a key at resend.com -> API Keys ("Sending access").
  RESEND_API_KEY: z
    .string()
    .startsWith("re_", "must be a Resend API key (re_...)"),
  // The "From" of every e-mail. Until you verify your own domain in Resend, the only value that
  // works is "CineBook <onboarding@resend.dev>", and then Resend delivers ONLY to the e-mail
  // address you signed up to Resend with. After verifying a domain use e.g.
  // "CineBook <tickets@yourdomain.com>".
  EMAIL_FROM: z.string().min(3),
  // WHERE the ticket e-mail worker runs.
  //   "true" (default): inside the API process, so ONE command (npm run dev:backend) does everything.
  //   "false": the API only QUEUES e-mails and you run the worker as its own process
  //            (npm run dev:worker, or node dist/worker.js in production).
  // process.env values are strings, so we accept the two words and turn them into a real boolean.
  EMAIL_WORKER_IN_API: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
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
