import { useState, type ReactNode } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Elements } from "@stripe/react-stripe-js";
import { fetchShowtimeDetail } from "../api/booking";
import { cancelCheckout, fetchCheckout, startCheckout } from "../api/checkout";
import { getErrorMessage } from "../api/errors";
import { btnSecondary } from "../components/admin/styles";
import HoldCountdown from "../components/HoldCountdown";
import PaymentForm from "../components/PaymentForm";
import { useServerNow } from "../hooks/useServerNow";
import { formatDayLabel, formatMoney, formatTime } from "../lib/dates";
import { stripePromise } from "../lib/stripe";
import type { CheckoutStatus } from "../types/checkout";

export default function CheckoutPage() {
  const { showtimeId = "" } = useParams();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  // When a payment method sends the customer to another site and back, Stripe returns them to
  // this page and we put the checkout id in the address ourselves (see PaymentForm).
  const returnedCheckoutId = search.get("checkout");

  const detail = useQuery({
    queryKey: ["showtime", showtimeId],
    queryFn: () => fetchShowtimeDetail(showtimeId),
  });

  // STEP 1: ask the server to turn my held seats into a payment. The server may answer the same
  // thing twice (React runs effects twice in development, people reload): it reuses an open checkout.
  // gcTime 0 + staleTime Infinity = ask exactly once per visit, never silently again in the background.
  const start = useQuery({
    queryKey: ["checkout-start", showtimeId],
    queryFn: () => startCheckout(showtimeId),
    enabled: !returnedCheckoutId,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const checkoutId = returnedCheckoutId ?? start.data?.checkoutId;
  const [paid, setPaid] = useState(false); // Stripe accepted my payment
  // "Waiting" = the money is on its way and we're waiting for our server to turn it into a booking.
  const waiting =
    !!returnedCheckoutId || paid || start.data?.state === "processing";

  // STEP 3: after paying, ask OUR server (not Stripe) every 1.5 s until the webhook has finished.
  const status = useQuery({
    queryKey: ["checkout", checkoutId],
    queryFn: () => fetchCheckout(checkoutId!),
    enabled: !!checkoutId && waiting,
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ? 1500 : false,
  });

  // The hold countdown (server clock, so a wrong computer clock doesn't matter).
  const payable = start.data?.state === "payable" ? start.data : null;
  const now = useServerNow(
    payable ? payable.serverTime - start.dataUpdatedAt : 0,
  );
  const expired = !!payable && now >= payable.holdExpiresAt;

  const [cancelError, setCancelError] = useState<string | null>(null);
  async function handleBack() {
    setCancelError(null);
    try {
      if (checkoutId) await cancelCheckout(checkoutId); // stops the payment on Stripe too
      navigate(`/showtimes/${showtimeId}`);
    } catch (err) {
      setCancelError(getErrorMessage(err)); // e.g. "already being processed"
    }
  }

  const backLink = (
    <Link to={`/showtimes/${showtimeId}`} className={btnSecondary}>
      Back to the seat map
    </Link>
  );

  // ---------------------------------- what to show ----------------------------------
  if (!returnedCheckoutId && start.isError)
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <p
          role="alert"
          className="mb-4 rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-300"
        >
          {getErrorMessage(start.error)}
        </p>
        {backLink}
      </main>
    );

  if (waiting)
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <PaymentOutcome status={status.data} backLink={backLink} />
      </main>
    );

  if (detail.isLoading || start.isLoading || !payable || !detail.data)
    return <p className="p-6 text-slate-400">Preparing your payment…</p>;

  const { movie, cinema, hall, showtime } = detail.data;
  const amountLabel = formatMoney(payable.amount);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-bold">Checkout</h1>
      <p className="text-sm text-slate-400">
        {movie.title} · {cinema.name} · {hall.name} ·{" "}
        {formatDayLabel(showtime.startTime)}, {formatTime(showtime.startTime)}
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-[320px_1fr]">
        <aside className="h-fit rounded-2xl bg-slate-900 p-4">
          <h2 className="mb-3 font-semibold">Your order</h2>
          <ul className="mb-3 space-y-1 text-sm">
            {payable.seats.map((s) => (
              <li key={s.seatId} className="flex justify-between">
                <span>
                  {s.seatId}{" "}
                  <span className="text-slate-500 capitalize">{s.type}</span>
                </span>
                <span>{formatMoney(s.price)}</span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between border-t border-slate-800 pt-3 font-semibold">
            <span>Total</span>
            <span>{amountLabel}</span>
          </p>
          <p className="mt-4 text-sm text-slate-400">
            Seats held for:{" "}
            <HoldCountdown expiresAt={payable.holdExpiresAt} now={now} />
          </p>
        </aside>

        <section className="rounded-2xl bg-slate-900 p-4">
          {expired ? (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-amber-800 bg-amber-950 px-3 py-2 text-sm text-amber-200"
            >
              Your hold ran out, so these seats may be taken. Go back and pick
              them again.
            </p>
          ) : null}

          {!stripePromise ? (
            <p className="text-sm text-red-400">
              Payments are not set up: add VITE_STRIPE_PUBLISHABLE_KEY to
              frontend/.env and restart.
            </p>
          ) : (
            // <Elements> gives every Stripe component below it access to Stripe.js and to THIS
            // payment (the clientSecret identifies it, and nothing else).
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: payable.clientSecret,
                appearance: { theme: "night" },
              }}
            >
              <PaymentForm
                checkoutId={payable.checkoutId}
                showtimeId={showtimeId}
                amountLabel={amountLabel}
                disabled={expired}
                onPaid={() => setPaid(true)}
              />
            </Elements>
          )}

          {cancelError && (
            <p role="alert" className="mt-3 text-sm text-red-400">
              {cancelError}
            </p>
          )}
          <button
            onClick={handleBack}
            className={`${btnSecondary} mt-4 w-full`}
          >
            ← Back to seats
          </button>
        </section>
      </div>
    </main>
  );
}

// What the customer sees after paying, while we wait for our server and then afterwards.
function PaymentOutcome({
  status,
  backLink,
}: {
  status: CheckoutStatus | undefined;
  backLink: ReactNode;
}) {
  if (!status || status.status === "pending")
    return (
      <div className="rounded-2xl bg-slate-900 p-6 text-center">
        <p className="text-lg font-semibold">Confirming your payment…</p>
        <p className="mt-2 text-sm text-slate-400">
          This usually takes a few seconds. Please don't close this page.
        </p>
      </div>
    );

  if (status.status === "completed")
    return (
      <div className="rounded-2xl bg-slate-900 p-6">
        <p className="text-xl font-bold text-emerald-400">
          Booking confirmed 🎉
        </p>
        {status.bookingId && (
          <p className="mt-1 text-sm text-slate-400">
            Reference:{" "}
            <span className="font-mono">
              {status.bookingId.slice(-8).toUpperCase()}
            </span>
          </p>
        )}
        <ul className="my-4 space-y-1 text-sm">
          {status.seats.map((s) => (
            <li key={s.seatId} className="flex justify-between">
              <span>Seat {s.seatId}</span>
              <span>{formatMoney(s.price)}</span>
            </li>
          ))}
        </ul>
        <p className="flex justify-between border-t border-slate-800 pt-3 font-semibold">
          <span>Paid</span>
          <span>{formatMoney(status.totalAmount)}</span>
        </p>
        <Link
          to="/"
          className="mt-5 inline-block text-emerald-400 hover:underline"
        >
          Back to movies
        </Link>
      </div>
    );

  if (status.status === "refunded")
    return (
      <div className="rounded-2xl bg-slate-900 p-6">
        <p className="text-xl font-bold text-amber-300">
          We couldn't complete your booking
        </p>
        <p className="mt-2 text-sm text-slate-300">
          {status.refundReason === "seats_unavailable"
            ? "Another customer's payment for one of these seats was confirmed just before yours."
            : "The amount charged didn't match your order."}{" "}
          You have not lost any money: your payment is being refunded in full.
          Banks can take several days to show it.
        </p>
        <div className="mt-4">{backLink}</div>
      </div>
    );

  return (
    <div className="rounded-2xl bg-slate-900 p-6">
      <p className="font-semibold">This payment was canceled.</p>
      <div className="mt-4">{backLink}</div>
    </div>
  );
}
