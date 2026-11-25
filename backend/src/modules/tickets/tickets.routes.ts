import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { parseObjectId } from "../../utils/objectId";
import { getTicketForViewer } from "./ticket.service";

export const ticketsRouter = Router();

// GET /api/bookings/:bookingId  ->  everything the ticket page needs, QR code included.
// (Part 11 adds GET /api/bookings, the list of all your bookings, to this same router.)
ticketsRouter.get("/bookings/:bookingId", requireAuth, async (req, res) => {
  const bookingId = parseObjectId(req.params.bookingId);
  res.json(await getTicketForViewer(bookingId, req.user!));
});
