import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { fetchMovie, fetchMovieShowtimes } from "../api/catalog";
import { useBrowseFilters } from "../hooks/useBrowseFilters";
import FilterBar from "../components/FilterBar";
import { formatDayLabel, formatMoney, formatTime } from "../lib/dates";
import type { Prices, ShowtimeItem } from "../types/catalog";

// Cheapest ticket price of a showtime ("from LKR 1,200.00")
function lowestPrice(prices: Prices) {
  const values = Object.values(prices).filter(
    (p): p is number => typeof p === "number",
  );
  return Math.min(...values);
}

// Splits one cinema's showtimes into days. The backend already sorts by start time,
// and a Map remembers insertion order, so the days come out in chronological order.
function groupByDay(showtimes: ShowtimeItem[]) {
  const days = new Map<string, ShowtimeItem[]>();
  for (const s of showtimes) {
    const label = formatDayLabel(s.startTime); // formatted in the CINEMA'S timezone
    days.set(label, [...(days.get(label) ?? []), s]);
  }
  return [...days.entries()];
}

export default function MovieDetailPage() {
  const { id = "" } = useParams();
  const { filters, search, clearFilters } = useBrowseFilters();

  const movieQuery = useQuery({
    queryKey: ["movie", id],
    queryFn: () => fetchMovie(id),
  });
  const showtimesQuery = useQuery({
    queryKey: ["movie-showtimes", id, filters], // refetches whenever a filter changes
    queryFn: () => fetchMovieShowtimes(id, filters),
    placeholderData: keepPreviousData,
  });

  if (movieQuery.isLoading)
    return <p className="p-6 text-slate-400">Loading…</p>;
  if (movieQuery.isError || !movieQuery.data)
    return <p className="p-6 text-red-400">Movie not found.</p>;

  const movie = movieQuery.data;
  const groups = showtimesQuery.data;

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <Link
        to={{ pathname: "/", search: search && `?${search}` }}
        className="text-sm text-slate-400 hover:text-emerald-400"
      >
        ← Back to movies
      </Link>

      <section className="flex flex-col gap-6 sm:flex-row">
        {movie.posterUrl && (
          <img
            src={movie.posterUrl}
            alt={movie.title}
            className="w-48 shrink-0 self-start rounded-xl"
          />
        )}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold">{movie.title}</h1>
          <p className="text-sm text-slate-400">
            {movie.durationMinutes} min · {movie.certificate} ·{" "}
            {movie.genres.join(", ")}
          </p>
          <p className="max-w-2xl text-slate-300">{movie.description}</p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Showtimes</h2>
        <FilterBar />

        {showtimesQuery.isLoading && (
          <p className="text-slate-400">Loading showtimes…</p>
        )}
        {showtimesQuery.isError && (
          <p className="text-red-400">Couldn't load showtimes.</p>
        )}

        {groups && groups.length === 0 && (
          <div className="rounded-2xl bg-slate-900 p-6 text-center">
            <p className="mb-2 text-slate-300">
              No showtimes match these filters.
            </p>
            <button
              onClick={clearFilters}
              className="text-emerald-400 hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}

        {groups?.map((group) => (
          <article
            key={group.cinema._id}
            className="space-y-4 rounded-2xl bg-slate-900 p-4"
          >
            <header>
              <h3 className="font-semibold">{group.cinema.name}</h3>
              <p className="text-xs text-slate-400">{group.cinema.address}</p>
            </header>

            {groupByDay(group.showtimes).map(([dayLabel, items]) => (
              <div key={dayLabel}>
                <p className="mb-2 text-sm text-slate-400">{dayLabel}</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {items.map((s) => (
                    <Link
                      key={s.id}
                      to={`/showtimes/${s.id}`}
                      className="rounded-lg border border-emerald-700 px-3 py-2 text-center hover:bg-emerald-900/40"
                    >
                      <div className="font-medium text-emerald-400">
                        {formatTime(s.startTime)}
                      </div>
                      <div className="text-xs text-slate-400">
                        {s.format} · {s.language}
                      </div>
                      <div className="text-xs text-slate-500">
                        from {formatMoney(lowestPrice(s.prices))}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </article>
        ))}
      </section>
    </main>
  );
}
