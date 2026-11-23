import { HttpError } from "../../utils/httpError";

type SeatType = "standard" | "premium" | "vip" | "wheelchair";
export type SeatLine = { seatId: string; type: SeatType; price: number };
// A showtime's price list. A type the hall doesn't have may be missing (or null in the database).
type PriceList = Partial<Record<SeatType, number | null>> | null | undefined;

// THE SERVER DECIDES THE PRICE. The browser only says WHICH seats (and even that comes from our own
// Redis holds). The price of each seat is looked up here from the showtime's price list and the
// seat's type in the hall layout, so nobody can pay less by editing a request.
export function priceSeats(
  prices: PriceList,
  layoutRows: { seats: { id: string; type: string }[] }[],
  seatIds: string[],
): { lines: SeatLine[]; total: number } {
  const typeOf = new Map(
    layoutRows.flatMap((row) => row.seats.map((s) => [s.id, s.type] as const)),
  );

  const lines = seatIds.map((seatId) => {
    const type = typeOf.get(seatId) as SeatType | undefined;
    if (!type) throw new HttpError(409, `Seat ${seatId} no longer exists`);
    const price = prices?.[type];
    if (price === undefined || price === null)
      throw new HttpError(409, `No price is set for ${type} seats`);
    return { seatId, type, price };
  });

  return { lines, total: lines.reduce((sum, l) => sum + l.price, 0) };
}
