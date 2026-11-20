import { useQuery } from "@tanstack/react-query";
import { fetchCities } from "../api/catalog";
import { FILTER_KEYS, useBrowseFilters } from "../hooks/useBrowseFilters";
import { upcomingDays } from "../lib/dates";

// Fixed lists for now. Later, the admin panel could manage these.
const LANGUAGES = ["English", "Sinhala", "Tamil"];
const FORMATS = ["2D", "3D", "IMAX", "4DX"];

type SelectProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
};

function FilterSelect({ label, value, options, onChange }: SelectProps) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

// Used on both the home page and the movie page. It needs no props because it
// talks to the URL through the hook.
export default function FilterBar() {
  const { filters, setFilter, clearFilters } = useBrowseFilters();
  const { data: cities = [] } = useQuery({
    queryKey: ["cities"],
    queryFn: fetchCities,
    staleTime: 10 * 60 * 1000, // cities rarely change, so don't refetch for 10 minutes
  });

  const days = upcomingDays(7);
  const hasFilters = FILTER_KEYS.some((k) => filters[k]);

  const dayButton = (active: boolean) =>
    `shrink-0 rounded-lg px-3 py-2 text-sm ${active ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`;

  return (
    <section className="space-y-4 rounded-2xl bg-slate-900 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FilterSelect
          label="City"
          value={filters.city ?? ""}
          options={cities}
          onChange={(v) => setFilter("city", v)}
        />
        <FilterSelect
          label="Language"
          value={filters.language ?? ""}
          options={LANGUAGES}
          onChange={(v) => setFilter("language", v)}
        />
        <FilterSelect
          label="Format"
          value={filters.format ?? ""}
          options={FORMATS}
          onChange={(v) => setFilter("format", v)}
        />
      </div>

      {/* Date strip: scrolls sideways on small screens */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          className={dayButton(!filters.date)}
          onClick={() => setFilter("date", "")}
        >
          Any date
        </button>
        {days.map((d) => (
          <button
            key={d.iso}
            className={dayButton(filters.date === d.iso)}
            onClick={() => setFilter("date", d.iso)}
          >
            {d.label}
          </button>
        ))}
      </div>

      {hasFilters && (
        <button
          onClick={clearFilters}
          className="text-sm text-slate-400 hover:text-red-400"
        >
          Clear all filters
        </button>
      )}
    </section>
  );
}
