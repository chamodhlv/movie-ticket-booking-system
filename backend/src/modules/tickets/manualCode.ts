import crypto from "crypto";
import { Types } from "mongoose";
import { Booking } from "../booking/booking.model";

// THE BACKUP CODE. If a phone is cracked or a camera is dirty, staff type a short code instead of
// scanning. Unlike the booking reference (just the tail of the id, public), this code IS the way
// in, so it is random, not derived from anything.
//
// The alphabet leaves out the look-alikes I, L, O, 0 and 1, so nobody misreads a code read out
// loud or from a screen. 31 characters ^ 8 positions = about 850 billion possible codes: nobody
// can guess one, and the scan endpoint is only open to logged-in staff and is rate limited.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH = 8;

function generate(): string {
  let code = "";
  for (let i = 0; i < LENGTH; i++) {
    // randomInt is uniform. (`Math.random()` is predictable and `byte % 31` would make some
    // letters slightly more likely than others.)
    code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return code;
}

// A code nobody else has. The database's unique index is the real guarantee; checking first just
// means we practically never even hit it.
export async function createUniqueManualCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generate();
    if (!(await Booking.exists({ manualCode: code }))) return code;
  }
  throw new Error("Could not generate a unique manual code");
}

// "K7M29QXP" -> "K7M2-9QXP": easier to read aloud and to type.
export const formatManualCode = (code: string) =>
  `${code.slice(0, 4)}-${code.slice(4)}`;

// Whatever staff typed ("k7m2 9qxp", "K7M2-9QXP"...) -> "K7M29QXP", or null if it can't be a code.
export function normalizeManualCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return new RegExp(`^[${ALPHABET}]{${LENGTH}}$`).test(code) ? code : null;
}

// For a booking that has no code yet (made before this feature existed): give it one.
export async function ensureManualCode(
  bookingId: Types.ObjectId,
): Promise<string> {
  const code = await createUniqueManualCode();
  // The filter makes this atomic: it only writes if the booking STILL has no code. If two
  // requests race, one wins and the other falls through to read the winner's code below.
  const updated = await Booking.findOneAndUpdate(
    { _id: bookingId, manualCode: { $exists: false } },
    { $set: { manualCode: code } },
    { returnDocument: "after" },
  ).lean();
  if (updated?.manualCode) return updated.manualCode;

  const existing = await Booking.findById(bookingId)
    .select("manualCode")
    .lean();
  if (!existing?.manualCode)
    throw new Error(`Could not assign a code to ${bookingId}`);
  return existing.manualCode;
}
