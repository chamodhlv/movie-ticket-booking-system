import { Link } from "react-router-dom";
import type { Movie } from "../types/catalog";

// `search` is the current filter query string. Passing it on means the movie page
// opens with the SAME city/date/language/format the user was browsing with.
export default function MovieCard({
  movie,
  search,
}: {
  movie: Movie;
  search: string;
}) {
  return (
    <Link
      to={{ pathname: `/movies/${movie._id}`, search: search && `?${search}` }}
      className="block overflow-hidden rounded-xl bg-slate-900 transition hover:-translate-y-1 hover:ring-2 hover:ring-emerald-500"
    >
      {movie.posterUrl ? (
        <img
          src={movie.posterUrl}
          alt={movie.title}
          loading="lazy"
          className="aspect-[2/3] w-full object-cover"
        />
      ) : (
        <div className="flex aspect-[2/3] w-full items-center justify-center bg-slate-800 text-4xl">
          🎬
        </div>
      )}
      <div className="space-y-1 p-3">
        <h3 className="font-semibold">{movie.title}</h3>
        <p className="text-xs text-slate-400">{movie.genres.join(" · ")}</p>
        <p className="text-xs text-slate-500">
          {movie.durationMinutes} min · {movie.certificate}
        </p>
      </div>
    </Link>
  );
}
