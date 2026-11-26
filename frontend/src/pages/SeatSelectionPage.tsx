import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchShowtimeDetail, holdSeats, releaseSeats } from "../api/booking";
import { getErrorMessage } from "../api/errors";
import { useAuth } from "../auth/auth-context";
import HoldCountdown from "../components/HoldCountdown";
import SeatMap from "../components/SeatMap";
import { btnSecondary } from "../components/admin/styles";
import { seatsKey, useSeatState } from "../hooks/useSeatState";
import { useServerNow } from "../hooks/useServerNow";
import { formatDayLabel, formatMoney, formatTime } from "../lib/dates";
import {
  MAX_SEATS_PER_BOOKING,
  applyMyHold,
  applyMyRelease,
  buildStatusMap,
  mySeatIds,
  myExpiresAt,
  type SeatState,
} from "../lib/seatState";

type Message = { kind: "error" | "info"; text: string };

export default function SeatSelectionPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Two separate pieces of data: WHAT the show is (rarely changes) and WHO HAS WHICH SEAT
  // (changes all the time, kept live through the socket).
  const detail = useQuery({
    queryKey: ["showtime", id],
    queryFn: () => fetchShowtimeDetail(id),
  });
  const seats = useSeatState(id);
  const state = seats.data;

  const now = useServerNow(state?.clockOffset ?? 0); // server time, ticks every second
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<Message | null>(null);

  const statuses = useMemo(
    () => (state ? buildStatusMap(state, now) : new Map()),
    [state, now],
  );

  // seatId -> { type } from the hall layout, to price the seats I picked.
  const seatInfo = useMemo(() => {
    const map = new Map<
      string,
      { type: "standard" | "premium" | "vip" | "wheelchair"; number: number }
    >();
    for (const row of detail.data?.hall.seatLayout.rows ?? [])
      for (const s of row.seats)
        map.set(s.id, { type: s.type, number: s.number });
    return map;
  }, [detail.data]);

  // WHEN MY HOLD RUNS OUT. The server already freed my seats at the deadline; this timer fires
  // right after it, tells the user, and re-reads the truth. Scheduling ONE timer at the exact
  // deadline is cheaper than checking on every tick. (+300 ms so the server has surely expired it.)
  const expiresAt = state ? myExpiresAt(state) : null;
  const clockOffset = state?.clockOffset ?? 0;
  useEffect(() => {
    if (expiresAt === null) return;
    const delay = Math.max(expiresAt - (Date.now() + clockOffset), 0) + 300;
    const timer = setTimeout(() => {
      setMessage({
        kind: "info",
        text: "Your hold ran out, so your seats were released. Pick them again if they're still free.",
      });
      void queryClient.invalidateQueries({ queryKey: seatsKey(id) });
    }, delay);
    return () => clearTimeout(timer);
  }, [expiresAt, clockOffset, id, queryClient]);

  if (detail.isLoading || seats.isLoading)
    return <p className="p-6 text-slate-400">Loading seats…</p>;
  if (detail.isError || !detail.data)
    return <p className="p-6 text-red-400">Couldn't load this showtime.</p>;
  if (seats.isError || !state)
    return <p className="p-6 text-red-400">Couldn't load the seat map.</p>;

  const { showtime, movie, cinema, hall } = detail.data;
  const mine = mySeatIds(state, now);
  const holdUntil = mine.length ? myExpiresAt(state) : null;
  const total = mine.reduce(
    (sum, seatId) =>
      sum + (showtime.prices[seatInfo.get(seatId)?.type ?? "standard"] ?? 0),
    0,
  );

  // Can't pick seats for a show that is cancelled or already started (the server checks too).
  const closedReason =
    showtime.status === "cancelled"
      ? "This showtime was cancelled."
      : new Date(showtime.startTime).getTime() <= now
        ? "This showtime has already started."
        : null;

  const setSeatState = (fn: (s: SeatState) => SeatState) =>
    queryClient.setQueryData<SeatState>(seatsKey(id), (old) =>
      old ? fn(old) : old,
    );
  const markPending = (seatId: string, on: boolean) =>
    setPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(seatId);
      else next.delete(seatId);
      return next;
    });

  // ONE CLICK = ONE REQUEST. An available seat is held, my own seat is released.
  // We do not change the screen first and hope: we wait for the server's answer and then apply it.
  // If another person won the race, the server says 409 and we show its message.
  async function handleSeatClick(seatId: string) {
    if (!user) {
      // Visitors may look but not hold. After login the user comes back to this page.
      navigate("/login", { state: { from: location } });
      return;
    }
    const status = statuses.get(seatId) ?? "available";
    if (status !== "available" && status !== "mine") return;
    if (status === "available" && mine.length >= MAX_SEATS_PER_BOOKING) {
      setMessage({
        kind: "error",
        text: `You can hold at most ${MAX_SEATS_PER_BOOKING} seats.`,
      });
      return;
    }

    setMessage(null);
    markPending(seatId, true);
    try {
      if (status === "available") {
        const res = await holdSeats(id, [seatId]);
        setSeatState((s) => applyMyHold(s, res.seatIds, res.expiresAt));
      } else {
        const released = await releaseSeats(id, [seatId]);
        setSeatState((s) => applyMyRelease(s, released));
      }
    } catch (err) {
      setMessage({ kind: "error", text: getErrorMessage(err) });
      // Our picture of the seats was wrong; fetch the real one.
      void queryClient.invalidateQueries({ queryKey: seatsKey(id) });
    } finally {
      markPending(seatId, false);
    }
  }

  async function handleReleaseAll() {
    setMessage(null);
    try {
      const released = await releaseSeats(id); // no ids = everything I hold
      setSeatState((s) => applyMyRelease(s, released));
    } catch (err) {
      setMessage({ kind: "error", text: getErrorMessage(err) });
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <Link
        to={`/movies/${movie._id}`}
        className="text-sm text-slate-400 hover:text-emerald-400"
      >
        ← {movie.title}
      </Link>
      <h1 className="mt-1 text-2xl font-bold">{movie.title}</h1>
      <p className="text-sm text-slate-400">
        {cinema.name} · {hall.name} · {formatDayLabel(showtime.startTime)},{" "}
        {formatTime(showtime.startTime)} · {showtime.format} ·{" "}
        {showtime.language}
      </p>

      {!user && (
        <p className="mt-4 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300">
          You're browsing as a visitor.{" "}
          <Link
            to="/login"
            state={{ from: location }}
            className="text-emerald-400 hover:underline"
          >
            Log in
          </Link>{" "}
          to pick seats.
        </p>
      )}
      {closedReason && (
        <p className="mt-4 rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-300">
          {closedReason}
        </p>
      )}
      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
            message.kind === "error"
              ? "border-red-800 bg-red-950 text-red-300"
              : "border-amber-800 bg-amber-950 text-amber-200"
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="rounded-2xl bg-slate-900 p-4">
          <SeatMap
            layout={hall.seatLayout}
            statuses={statuses}
            pending={pending}
            prices={showtime.prices}
            disabled={!!closedReason}
            onSeatClick={handleSeatClick}
          />
        </div>

        {/* Summary: sticks to the screen while you scroll a tall seat map */}
        <aside className="h-fit rounded-2xl bg-slate-900 p-4 lg:sticky lg:top-4">
          <h2 className="mb-3 font-semibold">Your seats</h2>

          {mine.length === 0 ? (
            <p className="text-sm text-slate-400">
              Click a seat to hold it. You can hold up to{" "}
              {MAX_SEATS_PER_BOOKING}.
            </p>
          ) : (
            <>
              {holdUntil !== null && (
                <p className="mb-3 text-sm text-slate-400">
                  Held for you:{" "}
                  <HoldCountdown expiresAt={holdUntil} now={now} />
                </p>
              )}
              <ul className="mb-3 space-y-1 text-sm">
                {mine.map((seatId) => {
                  const type = seatInfo.get(seatId)?.type ?? "standard";
                  return (
                    <li key={seatId} className="flex justify-between">
                      <span>
                        {seatId}{" "}
                        <span className="text-slate-500 capitalize">
                          {type}
                        </span>
                      </span>
                      <span>{formatMoney(showtime.prices[type] ?? 0)}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="mb-1 flex justify-between border-t border-slate-800 pt-3 font-semibold">
                <span>Total</span>
                <span>{formatMoney(total)}</span>
              </p>
              <p className="mb-4 text-xs text-slate-500">
                {mine.length} / {MAX_SEATS_PER_BOOKING} seats. The final price
                is calculated again on the server at checkout.
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => navigate(`/checkout/${id}`)}
                  disabled={!!closedReason}
                  className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
                >
                  Continue to payment
                </button>
                <button
                  onClick={handleReleaseAll}
                  className={`${btnSecondary} w-full`}
                >
                  Release all seats
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
