import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  SEAT_TYPES,
  countByType,
  generateLayout,
  paintRow,
  paintSeat,
  parseAisles,
  totalSeats,
  validateGenerateParams,
  type EditorLayout,
  type SeatType,
  type Tool,
} from "../../lib/seatLayout";
import { btnSecondary, inputClass } from "./styles";

// Colour + label for each seat type. Used by the grid AND the legend.
const SEAT_STYLE: Record<SeatType, { cls: string; label: string }> = {
  standard: { cls: "bg-slate-500 text-white", label: "Standard" },
  premium: { cls: "bg-amber-500 text-slate-900", label: "Premium" },
  vip: { cls: "bg-purple-500 text-white", label: "VIP" },
  wheelchair: { cls: "bg-sky-500 text-slate-900", label: "Wheelchair" },
};

type Props = {
  value: EditorLayout;
  // A React state setter: it accepts a new layout OR a function (previous) => next.
  onChange: Dispatch<SetStateAction<EditorLayout>>;
};

// The hall's seat-layout editor, in two steps:
//   1. "Generate grid": rows x seats, aisles, premium/VIP rows -> a ready-made grid.
//   2. Pick a tool (a seat type, or Remove) and click or drag over seats to repaint them.
// This component is "controlled": the layout lives in the parent form (`value`), and every
// change is reported with `onChange`, so the parent can save it with the rest of the hall.
// We always pass `onChange` a FUNCTION of the previous layout while painting. While you drag
// quickly across seats, several events can fire before React re-renders, and a function
// always receives the latest layout, so no seat is skipped.
export default function SeatLayoutEditor({ value, onChange }: Props) {
  // Settings of the generator (text inputs are kept as strings while typing)
  const [rows, setRows] = useState("10");
  const [seatsPerRow, setSeatsPerRow] = useState("14");
  const [aisles, setAisles] = useState("4, 10");
  const [premiumRows, setPremiumRows] = useState("2");
  const [vipRows, setVipRows] = useState("0");
  const [genError, setGenError] = useState<string | null>(null);

  const [tool, setTool] = useState<Tool>("premium");

  // DRAG PAINTING. Mouse down on a seat starts "painting"; moving over other seats keeps
  // painting; releasing the button ANYWHERE (even outside the grid) stops. That is why the
  // mouseup listener is on `window`, not on the grid.
  const [painting, setPainting] = useState(false);
  useEffect(() => {
    const stop = () => setPainting(false);
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);

  function generate() {
    const r = Number(rows);
    const s = Number(seatsPerRow);
    const { aisles: aisleList, error } = parseAisles(aisles, s);
    if (error) return setGenError(error);
    const params = {
      rows: r,
      seatsPerRow: s,
      aisleAfter: aisleList,
      premiumRows: Number(premiumRows),
      vipRows: Number(vipRows),
    };
    const problem = validateGenerateParams(params);
    if (problem) return setGenError(problem);
    if (
      totalSeats(value) > 0 &&
      !window.confirm("This replaces the current layout. Continue?")
    )
      return;
    setGenError(null);
    onChange(generateLayout(params));
  }

  const counts = countByType(value);
  const numberInput = (
    label: string,
    v: string,
    set: (s: string) => void,
    hint?: string,
  ) => (
    <label className="text-sm">
      <span className="mb-1 block text-slate-400">{label}</span>
      <input
        value={v}
        onChange={(e) => set(e.target.value)}
        inputMode="numeric"
        className={inputClass}
      />
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  );

  return (
    <div className="space-y-4">
      {/* ---------- Step 1: generator ---------- */}
      <div className="rounded-xl border border-slate-800 p-3">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">
          1. Generate a grid
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {numberInput("Rows", rows, setRows)}
          {numberInput("Seats per row", seatsPerRow, setSeatsPerRow)}
          {numberInput("Aisle after seat", aisles, setAisles, "e.g. 4, 10")}
          {numberInput(
            "Premium rows",
            premiumRows,
            setPremiumRows,
            "at the back",
          )}
          {numberInput("VIP rows", vipRows, setVipRows, "very back")}
        </div>
        {genError && <p className="mt-2 text-sm text-red-400">{genError}</p>}
        <button
          type="button"
          onClick={generate}
          className={`${btnSecondary} mt-3`}
        >
          Generate grid
        </button>
      </div>

      {/* ---------- Step 2: paint tools ---------- */}
      <div className="rounded-xl border border-slate-800 p-3">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">
          2. Click or drag over seats to change them
        </h3>
        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-label="Paint tool"
        >
          {[...SEAT_TYPES, "remove" as const].map((t) => {
            const active = tool === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTool(t)}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ring-2 ${active ? "ring-emerald-500" : "ring-transparent"} bg-slate-800 hover:bg-slate-700`}
              >
                {t === "remove" ? (
                  <span className="inline-block h-3 w-3 rounded-sm border border-dashed border-slate-400" />
                ) : (
                  <span
                    className={`inline-block h-3 w-3 rounded-sm ${SEAT_STYLE[t].cls}`}
                  />
                )}
                {t === "remove" ? "Remove seat" : SEAT_STYLE[t].label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Tip: click a row letter to apply the tool to the whole row. Removed
          seats leave a gap, and the other seats keep their numbers.
        </p>

        {/* ---------- The grid (also the live preview) ---------- */}
        <div
          className="mt-4 overflow-x-auto select-none"
          // Stops the browser starting a text/image "drag" while painting
          onDragStart={(e) => e.preventDefault()}
        >
          <div className="mx-auto w-max min-w-full px-2">
            <div className="mb-4 rounded-b-3xl bg-slate-700 py-1 text-center text-xs tracking-widest text-slate-300">
              SCREEN
            </div>
            {value.rows.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">
                No seats yet. Use "Generate grid" above.
              </p>
            )}
            {value.rows.map((row, r) => (
              <div key={row.label} className="mb-1 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onChange((prev) => paintRow(prev, r, tool))}
                  className="w-7 shrink-0 rounded text-center text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
                  title={`Apply the tool to all of row ${row.label}`}
                >
                  {row.label}
                </button>
                {row.cells.map((cell, c) => {
                  // A walkway: just empty space
                  if (value.aisleCols.includes(c))
                    return (
                      <span key={c} className="w-4 shrink-0" aria-hidden />
                    );
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-label={
                        cell
                          ? `Seat ${row.label}${cell.number}, ${cell.type}`
                          : `Empty slot, row ${row.label}`
                      }
                      onMouseDown={() => {
                        setPainting(true);
                        onChange((prev) => paintSeat(prev, r, c, tool));
                      }}
                      onMouseEnter={() => {
                        if (painting)
                          onChange((prev) => paintSeat(prev, r, c, tool));
                      }}
                      // A keyboard "click" (Enter/Space) has detail === 0 and never fires
                      // mousedown, so it needs its own path. A real mouse click already
                      // painted in onMouseDown, so we must ignore it here.
                      onClick={(e) => {
                        if (e.detail === 0)
                          onChange((prev) => paintSeat(prev, r, c, tool));
                      }}
                      className={`h-7 w-7 shrink-0 rounded-md text-[10px] font-medium ${
                        cell
                          ? SEAT_STYLE[cell.type].cls
                          : "border border-dashed border-slate-700 text-transparent hover:border-slate-500"
                      }`}
                    >
                      {cell?.number ?? "·"}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* ---------- Summary ---------- */}
        <p className="mt-4 text-sm text-slate-300">
          <strong>{totalSeats(value)}</strong> seats
          {SEAT_TYPES.filter((t) => counts[t] > 0).map((t) => (
            <span key={t} className="ml-3 text-slate-400">
              {SEAT_STYLE[t].label}: {counts[t]}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
