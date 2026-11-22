import { api } from "./client";
import { socket } from "../lib/socket";
import type {
  HoldResponse,
  SeatAvailability,
  ShowtimeDetail,
} from "../types/booking";

export async function fetchShowtimeDetail(id: string) {
  return (await api.get<ShowtimeDetail>(`/api/showtimes/${id}`)).data;
}

export async function fetchSeatAvailability(id: string) {
  return (await api.get<SeatAvailability>(`/api/showtimes/${id}/seats`)).data;
}

// We tell the server which browser connection is asking, so it can skip US when it broadcasts
// the change to everyone watching (we already update ourselves from the response).
const socketHeaders = () => (socket.id ? { "X-Socket-Id": socket.id } : {});

export async function holdSeats(showtimeId: string, seatIds: string[]) {
  const res = await api.post<HoldResponse>(
    `/api/showtimes/${showtimeId}/hold`,
    { seatIds },
    { headers: socketHeaders() },
  );
  return res.data;
}

// No seatIds = release everything I hold on this showtime.
export async function releaseSeats(showtimeId: string, seatIds?: string[]) {
  const res = await api.delete<{ released: string[] }>(
    `/api/showtimes/${showtimeId}/hold`,
    { data: seatIds ? { seatIds } : undefined, headers: socketHeaders() },
  );
  return res.data.released;
}
