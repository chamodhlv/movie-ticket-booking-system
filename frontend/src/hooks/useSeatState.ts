import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSeatAvailability } from "../api/booking";
import { socket } from "../lib/socket";
import {
  applyBooked,
  applyOthersHeld,
  applyOthersReleased,
  toSeatState,
  type SeatState,
} from "../lib/seatState";
import type { SeatHeldEvent, SeatsEvent } from "../types/booking";

export const seatsKey = (showtimeId: string) => ["seats", showtimeId] as const;

// Loads the seat availability AND keeps it live through the socket while the page is open.
export function useSeatState(showtimeId: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: seatsKey(showtimeId),
    queryFn: async () => toSeatState(await fetchSeatAvailability(showtimeId)),
    // Safety net: events can occasionally be missed (a sleeping laptop, a flaky network),
    // so also re-read the truth every 30 seconds.
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const key = seatsKey(showtimeId);
    const patch = (fn: (s: SeatState) => SeatState) =>
      queryClient.setQueryData<SeatState>(key, (old) => (old ? fn(old) : old));

    // Join the showtime's room, THEN re-read the seats. In this order nothing can slip
    // through the gap: whatever happened before we joined is in the fetched data, and
    // whatever happens after arrives as an event. This also runs after every automatic
    // reconnect, which repairs anything we missed while offline.
    const onConnect = () => {
      socket.emit("showtime:join", showtimeId);
      void queryClient.invalidateQueries({ queryKey: key });
    };
    const onHeld = (e: SeatHeldEvent) => {
      if (e.showtimeId === showtimeId)
        patch((s) => applyOthersHeld(s, e.seatIds, e.expiresAt));
    };
    const onReleased = (e: SeatsEvent) => {
      if (e.showtimeId === showtimeId)
        patch((s) => applyOthersReleased(s, e.seatIds));
    };
    const onBooked = (e: SeatsEvent) => {
      if (e.showtimeId === showtimeId) patch((s) => applyBooked(s, e.seatIds));
    };

    socket.on("connect", onConnect);
    socket.on("seat:held", onHeld);
    socket.on("seat:released", onReleased);
    socket.on("seat:booked", onBooked);
    socket.connect();
    if (socket.connected) onConnect(); // already connected from an earlier visit

    return () => {
      socket.off("connect", onConnect);
      socket.off("seat:held", onHeld);
      socket.off("seat:released", onReleased);
      socket.off("seat:booked", onBooked);
      socket.emit("showtime:leave", showtimeId);
      socket.disconnect();
    };
  }, [showtimeId, queryClient]);

  return query;
}
