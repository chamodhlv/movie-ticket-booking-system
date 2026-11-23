import type { Request, Response } from "express";
import type Stripe from "stripe";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { stripe } from "../../config/stripe";
import { fulfillPayment, markCanceled } from "./fulfillment";

// POST /api/payments/webhook: Stripe calls THIS URL to tell us what happened to a payment.
//
// A WEBHOOK IS A PUBLIC URL ANYONE CAN POST TO, so before believing a word of it we verify the
// signature: Stripe signs the exact bytes of the body with a secret only Stripe and we know
// (STRIPE_WEBHOOK_SECRET). That is why app.ts gives this route the RAW body (express.raw) instead of
// parsed JSON: re-serialising parsed JSON can change a single byte and break the signature.
export async function stripeWebhook(req: Request, res: Response) {
  const signature = req.header("stripe-signature");
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      signature ?? "",
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    // Not from Stripe, or tampered with. 400 = "don't send this again".
    res.status(400).json({ message: "Invalid signature" });
    return;
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const result = await fulfillPayment(event.data.object);
        logger.info({ event: event.id, result }, "Payment fulfilled");
        break;
      }
      case "payment_intent.canceled":
        await markCanceled(event.data.object.id);
        break;
      // payment_intent.payment_failed: nothing to do. The customer can retry in the same form.
      default:
        break; // events we don't care about
    }
    res.json({ received: true });
  } catch (err) {
    // OUR failure (e.g. the database was down). A 500 tells Stripe to try again later
    // (it retries for days), and fulfillPayment is idempotent so a retry is safe.
    logger.error({ err, event: event.id }, "Webhook processing failed");
    res.status(500).json({ message: "Webhook processing failed" });
  }
}
