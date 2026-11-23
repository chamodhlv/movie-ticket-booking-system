import Stripe from "stripe";
import { env } from "./env";

// ONE Stripe client for the whole backend, authenticated with our secret key.
// maxNetworkRetries: if the network hiccups, the SDK retries the call by itself.
// This is safe because we send an idempotency key with every call that creates something
// (Stripe returns the SAME result for a repeated key instead of creating a duplicate).
export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  maxNetworkRetries: 2,
});
