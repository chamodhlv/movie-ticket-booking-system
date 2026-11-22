import { formatMoney } from "../lib/dates";
import type { ApiLayout, SeatType } from "../lib/seatLayout";
import type { SeatStatus } from "../lib/seatState";
import type { Prices } from "../types/catalog";

// Colour of an AVAILABLE seat, by seat type (same colours as the admin editor).
const TYPE_STYLE: Record<SeatType, { cls: string; label: string }> = {
  standard: { cls: "bg-slate-500 text-white", label: "Standard" },
  premium: { cls: "bg-amber-500 text-slate-900", label: "Premium" },
  vip: { cls: "bg-purple-500 text-white", label: "VIP" },
  wheelchair: { cls: "bg-sky-500 text-slate-900", label: "Wheelchair" },
};

// Look of a seat that is NOT simply available. These override the type colour.
const STATUS_CLASS: Record<Exclude<SeatStatus, "available">, string> = {
  mine: "bg-emerald-500 text-white ring-2 ring-emerald-300",
  held: "border border-dashed border-orange-500/70 bg-slate-800 text-slate-500",
  booked: "bg-slate-800 text-slate-600 opacity-50",
};

const SEAT_PX = 32; // width of a seat column
const AISLE_PX = 16; // width of a walkway column

type Props = {
  layout: ApiLayout;
  statuses: Map<string, SeatStatus>; // seats missing from the map are available
  pending: Set<string>; // seats with a request in flight (shown pulsing, not clickable)
  prices: Prices;
  disabled: boolean; // e.g. the show already started
  onSeatClick: (seatId: string) => void;
};

export default function SeatMap({
  layout,
  statuses,
  pending,
  prices,
  disabled,
  onSeatClick,
}: Props) {
  // THE LAYOUT IS A GRID. Each seat knows its `col`. A column that NO row uses is a walkway,
  // so it gets a narrow track; every other column gets a seat-wide track. Seats are then
  // placed by column number (gridColumnStart), so a seat the admin removed from one row
  // just leaves an empty slot there and everything else stays aligned.
  const used = new Set(layout.rows.flatMap((r) => r.seats.map((s) => s.col)));
  const tracks = Array.from({ length: layout.columns }, (_, c) =>
    used.has(c) ? `${SEAT_PX}px` : `${AISLE_PX}px`,
  ).join(" ");

  return (
    <div>
      {/* Wide halls scroll sideways on small screens instead of squeezing the seats */}
      <div className="overflow-x-auto pb-2">
        <div className="mx-auto w-max px-2">
          <div className="mb-6 rounded-b-3xl bg-slate-700 py-1 text-center text-xs tracking-widest text-slate-300">
            SCREEN
          </div>

          {layout.rows.map((row) => (
            <div key={row.label} className="mb-1.5 flex items-center gap-2">
              <span className="w-6 shrink-0 text-center text-xs text-slate-500">
                {row.label}
              </span>
              <div
                className="grid gap-x-1"
                style={{ gridTemplateColumns: tracks }}
              >
                {row.seats.map((seat) => {
                  const status = statuses.get(seat.id) ?? "available";
                  const busy = pending.has(seat.id);
                  const clickable =
                    !disabled &&
                    !busy &&
                    (status === "available" || status === "mine");
                  const price = prices[seat.type];
                  return (
                    <button
                      key={seat.id}
                      type="button"
                      disabled={!clickable}
                      aria-pressed={status === "mine"}
                      aria-label={`Seat ${seat.id}, ${TYPE_STYLE[seat.type].label}${
                        price !== undefined ? `, ${formatMoney(price)}` : ""
                      }, ${
                        status === "mine"
                          ? "selected by you"
                          : status === "held"
                            ? "held by someone else"
                            : status
                      }`}
                      title={`${seat.id} · ${TYPE_STYLE[seat.type].label}${
                        price !== undefined ? ` · ${formatMoney(price)}` : ""
                      }`}
                      onClick={() => onSeatClick(seat.id)}
                      style={{ gridColumnStart: seat.col + 1 }}
                      className={`h-8 rounded-md text-[11px] font-medium transition ${
                        status === "available"
                          ? `${TYPE_STYLE[seat.type].cls} ${clickable ? "hover:brightness-125" : ""}`
                          : STATUS_CLASS[status]
                      } ${busy ? "animate-pulse" : ""} ${clickable ? "" : "cursor-not-allowed"}`}
                    >
                      {status === "booked" ? "✕" : seat.number}
                    </button>
                  );
                })}
              </div>
              <span className="w-6 shrink-0 text-center text-xs text-slate-500">
                {row.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Legend layout={layout} />
    </div>
  );
}

// Only lists the seat types this hall actually has.
function Legend({ layout }: { layout: ApiLayout }) {
  const types = new Set(layout.rows.flatMap((r) => r.seats.map((s) => s.type)));
  const item = (cls: string, label: string) => (
    <span key={label} className="flex items-center gap-1.5">
      <span className={`inline-block h-4 w-4 rounded ${cls}`} />
      {label}
    </span>
  );
  return (
    <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-slate-400">
      {(Object.keys(TYPE_STYLE) as SeatType[])
        .filter((t) => types.has(t))
        .map((t) => item(TYPE_STYLE[t].cls, TYPE_STYLE[t].label))}
      {item(STATUS_CLASS.mine, "Your seats")}
      {item(STATUS_CLASS.held, "Held by someone")}
      {item(STATUS_CLASS.booked, "Booked")}
    </div>
  );
}
