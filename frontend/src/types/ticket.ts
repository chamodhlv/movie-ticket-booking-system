import type { SeatType } from "../lib/seatLayout";

export type BookingStatus = "confirmed" | "used" | "cancelled";

// GET /api/bookings/:bookingId
export type TicketResponse = {
  booking: {
    id: string;
    reference: string; // short code like "7F3A9C21"
    status: BookingStatus;
    seats: { seatId: string; type: SeatType; price: number }[];
    totalAmount: number; // minor units (cents)
    currency: string;
    usedAt: string | null; // when staff scanned it
    createdAt: string;
  };
  showtime: {
    id: string;
    startTime: string; // UTC ISO; format with lib/dates so it shows in the cinema's timezone
    endTime: string;
    language: string;
    format: string;
    status: "scheduled" | "cancelled";
  };
  movie: {
    title: string;
    posterUrl: string;
    certificate: string;
    durationMinutes: number;
  };
  cinema: { name: string; city: string; address: string };
  hall: { name: string };
  // Only a ticket that can still get you in has a QR code (not used / cancelled ones).
  ticket: { token: string; qrDataUrl: string } | null;
};
