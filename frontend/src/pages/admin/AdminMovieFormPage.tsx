import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createMovie, updateMovie } from "../../api/admin";
import { fetchMovie } from "../../api/catalog";
import { getErrorMessage } from "../../api/errors";
import {
  ErrorBanner,
  SelectField,
  TextAreaField,
} from "../../components/admin/fields";
import {
  btnPrimary,
  btnSecondary,
  cardClass,
} from "../../components/admin/styles";
import TextField from "../../components/TextField";
import { useInvalidateCatalog } from "../../hooks/useInvalidateCatalog";
import { MOVIE_STATUSES } from "../../lib/options";
import type { MovieInput } from "../../types/admin";
import type { Movie } from "../../types/catalog";

// Used for BOTH "/admin/movies/new" (no id) and "/admin/movies/:id" (edit).
// This outer component only LOADS the movie. The form below mounts after the data has
// arrived, so it can use the movie as the starting value of its useState. (Copying fetched
// data into state from a useEffect would first render an empty form, then flash.)
export default function AdminMovieFormPage() {
  const { id } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "movie", id],
    queryFn: () => fetchMovie(id!),
    enabled: !!id, // when creating there is nothing to load
  });

  if (id && isLoading) return <p className="text-slate-400">Loading…</p>;
  if (id && error) return <ErrorBanner message={getErrorMessage(error)} />;
  return <MovieForm movie={data} />;
}

function MovieForm({ movie }: { movie?: Movie }) {
  const navigate = useNavigate();
  const invalidate = useInvalidateCatalog();

  // Everything is kept as TEXT while typing (that is what inputs give us) and converted to
  // the API's types (number, array) once, in handleSubmit.
  const [title, setTitle] = useState(movie?.title ?? "");
  const [description, setDescription] = useState(movie?.description ?? "");
  const [duration, setDuration] = useState(
    String(movie?.durationMinutes ?? ""),
  );
  const [genres, setGenres] = useState(movie?.genres.join(", ") ?? "");
  const [certificate, setCertificate] = useState(movie?.certificate ?? "");
  // The API sends "2026-11-21T00:00:00.000Z"; <input type="date"> wants "2026-11-21".
  const [releaseDate, setReleaseDate] = useState(
    movie?.releaseDate?.slice(0, 10) ?? "",
  );
  const [posterUrl, setPosterUrl] = useState(movie?.posterUrl ?? "");
  const [trailerUrl, setTrailerUrl] = useState(movie?.trailerUrl ?? "");
  const [status, setStatus] = useState<MovieInput["status"]>(
    movie?.status ?? "upcoming",
  );
  const [posterBroken, setPosterBroken] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (input: MovieInput) =>
      movie ? updateMovie(movie._id, input) : createMovie(input),
    onSuccess: async () => {
      await invalidate();
      navigate("/admin/movies");
    },
    onError: (err) => setFormError(getErrorMessage(err)),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const minutes = Number(duration);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600)
      return setFormError(
        "Length must be a whole number of minutes (1 to 600)",
      );
    setFormError(null);
    save.mutate({
      title: title.trim(),
      description: description.trim(),
      durationMinutes: minutes,
      genres: genres
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean),
      certificate: certificate.trim(),
      releaseDate,
      posterUrl: posterUrl.trim(),
      trailerUrl: trailerUrl.trim(),
      status,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xl font-bold">
        {movie ? "Edit movie" : "Add movie"}
      </h2>

      <div className="grid gap-6 md:grid-cols-[1fr_200px]">
        <div className={`${cardClass} space-y-4`}>
          <TextField
            id="title"
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={120}
          />
          <TextAreaField
            id="description"
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              id="duration"
              label="Length (minutes)"
              type="number"
              min={1}
              max={600}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              required
            />
            <TextField
              id="certificate"
              label="Certificate"
              placeholder="PG-13"
              value={certificate}
              onChange={(e) => setCertificate(e.target.value)}
              maxLength={10}
            />
            <TextField
              id="release"
              label="Release date"
              type="date"
              value={releaseDate}
              onChange={(e) => setReleaseDate(e.target.value)}
            />
          </div>
          <TextField
            id="genres"
            label="Genres (comma separated)"
            placeholder="Action, Sci-Fi"
            value={genres}
            onChange={(e) => setGenres(e.target.value)}
          />
          <SelectField
            id="status"
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as MovieInput["status"])}
          >
            {MOVIE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </SelectField>
          <TextField
            id="poster"
            label="Poster image URL (http or https)"
            value={posterUrl}
            onChange={(e) => {
              setPosterUrl(e.target.value);
              setPosterBroken(false); // try again with the new URL
            }}
          />
          <TextField
            id="trailer"
            label="Trailer URL (optional)"
            value={trailerUrl}
            onChange={(e) => setTrailerUrl(e.target.value)}
          />
        </div>

        {/* Live poster preview: the browser tries to load whatever URL is typed */}
        <div>
          <p className="mb-1 text-sm text-slate-300">Poster preview</p>
          <div className="aspect-[2/3] overflow-hidden rounded-xl bg-slate-900">
            {posterUrl.trim() && !posterBroken ? (
              <img
                src={posterUrl.trim()}
                alt="Poster preview"
                className="h-full w-full object-cover"
                onError={() => setPosterBroken(true)}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-3 text-center text-xs text-slate-500">
                {posterBroken
                  ? "This URL isn't an image the browser can load"
                  : "Paste a poster URL"}
              </div>
            )}
          </div>
        </div>
      </div>

      <ErrorBanner message={formError} />

      <div className="flex gap-3">
        <button type="submit" className={btnPrimary} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save movie"}
        </button>
        <Link to="/admin/movies" className={btnSecondary}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
