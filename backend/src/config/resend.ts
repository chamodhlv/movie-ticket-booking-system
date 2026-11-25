import { Resend } from "resend";
import { env } from "./env";

// One shared client, like `stripe` and `redis`. It only holds the API key and sends HTTPS
// requests to Resend's servers; there is no persistent connection to open or close.
export const resend = new Resend(env.RESEND_API_KEY);
