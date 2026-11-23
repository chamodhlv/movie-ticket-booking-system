import { api } from "./client";
import type { CheckoutStart, CheckoutStatus } from "../types/checkout";

// Turn the seats I hold into a payment. Note that we send NO seats and NO price: the server
// looks up my holds itself and calculates the price itself.
export async function startCheckout(showtimeId: string) {
  return (
    await api.post<CheckoutStart>(`/api/showtimes/${showtimeId}/checkout`)
  ).data;
}

export async function fetchCheckout(checkoutId: string) {
  return (await api.get<CheckoutStatus>(`/api/checkouts/${checkoutId}`)).data;
}

export async function cancelCheckout(checkoutId: string) {
  await api.delete(`/api/checkouts/${checkoutId}`);
}
