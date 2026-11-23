import { loadStripe } from "@stripe/stripe-js";

// The PUBLISHABLE key (pk_test_...) is designed to be public: it can only start the card form,
// never create charges or read data. The SECRET key stays on the server.
// loadStripe() downloads Stripe.js from Stripe's own servers (the card fields live inside iframes
// that Stripe controls, so card numbers never touch our code or our server).
const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
export const stripePromise = key ? loadStripe(key) : null;
