import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { verifyAccessToken } from "../modules/auth/tokens";

// =============================================================================
// LIVE UPDATES (Socket.IO)
//
// HTTP is "the browser asks, the server answers". For a seat map that is not enough:
// when someone else grabs seat A5, YOUR screen must change without you reloading.
// Socket.IO keeps a connection open so the SERVER can push events to browsers.
//
// ROOMS: every showtime has a room named "showtime:<id>". A browser that opens the seat
// map joins that room, and an event sent to the room reaches exactly those browsers.
//
// EVENTS (server -> browser), all with { showtimeId, seatIds } plus:
//   seat:held      someone started a hold          (+ expiresAt, ms since 1970)
//   seat:released  a hold ended (clicked away, or released)
//   seat:booked    seats were sold (sent by the payment code in Part 9)
// =============================================================================

let io: Server | null = null;

const roomOf = (showtimeId: string) => `showtime:${showtimeId}`;
const OBJECT_ID = /^[a-f\d]{24}$/i;
const MAX_ROOMS_PER_SOCKET = 5; // nobody needs to watch hundreds of showtimes

// A cookie header looks like "a=1; accessToken=eyJ...; b=2". We only need one value.
function readCookie(header: string | undefined, name: string) {
  for (const part of (header ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function initSocket(server: HttpServer) {
  io = new Server(server, {
    // Same rule as the REST API: only our frontend may connect, and it may send cookies.
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
  });

  // Runs once per connection ("handshake"). The browser sends our login cookie, exactly like
  // it does for fetch/axios. A valid token tells us WHO is connected (used for private
  // per-user messages in Part 9). Visitors without a login may still connect and watch seats:
  // seat availability is public, just like GET /api/showtimes/:id/seats.
  // Limitation: the token is checked only now. If it expires later, the socket stays
  // connected, which is fine because Part 8 sends nothing private through it.
  io.use((socket, next) => {
    const token = readCookie(socket.handshake.headers.cookie, "accessToken");
    if (token) {
      try {
        socket.data.userId = verifyAccessToken(token).id;
      } catch {
        // expired / invalid: connect as a visitor
      }
    }
    next();
  });

  io.on("connection", (socket) => {
    socket.on("showtime:join", (showtimeId: unknown) => {
      if (typeof showtimeId !== "string" || !OBJECT_ID.test(showtimeId)) return;
      // Every socket is automatically in a room named after its own id, hence the +1.
      if (socket.rooms.size >= MAX_ROOMS_PER_SOCKET + 1) return;
      void socket.join(roomOf(showtimeId));
    });
    socket.on("showtime:leave", (showtimeId: unknown) => {
      if (typeof showtimeId !== "string") return;
      void socket.leave(roomOf(showtimeId));
    });
  });

  logger.info("Socket.IO ready");
  return io;
}

// Close all connections AND the HTTP server (used by graceful shutdown).
export function closeSocket(done: () => void) {
  if (!io) return done();
  void io.close(done);
}

// ---- emit helpers: no-ops when sockets aren't running (scripts, tests) ----

export function emitSeatsHeld(
  showtimeId: string,
  seatIds: string[],
  expiresAt: number,
) {
  io?.to(roomOf(showtimeId)).emit("seat:held", {
    showtimeId,
    seatIds,
    expiresAt,
  });
}

export function emitSeatsReleased(showtimeId: string, seatIds: string[]) {
  io?.to(roomOf(showtimeId)).emit("seat:released", { showtimeId, seatIds });
}

// Called by the payment code in Part 9 once seats are sold.
export function emitSeatsBooked(showtimeId: string, seatIds: string[]) {
  io?.to(roomOf(showtimeId)).emit("seat:booked", { showtimeId, seatIds });
}
