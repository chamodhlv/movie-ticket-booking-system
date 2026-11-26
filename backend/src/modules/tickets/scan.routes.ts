import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth, requireFreshRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { scanTicket } from "./scan.service";

export const staffRouter = Router();

// Registered ONCE for the whole router. Staff and admins only, and the role is checked against
// the database (not the login token) so that adding or removing someone takes effect at once.
staffRouter.use(requireAuth, requireFreshRole("staff", "admin"));

// A busy door scans roughly one ticket a second. This ceiling is far above that, and only
// exists to stop a script from hammering the endpoint.
const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// `ticket` is whatever came in: the text read from the QR code, or the code staff typed.
const scanSchema = z.object({ ticket: z.string().trim().min(1).max(200) });

// POST /api/staff/tickets/scan   { ticket: "..." }  ->  a ScanResult
staffRouter.post(
  "/tickets/scan",
  scanLimiter,
  validate(scanSchema),
  async (req, res) => {
    res.json(await scanTicket(req.body.ticket, req.user!.id));
  },
);
