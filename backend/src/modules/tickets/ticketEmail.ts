import { DateTime } from "luxon";
import { Types } from "mongoose";
import type { ErrorResponse } from "resend";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { resend } from "../../config/resend";
import { escapeHtml } from "../../utils/escapeHtml";
import { Booking } from "../booking/booking.model";
import { qrPngBuffer } from "./qr";
import {
  bookingReference,
  loadTicketData,
  type TicketData,
} from "./ticket.service";
import { createTicketToken } from "./ticketToken";
import { formatManualCode } from "./manualCode";

// The <img> in the HTML points at "cid:ticket-qr". CID = "content id": it refers to the
// attachment that carries the same contentId. That makes the QR part of the e-mail itself, so
// it shows even when the e-mail app blocks remote images. (Gmail also refuses data: URLs in
// <img>, which is why we don't just paste the QR as base64 into the HTML.)
const QR_CID = "ticket-qr";

// Thrown when Resend says no. `retryable` tells the worker whether trying again can help.
export class EmailSendError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
  ) {
    super(message);
  }
}

// Which Resend failures are worth retrying?
//   no status code      -> we never got an answer (network down, timeout): retry
//   429                 -> "slow down" / quota: retry later
//   409                 -> the same send is still in flight: retry
//   5xx                 -> Resend itself is having trouble: retry
//   any other 4xx       -> OUR request is wrong (bad API key, forbidden recipient, invalid
//                          address). Sending it again identically will fail identically.
function isRetryable(error: ErrorResponse): boolean {
  const code = error.statusCode;
  return code === null || code === 429 || code === 409 || code >= 500;
}

const money = (minorUnits: number, currency: string) =>
  new Intl.NumberFormat("en-LK", { style: "currency", currency }).format(
    minorUnits / 100, // we store cents; assumes a 2-decimal currency (LKR, USD, ...)
  );

// "A10" must sort after "A9", so compare with numeric: true.
const sortSeats = (ids: string[]) =>
  [...ids].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

// PURE function: data in, text out. No database, no network, so it is easy to test and preview.
// `qrSrc` is what goes in <img src>: "cid:ticket-qr" for a real e-mail, or a data: URL when we
// preview the e-mail in a browser (see scripts/sendTicketEmail.ts).
export function buildTicketEmail(data: TicketData, qrSrc: string) {
  const {
    booking,
    manualCode: rawCode,
    showtime,
    movie,
    cinema,
    hall,
    user,
  } = data;
  const manualCode = formatManualCode(rawCode);

  // Show the time the way the cinema's clock shows it, not the server's.
  const start = DateTime.fromJSDate(showtime.startTime).setZone(
    env.APP_TIMEZONE,
  );
  const date = start.toFormat("cccc, d LLLL yyyy");
  const time = start.toFormat("h:mm a");
  const seats = sortSeats(booking.seats.map((s) => s.seatId)).join(", ");
  const total = money(booking.totalAmount, booking.currency);
  const reference = bookingReference(booking._id);
  const ticketUrl = `${env.CLIENT_ORIGIN}/tickets/${booking._id.toString()}`;

  const subject = `Your tickets for ${movie.title} (${reference})`;

  // Every row of the details table. Values go through escapeHtml; labels are our own text.
  const rows: [string, string][] = [
    ["Cinema", `${cinema.name}, ${cinema.city}`],
    ["Hall", hall.name],
    ["Date", date],
    ["Time", time],
    ["Format", `${showtime.format} · ${showtime.language}`],
    ["Seats", seats],
    ["Total paid", total],
  ];
  const rowsHtml = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:14px;width:110px;vertical-align:top;">${label}</td>
          <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600;">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join("");

  // E-MAIL HTML IS NOT WEBSITE HTML. Many e-mail apps ignore <style> blocks, flexbox and grid.
  // So: layout with <table>, styles written inline on each element, and a safe font stack.
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;">
          <tr><td style="background:#111827;padding:18px 24px;color:#ffffff;font-size:18px;font-weight:700;">🎬 CineBook</td></tr>
          <tr><td style="padding:24px;">
            <p style="margin:0 0 4px;color:#6b7280;font-size:14px;">Hi ${escapeHtml(user.name)}, your booking is confirmed.</p>
            <h1 style="margin:0 0 16px;color:#111827;font-size:22px;">${escapeHtml(movie.title)}</h1>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}
            </table>
          </td></tr>
          <tr><td align="center" style="padding:0 24px 24px;">
            <img src="${qrSrc}" width="220" height="220" alt="Ticket QR code" style="display:block;border:1px solid #e5e7eb;border-radius:8px;">
            <p style="margin:12px 0 0;color:#111827;font-size:14px;">Booking reference <strong>${reference}</strong></p>
            <p style="margin:8px 0 4px;color:#6b7280;font-size:12px;">Show this QR code at the entrance. Don't share it: whoever is scanned first gets in.</p>
            <p style="margin:0 0 20px;color:#6b7280;font-size:12px;">If the QR code won't scan, tell the staff this code: <strong style="font-family:Consolas,monospace;font-size:14px;color:#111827;letter-spacing:1px;">${manualCode}</strong></p>
            <a href="${ticketUrl}" style="display:inline-block;background:#e11d48;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:8px;">View ticket online</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  // Plain-text twin. E-mail apps that can't (or won't) show HTML use it, and spam filters like
  // messages that include it.
  const text = [
    `Hi ${user.name}, your booking is confirmed.`,
    "",
    movie.title,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    `Booking reference: ${reference}`,
    `Backup code if the QR won't scan: ${manualCode}`,
    `Your ticket (with the QR code to show at the entrance): ${ticketUrl}`,
  ].join("\n");

  return { subject, html, text };
}

// Sends the ticket e-mail for one booking. Called by the queue worker (and by the
// email:test script). `force` is only for that script: it re-sends even if the mail already went out.
export async function sendTicketEmail(
  bookingId: Types.ObjectId,
  options: { force?: boolean } = {},
): Promise<"sent" | "skipped"> {
  const data = await loadTicketData(bookingId);
  if (!data) {
    logger.warn({ bookingId }, "Ticket e-mail skipped: booking not found");
    return "skipped";
  }
  const { booking, user } = data;

  // A job can run late or twice. Re-check the facts at the moment we actually send.
  if (booking.status !== "confirmed") return "skipped"; // e.g. cancelled while the job waited
  if (booking.ticketEmailSentAt && !options.force) return "skipped"; // already sent

  const id = booking._id.toString();
  const qr = await qrPngBuffer(createTicketToken(id));
  const { subject, html, text } = buildTicketEmail(data, `cid:${QR_CID}`);

  // HARD PART: Resend does NOT throw when sending fails. It RETURNS { data, error }. If we
  // ignored `error`, the worker would think everything worked and the e-mail would be lost
  // silently. So we convert it into a real exception, which makes BullMQ retry (or give up).
  const { error } = await resend.emails.send(
    {
      from: env.EMAIL_FROM,
      to: user.email,
      subject,
      html,
      text,
      attachments: [
        {
          filename: "ticket-qr.png",
          content: qr,
          contentType: "image/png",
          contentId: QR_CID, // marks it as inline and matches "cid:ticket-qr" in the HTML
        },
      ],
    },
    {
      // HARD PART: the idempotency key protects against "sent, but we crashed before we could
      // record it". The retry sends the SAME key, and Resend (for 24 hours) answers with the
      // original e-mail instead of sending a second copy. force adds a timestamp so a manual
      // re-send really sends.
      idempotencyKey: options.force
        ? `ticket-email-${id}-${Date.now()}`
        : `ticket-email-${id}`,
    },
  );
  if (error) throw new EmailSendError(error.message, isRetryable(error));

  await Booking.updateOne(
    { _id: booking._id },
    { $set: { ticketEmailSentAt: new Date() } },
  );
  logger.info({ bookingId: id }, "Ticket e-mail sent");
  return "sent";
}
