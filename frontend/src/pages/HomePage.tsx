import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchMovies } from "../api/catalog";
import { useBrowseFilters } from "../hooks/useBrowseFilters";
import FilterBar from "../components/FilterBar";
import MovieCard from "../components/MovieCard";

export default function HomePage() {
  const { filters, page, search, setPage, clearFilters } = useBrowseFilters();

  const { data, isLoading, isError, isFetching } = useQuery({
    // Everything the request depends on goes in the key. When the filters or page
    // change, React Query sees a NEW key and fetches again automatically.
    queryKey: ["movies", filters, page],
    queryFn: () => fetchMovies(filters, page),
    // Keep showing the previous results while the new ones load, so the grid
    // doesn't flash empty every time you click a filter.
    placeholderData: keepPreviousData,
  });

  function goToPage(p: number) {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-bold">Now showing</h1>
      <FilterBar />

      {isLoading && <p className="text-slate-400">Loading movies…</p>}
      {isError && (
        <p className="text-red-400">Couldn't load movies. Please try again.</p>
      )}

      {data && data.items.length === 0 && (
        <div className="rounded-2xl bg-slate-900 p-8 text-center">
          <p className="mb-3 text-slate-300">No movies match these filters.</p>
          <button
            onClick={clearFilters}
            className="text-emerald-400 hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}

      {data && data.items.length > 0 && (
        <>
          {/* Fade the grid slightly while a refetch is in flight */}
          <div
            className={`grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 ${isFetching ? "opacity-60" : ""}`}
          >
            {data.items.map((m) => (
              <MovieCard key={m._id} movie={m} search={search} />
            ))}
          </div>

          {data.pages > 1 && (
            <div className="flex items-center justify-center gap-4">
              <button
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
                className="rounded-lg bg-slate-800 px-4 py-2 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-slate-400">
                Page {page} of {data.pages}
              </span>
              <button
                disabled={page >= data.pages}
                onClick={() => goToPage(page + 1)}
                className="rounded-lg bg-slate-800 px-4 py-2 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
