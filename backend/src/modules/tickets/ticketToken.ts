import crypto from "crypto";
import { env } from "../../config/env";

// WHAT IS IN THE QR CODE?  A "ticket token":   <bookingId>.<signature>
//
// The signature is an HMAC: a fingerprint that can only be produced by someone who knows
// TICKET_SECRET. The server is the only one who knows it, so nobody can invent a QR code for a
// booking that doesn't exist, or change the booking id inside a real one. (Changing a single
// character of the id makes the signature wrong.)
//
// Why not a JWT like the login token? A ticket needs no claims, no expiry and no decoding on the
// client. A plain HMAC is shorter (~68 characters vs ~175), and a shorter text makes a simpler,
// bigger-squared QR code that phone cameras scan faster.
//
// The token is DETERMINISTIC: the same booking always produces the same token. So we never store
// it in the database. The ticket page and the e-mail can both regenerate it whenever they need it.

// Mixed into the signed text ("domain separation"). It guarantees that a signature made for one
// purpose can never be mistaken for a signature made for another purpose with the same secret.
// The "v1" lets us change the format later without old and new tokens being confused.
const PREFIX = "ticket.v1:";

function sign(bookingId: string): string {
  return crypto
    .createHmac("sha256", env.TICKET_SECRET)
    .update(PREFIX + bookingId)
    .digest("base64url"); // URL/QR-safe letters only (no + / =)
}

export function createTicketToken(bookingId: string): string {
  return `${bookingId}.${sign(bookingId)}`;
}

// Returns the booking id if the token is genuine, otherwise null. It never throws, so the caller
// decides what to tell the person at the door.
export function readTicketToken(token: string): string | null {
  const parts = token.trim().split(".");
  if (parts.length !== 2) return null;
  const [bookingId, signature] = parts;
  if (!/^[a-f\d]{24}$/i.test(bookingId)) return null; // not even shaped like a Mongo id

  const expected = Buffer.from(sign(bookingId));
  const given = Buffer.from(signature);

  // HARD PART: why timingSafeEqual instead of `===`?
  // `===` stops comparing at the FIRST wrong character, so a wrong guess that is "more correct"
  // takes a few nanoseconds longer. An attacker measuring thousands of tries could, in theory,
  // discover the signature one character at a time. timingSafeEqual always takes the same time.
  // It throws if the two buffers differ in length, so we compare lengths first.
  if (
    expected.length !== given.length ||
    !crypto.timingSafeEqual(expected, given)
  ) {
    return null;
  }
  return bookingId;
}
