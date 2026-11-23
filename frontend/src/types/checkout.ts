import type { SeatType } from "../lib/seatLayout";

export type CheckoutSeat = { seatId: string; type: SeatType; price: number };

// POST /api/showtimes/:id/checkout
export type CheckoutStart =
  | {
      state: "payable";
      checkoutId: string;
      clientSecret: string;
      amount: number; // minor units (cents)
      currency: string;
      seats: CheckoutSeat[];
      holdExpiresAt: number; // server clock, ms since 1970
      serverTime: number;
    }
  | { state: "processing"; checkoutId: string };

// GET /api/checkouts/:id
export type CheckoutStatus = {
  checkoutId: string;
  status: "pending" | "completed" | "refunded" | "canceled";
  bookingId?: string;
  refundReason?: "seats_unavailable" | "amount_mismatch";
  seats: CheckoutSeat[];
  totalAmount: number;
  currency: string;
};
