import { useState, type FormEvent } from "react";
import {
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

type Props = {
  checkoutId: string;
  showtimeId: string;
  amountLabel: string; // e.g. "LKR 2,500.00", shown on the button
  disabled: boolean; // e.g. the hold ran out
  onPaid: () => void; // Stripe accepted the payment: now wait for our server to confirm it
};

// Must be rendered INSIDE <Elements> (CheckoutPage does that). <PaymentElement /> draws the whole
// card form, but Stripe renders it in an iframe: the card number goes from the customer straight to
// Stripe, and never passes through our code or our server. That keeps us out of heavy card-data
// security rules (PCI).
export default function PaymentForm({
  checkoutId,
  showtimeId,
  amountLabel,
  disabled,
  onPaid,
}: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return; // Stripe.js is still loading
    setBusy(true);
    setError(null);

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        // Only used by payment methods that send the customer to another site (e.g. a bank page)
        // and then back. We come back to this page and keep checking our own server.
        return_url: `${window.location.origin}/checkout/${showtimeId}?checkout=${checkoutId}`,
      },
      // Cards finish right here without leaving the page. Only redirect when a method requires it.
      redirect: "if_required",
    });

    if (result.error) {
      // e.g. "Your card was declined." The customer can fix the details and try again.
      setError(result.error.message ?? "The payment could not be completed.");
      setBusy(false);
    } else {
      // IMPORTANT: this does NOT mean the booking exists. The booking is created by Stripe's
      // webhook reaching our server. Until then we only show "confirming...".
      onPaid();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!stripe || !elements || busy || disabled}
        className="w-full rounded-lg bg-emerald-600 py-3 font-medium hover:bg-emerald-500 disabled:opacity-50"
      >
        {busy ? "Processing…" : `Pay ${amountLabel}`}
      </button>
    </form>
  );
}
