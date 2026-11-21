type Layout = {
  rows: { seats: { id: string; type: string; col: number }[] }[];
};

export const countSeats = (layout: Layout) =>
  layout.rows.reduce((total, row) => total + row.seats.length, 0);

// Turns a layout into one string that changes ONLY when a seat is added, removed,
// moved or changes type. Comparing two layouts is then just comparing two strings.
// Accepts null/undefined because Mongoose types a stored layout as optional.
export function layoutSignature(layout: Layout | null | undefined) {
  return (layout?.rows ?? [])
    .flatMap((row) => row.seats.map((s) => `${s.id}:${s.type}:${s.col}`))
    .sort()
    .join("|");
}
