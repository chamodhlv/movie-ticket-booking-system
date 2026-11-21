// Run with:  npm run test:holds --workspace backend      (needs Redis running: npm run infra:up)
//
// Proves the seat-hold rules against the REAL Redis. This is a plain script on purpose;
// in Part 13 we will turn these checks into proper automated tests.
import { Types } from "mongoose";
import { redis } from "../config/redis";
import { MAX_SEATS_PER_BOOKING } from "../modules/booking/booking.constants";
import {
  holdSeats,
  listHolds,
  releaseAllSeats,
  releaseSeats,
} from "../modules/booking/holds";

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  console.log(
    `${condition ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`,
  );
  if (!condition) failures++;
}
const newId = () => new Types.ObjectId().toString();

async function main() {
  // A fresh random showtime id, so this test never touches real data.
  const showtime = newId();

  // ---- 1. THE BIG ONE: 50 users grab the same seat at the same moment ----
  const users = Array.from({ length: 50 }, newId);
  const results = await Promise.all(
    users.map((u) => holdSeats(showtime, u, ["A1"])),
  );
  const winners = results.filter((r) => r.ok).length;
  check(
    "50 parallel holds of A1: exactly one wins",
    winners === 1,
    `(winners: ${winners})`,
  );
  const { holds } = await listHolds(showtime);
  check(
    "only one hold exists for A1",
    holds.length === 1 && holds[0].seatId === "A1",
  );

  // ---- 2. All or nothing ----
  const [x, y, z] = [newId(), newId(), newId()];
  await holdSeats(showtime, x, ["B1", "B2"]);
  const clash = await holdSeats(showtime, y, ["B2", "B3"]);
  check(
    "a hold that includes a taken seat fails and names it",
    !clash.ok && clash.reason === "taken" && clash.seatIds.join() === "B2",
  );
  const b3 = await holdSeats(showtime, z, ["B3"]);
  check("...and did NOT grab the free seat B3 (all or nothing)", b3.ok);

  // ---- 3. Max seats per user ----
  const m = newId();
  const nine = Array.from(
    { length: MAX_SEATS_PER_BOOKING + 1 },
    (_, i) => `C${i + 1}`,
  );
  const tooMany = await holdSeats(showtime, m, nine);
  check(
    `asking for ${nine.length} seats at once is refused`,
    !tooMany.ok && tooMany.reason === "too_many",
  );
  check(
    "...and nothing was held",
    (await listHolds(showtime)).holds.every((h) => h.userId !== m),
  );
  const eight = await holdSeats(
    showtime,
    m,
    nine.slice(0, MAX_SEATS_PER_BOOKING),
  );
  check(`holding exactly ${MAX_SEATS_PER_BOOKING} seats works`, eight.ok);
  const ninth = await holdSeats(showtime, m, [nine[MAX_SEATS_PER_BOOKING]]);
  check(
    "one more seat on top is refused",
    !ninth.ok && ninth.reason === "too_many",
  );
  const again = await holdSeats(showtime, m, nine.slice(0, 2));
  check("re-holding seats you already hold is fine", again.ok);

  // ---- 4. One shared deadline ----
  const d = newId();
  const first = await holdSeats(showtime, d, ["D1"]);
  await new Promise((r) => setTimeout(r, 300));
  const second = await holdSeats(showtime, d, ["D2"]);
  check(
    "a second seat gets the SAME deadline (no extending by clicking)",
    first.ok && second.ok && first.expiresAt === second.expiresAt,
  );

  // ---- 5. Releasing ----
  const e = newId();
  await holdSeats(showtime, e, ["E1"]);
  const stolen = await releaseSeats(showtime, newId(), ["E1"]);
  check("another user can't release my seat", stolen.length === 0);
  const mine = await releaseSeats(showtime, e, ["E1"]);
  check("I can release my own seat", mine.join() === "E1");
  const retake = await holdSeats(showtime, newId(), ["E1"]);
  check("a released seat can be held by someone else", retake.ok);
  const all = await releaseAllSeats(showtime, m);
  check(
    "release-all frees every seat of the user",
    all.length === MAX_SEATS_PER_BOOKING,
  );

  // ---- 6. Expiry (we fake time passing by moving a deadline into the past) ----
  const f = newId();
  await holdSeats(showtime, f, ["F1"]);
  await redis.zadd(`holds:{${showtime}}`, Date.now() - 1000, "F1");
  const afterExpiry = await holdSeats(showtime, newId(), ["F1"]);
  check("an expired hold no longer blocks the seat", afterExpiry.ok);

  // ---- 7. The listing shows real expiry times ----
  const listing = await listHolds(showtime);
  const a1 = listing.holds.find((h) => h.seatId === "A1");
  check(
    "listing returns a future expiry for live holds",
    !!a1 && a1.expiresAt > listing.now,
  );

  // ---- clean up the keys this test created ----
  const keys = await redis.keys(`*{${showtime}}*`);
  if (keys.length) await redis.del(...keys);

  console.log(
    failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    failures++;
  })
  .finally(async () => {
    await redis.quit();
    process.exit(failures === 0 ? 0 : 1);
  });
