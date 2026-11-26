import { api } from "./client";
import type { TicketResponse } from "../types/ticket";

export async function fetchTicket(bookingId: string) {
  return (await api.get<TicketResponse>(`/api/bookings/${bookingId}`)).data;
}
