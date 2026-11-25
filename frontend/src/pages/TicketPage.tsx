import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { fetchTicket } from "../api/tickets";
import { getErrorMessage } from "../api/errors";
import { btnSecondary } from "../components/admin/styles";
import { formatLongDate, formatMoney, formatTime } from "../lib/dates";
import type { TicketResponse } from "../types/ticket";

// The colored strip at the top: can this ticket get you in right now?
function StatusBanner({ data }: { data: TicketResponse }) {
  const { booking, showtime } = data;

  let tone = "border-emerald-800 bg-emerald-950 text-emerald-300";
  let text = "Valid ticket. Show the QR code at the entrance.";

  if (booking.status === "used") {
    tone = "border-amber-800 bg-amber-950 text-amber-200";
    text = booking.usedAt
      ? `This ticket was already used on ${formatLongDate(booking.usedAt)} at ${formatTime(booking.usedAt)}.`
      : "This ticket was already used.";
  } else if (booking.status === "cancelled") {
    tone = "border-red-800 bg-red-950 text-red-300";
    text = "This booking was cancelled.";
  } else if (showtime.status === "cancelled") {
    // Paid and not yet refunded, but the cinema called the show off.
    tone = "border-red-800 bg-red-950 text-red-300";
    text = "This showing was cancelled by the cinema.";
  }

  return (
    <p role="status" className={`rounded-lg border px-3 py-2 text-sm ${tone}`}>
      {text}
    </p>
  );
}

// One label + value pair of the details grid.
function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}

export default function TicketPage() {
  const { bookingId = "" } = useParams();

  const query = useQuery({
    queryKey: ["ticket", bookingId],
    queryFn: () => fetchTicket(bookingId),
    retry: false, // a 404 ("not your ticket") won't get better by asking again
    // While the ticket is still valid, quietly re-check every 20 s. When staff scan it, this
    // page then flips to "already used" by itself, which also tells the customer it worked.
    refetchInterval: (q) =>
      q.state.data?.booking.status === "confirmed" ? 20_000 : false,
  });

  if (query.isLoading)
    return <p className="p-6 text-slate-400">Loading your ticket…</p>;

  if (query.isError || !query.data)
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <p
          role="alert"
          className="mb-4 rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-300"
        >
          {getErrorMessage(query.error)}
        </p>
        <Link to="/" className={btnSecondary}>
          Back to movies
        </Link>
      </main>
    );

  const data = query.data;
  const { booking, showtime, movie, cinema, hall, ticket } = data;
  // "A9" before "A10": numeric compare, same idea as the e-mail.
  const seats = booking.seats
    .map((s) => s.seatId)
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/" className="text-sm text-slate-400 hover:text-emerald-400">
        ← Back to movies
      </Link>

      <div className="mt-3">
        <StatusBanner data={data} />
      </div>

      {/* The ticket: details on the left, QR on the right. On a phone they stack, and the dashed
          line (a "tear-off" edge) switches from horizontal to vertical. */}
      <article className="mt-4 overflow-hidden rounded-2xl bg-slate-900 md:flex">
        <div className="flex-1 p-6">
          <h1 className="text-2xl font-bold">{movie.title}</h1>
          <p className="text-sm text-slate-400">
            {movie.certificate} · {movie.durationMinutes} min ·{" "}
            {showtime.format} · {showtime.language}
          </p>

          <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
            <Detail label="Date">{formatLongDate(showtime.startTime)}</Detail>
            <Detail label="Time">{formatTime(showtime.startTime)}</Detail>
            <Detail label="Cinema">
              {cinema.name}
              <span className="block text-xs font-normal text-slate-400">
                {cinema.address}, {cinema.city}
              </span>
            </Detail>
            <Detail label="Hall">{hall.name}</Detail>
            <Detail label="Seats">{seats.join(", ")}</Detail>
            <Detail label="Total paid">
              {formatMoney(booking.totalAmount)}
            </Detail>
          </dl>
        </div>

        <div className="flex flex-col items-center justify-center border-t border-dashed border-slate-700 p-6 md:w-72 md:border-l md:border-t-0">
          {ticket ? (
            // The QR code is a data: URL, so it is part of the page: no extra request, and it
            // still shows if the network drops right when you arrive at the cinema.
            <img
              src={ticket.qrDataUrl}
              alt="Ticket QR code"
              className="h-56 w-56 rounded-lg bg-white p-1"
            />
          ) : (
            <p className="py-10 text-center text-sm text-slate-500">
              No QR code for this ticket.
            </p>
          )}
          <p className="mt-3 text-xs text-slate-500">Booking reference</p>
          <p className="font-mono text-lg font-semibold tracking-wider">
            {booking.reference}
          </p>
        </div>
      </article>

      {ticket && (
        <p className="mt-4 text-xs text-slate-500">
          Don't share this QR code or post it online: whoever is scanned first
          gets in.
        </p>
      )}
    </main>
  );
}
