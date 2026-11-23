import { redis } from "../../config/redis";
import {
  CHECKOUT_MIN_HOLD_MS,
  HOLD_TTL_MS,
  MAX_SEATS_PER_BOOKING,
} from "./booking.constants";

// =============================================================================
// SEAT HOLDS IN REDIS
//
// A "hold" means: "this seat is reserved for user U until time T, while U chooses and
// pays". Holds are temporary, change constantly, and must be checked-and-set ATOMICALLY,
// which is exactly what Redis + Lua scripts are good at.
//
// WHY LUA? Holding 3 seats needs several steps: check A1, check A2, check A3, then set
// them all. Done from Node as separate commands, two users could interleave:
//     user X checks A2 -> free      user Y checks A2 -> free
//     user X sets A2                user Y sets A2     (both think they own it!)
// Redis runs a Lua script as ONE uninterrupted unit: no other command runs in the middle.
// So "check everything, then take everything (or nothing)" can't be raced.
//
// DATA PER SHOWTIME S (all keys carry {S} in braces: a Redis Cluster "hash tag" that
// keeps them on the same server if we ever scale out):
//   holds:{S}           SORTED SET  member = seatId, score = deadline (ms since 1970)
//   holdowner:{S}       HASH        seatId -> userId of the holder
//   holduser:{S}:U      SET         the seatIds user U holds (expires at U's deadline)
//
// SHARED DEADLINE: all of one user's holds on a showtime expire at the same moment (the
// deadline set by their FIRST seat). Clicking more seats does not add time, so nobody can
// keep seats forever by clicking around. The countdown has just one number.
//
// EXPIRY IS CHECKED BY THE SCRIPT, with Redis's own clock (TIME), not Node's. Every script
// first deletes holds whose deadline has passed ("sweep"). Using one clock (Redis) avoids
// trouble if several Node servers have slightly different times.
// =============================================================================

const zsetKey = (showtimeId: string) => `holds:{${showtimeId}}`;
const ownersKey = (showtimeId: string) => `holdowner:{${showtimeId}}`;
const userKey = (showtimeId: string, userId: string) =>
  `holduser:{${showtimeId}}:${userId}`;

// Lua code shared by all scripts: read the clock and sweep expired holds.
const LUA_PRELUDE = `
local function nowMs()
  local t = redis.call('TIME')              -- { seconds, microseconds }
  return t[1] * 1000 + math.floor(t[2] / 1000)
end

-- A hold is valid while deadline > now. Remove the others from the sorted set and the hash.
local function sweep(zset, owners, now)
  local expired = redis.call('ZRANGEBYSCORE', zset, '-inf', now)
  if #expired > 0 then
    redis.call('ZREM', zset, unpack(expired))
    redis.call('HDEL', owners, unpack(expired))
  end
end
`;

// KEYS[1] = holds zset, KEYS[2] = owners hash, KEYS[3] = this user's seat set
// ARGV[1] = userId, ARGV[2] = hold length in ms, ARGV[3] = max seats, ARGV[4...] = seatIds
// Returns { code, deadline, seatIdsList, newlyHeldList }
//   code 0 = success: deadline = when the holds expire, list 1 = ALL seats the user holds now,
//                     list 2 = the seats that were newly held by this call
//   code 1 = some seat is held by someone else: list 1 = those seats, NOTHING was held
//   code 2 = would exceed the max seats per user: NOTHING was held
const HOLD_LUA = `${LUA_PRELUDE}
local zset, owners, userSeats = KEYS[1], KEYS[2], KEYS[3]
local userId = ARGV[1]
local ttlMs = tonumber(ARGV[2])
local maxSeats = tonumber(ARGV[3])
local now = nowMs()
sweep(zset, owners, now)

-- PASS 1: look only. Which seats are taken by others, and which are new for this user?
local taken, fresh = {}, {}
for i = 4, #ARGV do
  local owner = redis.call('HGET', owners, ARGV[i])   -- a missing field comes back as false
  if not owner then
    fresh[#fresh + 1] = ARGV[i]
  elseif owner ~= userId then
    taken[#taken + 1] = ARGV[i]
  end
end
if #taken > 0 then return { 1, 0, taken, {} } end
if redis.call('SCARD', userSeats) + #fresh > maxSeats then return { 2, 0, {}, {} } end

-- The deadline: reuse the one this user already has, or start a new countdown.
local deadline = 0
local mine = redis.call('SMEMBERS', userSeats)
if #mine > 0 then
  local score = redis.call('ZSCORE', zset, mine[1])
  if score then deadline = tonumber(score) end
end
if deadline <= now then deadline = now + ttlMs end

-- PASS 2: write. Nothing above returned early, so every requested seat is ours.
for _, seatId in ipairs(fresh) do
  redis.call('ZADD', zset, deadline, seatId)
  redis.call('HSET', owners, seatId, userId)
  redis.call('SADD', userSeats, seatId)
end

-- Let Redis clean up by itself: the user's set dies exactly at their deadline, and the
-- shared keys live at least until the LATEST deadline of any holder.
redis.call('PEXPIREAT', userSeats, deadline)
local remaining = deadline - now
if redis.call('PTTL', zset) < remaining then
  redis.call('PEXPIRE', zset, remaining)
  redis.call('PEXPIRE', owners, remaining)
end

return { 0, deadline, redis.call('SMEMBERS', userSeats), fresh }
`;

// Same KEYS. ARGV[1] = userId, ARGV[2...] = seatIds to give up.
// Returns the seats that were actually released. A seat held by someone else (or not held)
// is silently skipped, so a user can never free another person's seat.
const RELEASE_LUA = `${LUA_PRELUDE}
local zset, owners, userSeats = KEYS[1], KEYS[2], KEYS[3]
local userId = ARGV[1]
sweep(zset, owners, nowMs())

local released = {}
for i = 2, #ARGV do
  if redis.call('HGET', owners, ARGV[i]) == userId then
    redis.call('HDEL', owners, ARGV[i])
    redis.call('ZREM', zset, ARGV[i])
    redis.call('SREM', userSeats, ARGV[i])
    released[#released + 1] = ARGV[i]
  end
end
return released
`;

// KEYS[1] = holds zset, KEYS[2] = owners hash
// Returns { now, { seatId, ownerId, deadline, seatId, ownerId, deadline, ... } }
const LIST_LUA = `${LUA_PRELUDE}
local zset, owners = KEYS[1], KEYS[2]
local now = nowMs()
sweep(zset, owners, now)

local entries = redis.call('ZRANGE', zset, 0, -1, 'WITHSCORES')  -- seatId, score, seatId, score ...
local out = {}
for i = 1, #entries, 2 do
  out[#out + 1] = entries[i]
  out[#out + 1] = redis.call('HGET', owners, entries[i]) or ''
  out[#out + 1] = entries[i + 1]
end
return { now, out }
`;

// ONE-TIME EXTENSION for checkout. When a user clicks "Continue to payment" they may have only
// seconds left on their hold, which isn't enough to type a card number. This gives them at
// least `minRemaining` ms, but ONLY ONCE per hold (a "grace" flag remembers it), otherwise
// someone could keep seats forever by pressing Continue / Back over and over.
// KEYS[1] = holds zset, KEYS[2] = owners hash, KEYS[3] = this user's seat set, KEYS[4] = grace flag
// ARGV[1] = minimum remaining ms
// Returns { deadline, now, seatIdsList }. deadline is 0 (and the list empty) if the user holds nothing.
const PREPARE_CHECKOUT_LUA = `${LUA_PRELUDE}
local zset, owners, userSeats, graceKey = KEYS[1], KEYS[2], KEYS[3], KEYS[4]
local now = nowMs()
sweep(zset, owners, now)

local mine = redis.call('SMEMBERS', userSeats)
if #mine == 0 then return { 0, now, {} } end

local score = redis.call('ZSCORE', zset, mine[1])
local deadline = 0
if score then deadline = tonumber(score) end

local wanted = now + tonumber(ARGV[1])
if deadline < wanted and redis.call('EXISTS', graceKey) == 0 then
  deadline = wanted
  for _, seatId in ipairs(mine) do
    redis.call('ZADD', zset, deadline, seatId)   -- same seats, later deadline
  end
  redis.call('PEXPIREAT', userSeats, deadline)
  redis.call('SET', graceKey, '1', 'PXAT', deadline)
  local remaining = deadline - now
  if redis.call('PTTL', zset) < remaining then
    redis.call('PEXPIRE', zset, remaining)
    redis.call('PEXPIRE', owners, remaining)
  end
end
return { deadline, now, mine }
`;

// defineCommand registers each script with ioredis. It sends the script's hash (EVALSHA)
// instead of the whole text on every call, and re-sends the text automatically if Redis
// forgot it (e.g. after a restart). We type the new methods ourselves below.
redis.defineCommand("holdSeatsLua", { numberOfKeys: 3, lua: HOLD_LUA });
redis.defineCommand("releaseSeatsLua", { numberOfKeys: 3, lua: RELEASE_LUA });
redis.defineCommand("listHoldsLua", { numberOfKeys: 2, lua: LIST_LUA });
redis.defineCommand("prepareCheckoutLua", {
  numberOfKeys: 4,
  lua: PREPARE_CHECKOUT_LUA,
});

type ScriptArg = string | number;
type ScriptCommands = {
  holdSeatsLua(
    ...args: ScriptArg[]
  ): Promise<[number, number, string[], string[]]>;
  releaseSeatsLua(...args: ScriptArg[]): Promise<string[]>;
  listHoldsLua(...args: ScriptArg[]): Promise<[number, string[]]>;
  prepareCheckoutLua(...args: ScriptArg[]): Promise<[number, number, string[]]>;
};
const scripts = redis as unknown as ScriptCommands;

// ------------------------------ the public functions ------------------------------

export type HoldResult =
  | { ok: true; expiresAt: number; mySeatIds: string[]; newSeatIds: string[] }
  | { ok: false; reason: "taken"; seatIds: string[] }
  | { ok: false; reason: "too_many" };

// Hold ALL of `seatIds` for the user, or NONE. The caller must already have checked that the
// seats exist in the hall and are not sold (Mongo). Redis only knows about holds.
export async function holdSeats(
  showtimeId: string,
  userId: string,
  seatIds: string[],
): Promise<HoldResult> {
  const [code, deadline, list, fresh] = await scripts.holdSeatsLua(
    zsetKey(showtimeId),
    ownersKey(showtimeId),
    userKey(showtimeId, userId),
    userId,
    HOLD_TTL_MS,
    MAX_SEATS_PER_BOOKING,
    ...seatIds,
  );
  if (code === 1) return { ok: false, reason: "taken", seatIds: list };
  if (code === 2) return { ok: false, reason: "too_many" };
  return { ok: true, expiresAt: deadline, mySeatIds: list, newSeatIds: fresh };
}

// Give up the listed seats (only the ones this user really holds). Returns the released ones.
export async function releaseSeats(
  showtimeId: string,
  userId: string,
  seatIds: string[],
): Promise<string[]> {
  if (seatIds.length === 0) return [];
  return scripts.releaseSeatsLua(
    zsetKey(showtimeId),
    ownersKey(showtimeId),
    userKey(showtimeId, userId),
    userId,
    ...seatIds,
  );
}

// Give up everything this user holds on the showtime.
export async function releaseAllSeats(
  showtimeId: string,
  userId: string,
): Promise<string[]> {
  const mine = await redis.smembers(userKey(showtimeId, userId));
  return releaseSeats(showtimeId, userId, mine);
}

export type ActiveHold = { seatId: string; userId: string; expiresAt: number };

// Every live hold on a showtime, plus Redis's clock (the client uses it to fix its own
// clock error when counting down).
export async function listHolds(
  showtimeId: string,
): Promise<{ now: number; holds: ActiveHold[] }> {
  const [now, flat] = await scripts.listHoldsLua(
    zsetKey(showtimeId),
    ownersKey(showtimeId),
  );
  const holds: ActiveHold[] = [];
  for (let i = 0; i < flat.length; i += 3) {
    holds.push({
      seatId: flat[i],
      userId: flat[i + 1],
      expiresAt: Number(flat[i + 2]),
    });
  }
  return { now, holds };
}

// The user clicked "Continue to payment": return the seats they hold right now, with a deadline
// that leaves time to pay (extended once, see above). Empty `seatIds` = they hold nothing.
export async function prepareCheckoutHolds(
  showtimeId: string,
  userId: string,
): Promise<{ seatIds: string[]; deadline: number; now: number }> {
  const [deadline, now, seatIds] = await scripts.prepareCheckoutLua(
    zsetKey(showtimeId),
    ownersKey(showtimeId),
    userKey(showtimeId, userId),
    `holdgrace:{${showtimeId}}:${userId}`,
    CHECKOUT_MIN_HOLD_MS,
  );
  return { seatIds, deadline, now };
}
