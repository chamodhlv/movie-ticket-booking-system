import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../../middleware/auth";
import { parseObjectId } from "../../utils/objectId";
import {
  cancelCheckout,
  createCheckout,
  getCheckout,
} from "./checkout.service";

// Mounted at /api (see app.ts):
//   POST   /showtimes/:id/checkout   start paying for the seats I hold
//   GET    /checkouts/:checkoutId    what is the status? (the browser polls this after paying)
//   DELETE /checkouts/:checkoutId    I changed my mind: cancel the payment
// (The webhook is NOT here: it needs the raw request body, see app.ts.)
export const paymentsRouter = Router();

// Creating payments costs us Stripe API calls, so keep it modest (per user, not per IP).
const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: (req) => req.user!.id,
  standardHeaders: true,
  legacyHeaders: false,
});

paymentsRouter.post(
  "/showtimes/:id/checkout",
  requireAuth,
  checkoutLimiter,
  async (req, res) => {
    const result = await createCheckout(
      req.user!.id,
      parseObjectId(req.params.id),
    );
    res.json(result);
  },
);

paymentsRouter.get("/checkouts/:checkoutId", requireAuth, async (req, res) => {
  res.json(
    await getCheckout(req.user!.id, parseObjectId(req.params.checkoutId)),
  );
});

paymentsRouter.delete(
  "/checkouts/:checkoutId",
  requireAuth,
  checkoutLimiter,
  async (req, res) => {
    const status = await cancelCheckout(
      req.user!.id,
      parseObjectId(req.params.checkoutId),
    );
    res.json({ status });
  },
);
