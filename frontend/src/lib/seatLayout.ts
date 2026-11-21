export const SEAT_TYPES = ["standard", "premium", "vip", "wheelchair"] as const;
export type SeatType = (typeof SEAT_TYPES)[number];

// These mirror the limits in backend/src/modules/admin/admin.schemas.ts.
export const LIMITS = { maxRows: 40, maxSeatsPerRow: 60, maxColumns: 100 };

export type Cell = { type: SeatType; number: number } | null;
export type EditorRow = { label: string; cells: Cell[] };
export type EditorLayout = {
  columns: number; // grid width, aisles included
  aisleCols: number[]; // columns that are walkways (never contain seats)
  rows: EditorRow[];
};

export type ApiSeat = {
  id: string;
  number: number;
  col: number;
  type: SeatType;
};
export type ApiLayout = {
  columns: number;
  rows: { label: string; seats: ApiSeat[] }[];
};

// 0 -> "A", 25 -> "Z", 26 -> "AA", 27 -> "AB" ... (the backend allows 1-2 capital letters)
export function rowLabel(index: number): string {
  const letter = (n: number) => String.fromCharCode(65 + n);
  return index < 26
    ? letter(index)
    : letter(Math.floor(index / 26) - 1) + letter(index % 26);
}

// ------------------------- generating a grid from numbers -------------------------

export type GenerateParams = {
  rows: number;
  seatsPerRow: number;
  aisleAfter: number[]; // "aisle after seat 4 and seat 10" -> [4, 10]
  premiumRows: number; // how many rows (counted from the back) are premium
  vipRows: number; // how many rows at the very back are VIP
};

// Turns "4, 10" into [4, 10] and complains about anything that makes no sense.
export function parseAisles(
  text: string,
  seatsPerRow: number,
): { aisles: number[]; error: string | null } {
  const parts = text
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const aisles: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 1 || n >= seatsPerRow) {
      return {
        aisles: [],
        error: `"${p}" is not valid: use whole numbers from 1 to ${seatsPerRow - 1}, separated by commas`,
      };
    }
    aisles.push(n);
  }
  return { aisles: [...new Set(aisles)].sort((a, b) => a - b), error: null };
}

export function generateLayout(p: GenerateParams): EditorLayout {
  const aisleCols: number[] = [];
  // For each seat number 1..N work out which grid column it sits in.
  // Every aisle we pass pushes the following seats one column to the right.
  const seatCols: number[] = [];
  let col = 0;
  for (let n = 1; n <= p.seatsPerRow; n++) {
    seatCols.push(col);
    col++;
    if (p.aisleAfter.includes(n)) {
      aisleCols.push(col); // the empty column right after seat n
      col++;
    }
  }
  const columns = col;

  const rows: EditorRow[] = Array.from({ length: p.rows }, (_, r) => {
    const fromBack = p.rows - 1 - r; // 0 = the last row
    const type: SeatType =
      fromBack < p.vipRows
        ? "vip"
        : fromBack < p.vipRows + p.premiumRows
          ? "premium"
          : "standard";
    const cells: Cell[] = Array<Cell>(columns).fill(null);
    seatCols.forEach((c, i) => {
      cells[c] = { type, number: i + 1 };
    });
    return { label: rowLabel(r), cells };
  });

  return { columns, aisleCols, rows };
}

// Returns an error message, or null when the generator settings are fine.
export function validateGenerateParams(p: GenerateParams): string | null {
  if (!Number.isInteger(p.rows) || p.rows < 1 || p.rows > LIMITS.maxRows)
    return `Rows must be a whole number from 1 to ${LIMITS.maxRows}`;
  if (
    !Number.isInteger(p.seatsPerRow) ||
    p.seatsPerRow < 1 ||
    p.seatsPerRow > LIMITS.maxSeatsPerRow
  )
    return `Seats per row must be a whole number from 1 to ${LIMITS.maxSeatsPerRow}`;
  if (
    !Number.isInteger(p.premiumRows) ||
    !Number.isInteger(p.vipRows) ||
    p.premiumRows < 0 ||
    p.vipRows < 0
  )
    return "Premium and VIP rows must be 0 or more";
  if (p.premiumRows + p.vipRows > p.rows)
    return "Premium + VIP rows can't be more than the total rows";
  if (p.seatsPerRow + p.aisleAfter.length > LIMITS.maxColumns)
    return `The grid can be at most ${LIMITS.maxColumns} columns wide`;
  return null;
}

// ------------------------------ editing one cell ------------------------------

// The "paint tool": either a seat type to paint with, or "remove" to erase.
export type Tool = SeatType | "remove";

// SEAT NUMBERS ARE STABLE. A seat's number depends only on its position in the row
// (its column, minus the aisles to its left), NOT on how many seats are left.
// Why this matters: if you remove seat A3, seats A4, A5... keep their numbers, so any
// ticket that already says "A4" still points at the same physical seat. And when you
// add A3 back, it gets number 3 again.
export function conventionalNumber(aisleCols: number[], col: number): number {
  return col - aisleCols.filter((a) => a < col).length + 1;
}

function paintCell(cell: Cell, tool: Tool, number: number): Cell {
  if (tool === "remove") return null;
  return cell ? { ...cell, type: tool } : { type: tool, number };
}

// All functions below return a NEW layout instead of changing the old one.
// React only re-renders when it sees a new object, so changing state in place
// ("mutating") would leave the screen out of date.
export function paintSeat(
  layout: EditorLayout,
  rowIndex: number,
  col: number,
  tool: Tool,
): EditorLayout {
  if (layout.aisleCols.includes(col)) return layout; // walkways can't hold seats
  const row = layout.rows[rowIndex];
  if (!row) return layout;
  const old = row.cells[col];
  const next = paintCell(old, tool, conventionalNumber(layout.aisleCols, col));
  // Nothing changed (same type, or erasing an already empty slot): keep the old object
  if (old?.type === next?.type && !!old === !!next) return layout;

  const cells = row.cells.slice();
  cells[col] = next;
  const rows = layout.rows.slice();
  rows[rowIndex] = { ...row, cells };
  return { ...layout, rows };
}

// Applies the tool to every non-aisle slot of a row (click the row letter).
export function paintRow(
  layout: EditorLayout,
  rowIndex: number,
  tool: Tool,
): EditorLayout {
  let result = layout;
  for (let c = 0; c < layout.columns; c++)
    result = paintSeat(result, rowIndex, c, tool);
  return result;
}

// -------------------------------- reading the layout --------------------------------

export function countByType(layout: EditorLayout): Record<SeatType, number> {
  const counts: Record<SeatType, number> = {
    standard: 0,
    premium: 0,
    vip: 0,
    wheelchair: 0,
  };
  for (const row of layout.rows)
    for (const cell of row.cells) if (cell) counts[cell.type]++;
  return counts;
}

export const totalSeats = (layout: EditorLayout) =>
  Object.values(countByType(layout)).reduce((a, b) => a + b, 0);

// Checks the rules the backend will also check, so the admin gets the message
// immediately instead of after a round trip. (The server still re-checks everything.)
export function validateLayout(layout: EditorLayout): string | null {
  if (totalSeats(layout) === 0) return "Add at least one seat";
  for (const row of layout.rows) {
    const seats = row.cells.filter((c): c is NonNullable<Cell> => c !== null);
    if (seats.length > LIMITS.maxSeatsPerRow)
      return `Row ${row.label} has more than ${LIMITS.maxSeatsPerRow} seats`;
    const numbers = new Set(seats.map((s) => s.number));
    if (numbers.size !== seats.length)
      return `Row ${row.label} has two seats with the same number. Use "Generate grid" to rebuild the layout.`;
  }
  return null;
}

// ------------------------------- API <-> editor -------------------------------

export function toApiLayout(layout: EditorLayout): ApiLayout {
  return {
    columns: layout.columns,
    rows: layout.rows
      .map((row) => ({
        label: row.label,
        seats: row.cells.flatMap((cell, col) =>
          cell
            ? [
                {
                  id: `${row.label}${cell.number}`, // the backend requires id === label + number
                  number: cell.number,
                  col,
                  type: cell.type,
                },
              ]
            : [],
        ),
      }))
      // The backend rejects a row with zero seats, and an empty row is pointless anyway
      .filter((row) => row.seats.length > 0),
  };
}

export function fromApiLayout(api: ApiLayout): EditorLayout {
  const columns = Math.max(api.columns, 1);
  const rows: EditorRow[] = api.rows.map((row) => {
    const cells: Cell[] = Array<Cell>(columns).fill(null);
    for (const seat of row.seats)
      cells[seat.col] = { type: seat.type, number: seat.number };
    return { label: row.label, cells };
  });
  // A column with no seat in any row is a walkway.
  const aisleCols = Array.from({ length: columns }, (_, c) => c).filter((c) =>
    rows.every((r) => r.cells[c] === null),
  );
  return { columns, aisleCols, rows };
}
