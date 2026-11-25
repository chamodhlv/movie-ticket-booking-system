import fs from "fs";
import mongoose, { Types } from "mongoose";
import { connectMongo } from "../config/db";
import { logger } from "../config/logger";
import { loadTicketData } from "../modules/tickets/ticket.service";
import {
  buildTicketEmail,
  sendTicketEmail,
} from "../modules/tickets/ticketEmail";
import { createTicketToken } from "../modules/tickets/ticketToken";
import { qrDataUrl } from "../modules/tickets/qr";

// Developer tool for the ticket e-mail.
//
//   npm run email:test --workspace backend -- <bookingId>             send it for real (even if already sent)
//   npm run email:test --workspace backend -- <bookingId> --preview   write ticket-email-preview.html, send nothing
//
// The preview lets you tune the design in a browser without using up e-mails.
async function main() {
  const [idArg, flag] = process.argv.slice(2);
  if (!idArg || !Types.ObjectId.isValid(idArg)) {
    console.error(
      "Usage: npm run email:test --workspace backend -- <bookingId> [--preview]",
    );
    process.exit(1);
  }
  const bookingId = new Types.ObjectId(idArg);
  await connectMongo();

  if (flag === "--preview") {
    const data = await loadTicketData(bookingId);
    if (!data) throw new Error("Booking not found");
    // A browser can't resolve "cid:" (that only exists inside an e-mail), so show the QR as a data URL.
    const qr = await qrDataUrl(createTicketToken(idArg));
    fs.writeFileSync(
      "ticket-email-preview.html",
      buildTicketEmail(data, qr).html,
    );
    logger.info("Wrote ticket-email-preview.html (open it in your browser)");
  } else {
    const result = await sendTicketEmail(bookingId, { force: true });
    logger.info(`Result: ${result}`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error(err, "email:test failed");
  process.exit(1);
});
