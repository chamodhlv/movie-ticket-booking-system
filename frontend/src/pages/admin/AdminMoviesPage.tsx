import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { deleteMovie, fetchAdminMovies } from "../../api/admin";
import { getErrorMessage } from "../../api/errors";
import { ErrorBanner } from "../../components/admin/fields";
import {
  btnDanger,
  btnLink,
  btnPrimary,
  inputClass,
} from "../../components/admin/styles";
import { useDebounced } from "../../hooks/useDebounced";
import { useInvalidateCatalog } from "../../hooks/useInvalidateCatalog";
import { MOVIE_STATUSES } from "../../lib/options";
import type { Movie } from "../../types/catalog";

const STATUS_BADGE: Record<Movie["status"], string> = {
  now_showing: "bg-emerald-900 text-emerald-300",
  upcoming: "bg-sky-900 text-sky-300",
  archived: "bg-slate-800 text-slate-400",
};

export default function AdminMoviesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const q = useDebounced(search.trim());
  const invalidate = useInvalidateCatalog();

  // Every input of the request is in the query key, so changing any of them
  // automatically fetches the right data (and caches each combination).
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "movies", { q, status, page }],
    queryFn: () =>
      fetchAdminMovies({
        q: q || undefined,
        status: status || undefined,
        page,
        limit: 10,
      }),
    placeholderData: keepPreviousData, // keep showing the old rows while the next page loads
  });

  const remove = useMutation({
    mutationFn: deleteMovie,
    onSuccess: () => {
      setActionError(null);
      return invalidate();
    },
    // e.g. 409 "This movie has showtimes. Set its status to archived instead of deleting it."
    onError: (err) => setActionError(getErrorMessage(err)),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Movies</h2>
        <Link to="/admin/movies/new" className={btnPrimary}>
          + Add movie
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1); // a new search starts from page 1
          }}
          placeholder="Search by title…"
          aria-label="Search movies"
          className={inputClass}
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
          className={inputClass}
        >
          <option value="">All statuses</option>
          {MOVIE_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <ErrorBanner
        message={actionError ?? (error ? getErrorMessage(error) : null)}
      />

      <div className="overflow-x-auto rounded-2xl bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-400">
            <tr>
              <th className="p-3">Movie</th>
              <th className="p-3">Status</th>
              <th className="p-3">Length</th>
              <th className="p-3">Release</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="p-4 text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-slate-400">
                  No movies found.
                </td>
              </tr>
            )}
            {data?.items.map((m) => (
              <tr key={m._id} className="border-t border-slate-800">
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    {m.posterUrl ? (
                      <img
                        src={m.posterUrl}
                        alt=""
                        className="h-14 w-10 rounded object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-14 w-10 rounded bg-slate-800" />
                    )}
                    <span className="font-medium">{m.title}</span>
                  </div>
                </td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[m.status]}`}
                  >
                    {m.status.replace("_", " ")}
                  </span>
                </td>
                <td className="p-3">{m.durationMinutes} min</td>
                <td className="p-3">
                  {m.releaseDate ? m.releaseDate.slice(0, 10) : "—"}
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <Link to={`/admin/movies/${m._id}`} className={btnLink}>
                    Edit
                  </Link>
                  <button
                    className={btnDanger}
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete "${m.title}"?`))
                        remove.mutate(m._id);
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button
            className={btnLink}
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Previous
          </button>
          <span className="text-slate-400">
            Page {data.page} of {data.pages} ({data.total} movies)
          </span>
          <button
            className={btnLink}
            disabled={page >= data.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
