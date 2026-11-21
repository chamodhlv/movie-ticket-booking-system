import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createShowtime,
  deleteShowtime,
  fetchAdminMovies,
  fetchAdminShowtimes,
  fetchCinemas,
  fetchHall,
  fetchHalls,
  updateShowtime,
} from "../../api/admin";
import { getErrorMessage } from "../../api/errors";
import { ErrorBanner, SelectField } from "../../components/admin/fields";
import {
  btnDanger,
  btnLink,
  btnPrimary,
  btnSecondary,
  cardClass,
  inputClass,
} from "../../components/admin/styles";
import TextField from "../../components/TextField";
import { useInvalidateCatalog } from "../../hooks/useInvalidateCatalog";
import {
  cinemaTimeToIso,
  formatMoney,
  formatTime,
  isoToCinemaTime,
  majorToMinor,
  minorToMajor,
  todayIso,
} from "../../lib/dates";
import { LANGUAGES } from "../../lib/options";
import { SEAT_TYPES, type SeatType } from "../../lib/seatLayout";
import type {
  AdminShowtime,
  HallDetail,
  ShowtimeInput,
} from "../../types/admin";

export default function AdminShowtimesPage() {
  const invalidate = useInvalidateCatalog();
  const [cinemaChoice, setCinemaChoice] = useState("");
  const [hallChoice, setHallChoice] = useState("");
  const [date, setDate] = useState(todayIso());
  const [editing, setEditing] = useState<AdminShowtime | "new" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: cinemas = [] } = useQuery({
    queryKey: ["admin", "cinemas"],
    queryFn: fetchCinemas,
  });
  const cinemaId = cinemaChoice || cinemas[0]?._id || "";

  const { data: halls = [] } = useQuery({
    queryKey: ["admin", "halls", cinemaId],
    queryFn: () => fetchHalls(cinemaId),
    enabled: !!cinemaId,
  });
  // A hall picked earlier might belong to another cinema now: only trust it if it's in the list.
  const hallId =
    halls.find((h) => h._id === hallChoice)?._id ?? halls[0]?._id ?? "";

  const {
    data: showtimes = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin", "showtimes", hallId, date],
    queryFn: () => fetchAdminShowtimes(hallId, date),
    enabled: !!hallId && !!date,
  });

  const remove = useMutation({
    mutationFn: deleteShowtime,
    onSuccess: () => {
      setActionError(null);
      return invalidate();
    },
    onError: (err) => setActionError(getErrorMessage(err)),
  });

  const now = Date.now();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Showtimes</h2>
        {hallId && !editing && (
          <button className={btnPrimary} onClick={() => setEditing("new")}>
            + Add showtime
          </button>
        )}
      </div>

      {cinemas.length === 0 ? (
        <p className="text-slate-400">Create a cinema and a hall first.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField
            id="st-cinema"
            label="Cinema"
            value={cinemaId}
            onChange={(e) => {
              setCinemaChoice(e.target.value);
              setHallChoice("");
              setEditing(null);
            }}
          >
            {cinemas.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name} ({c.city})
              </option>
            ))}
          </SelectField>
          <SelectField
            id="st-hall"
            label="Hall"
            value={hallId}
            onChange={(e) => {
              setHallChoice(e.target.value);
              setEditing(null);
            }}
          >
            {halls.length === 0 && <option value="">No halls</option>}
            {halls.map((h) => (
              <option key={h._id} value={h._id}>
                {h.name}
              </option>
            ))}
          </SelectField>
          <TextField
            id="st-date"
            label="Day"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setEditing(null);
            }}
          />
        </div>
      )}

      <ErrorBanner
        message={actionError ?? (error ? getErrorMessage(error) : null)}
      />

      {editing && hallId && (
        <ShowtimeForm
          key={editing === "new" ? `new-${hallId}-${date}` : editing._id}
          hallId={hallId}
          date={date}
          showtime={editing === "new" ? undefined : editing}
          onDone={() => setEditing(null)}
        />
      )}

      {hallId && (
        <div className="overflow-x-auto rounded-2xl bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="p-3">Time</th>
                <th className="p-3">Movie</th>
                <th className="p-3">Format · language</th>
                <th className="p-3">Prices</th>
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
              {!isLoading && showtimes.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-slate-400">
                    No shows on this day.
                  </td>
                </tr>
              )}
              {showtimes.map((s) => {
                const started = new Date(s.startTime).getTime() < now;
                return (
                  <tr key={s._id} className="border-t border-slate-800">
                    <td className="p-3 whitespace-nowrap">
                      {formatTime(s.startTime)} – {formatTime(s.endTime)}
                      {s.status === "cancelled" && (
                        <span className="ml-2 text-xs text-red-400">
                          cancelled
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-medium">{s.movieTitle}</td>
                    <td className="p-3">
                      {s.format} · {s.language}
                    </td>
                    <td className="p-3 text-slate-300">
                      {SEAT_TYPES.filter((t) => s.prices[t] !== undefined).map(
                        (t) => (
                          <span key={t} className="mr-3 whitespace-nowrap">
                            {t}: {formatMoney(s.prices[t]!)}
                          </span>
                        ),
                      )}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {/* The server refuses to edit a show that already started, so hide the button */}
                      {!started && (
                        <button
                          className={btnLink}
                          onClick={() => setEditing(s)}
                        >
                          Edit
                        </button>
                      )}
                      <button
                        className={btnDanger}
                        disabled={remove.isPending}
                        onClick={() => {
                          if (window.confirm("Delete this showtime?"))
                            remove.mutate(s._id);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Loads what the form needs (the hall's layout and the list of movies you can schedule),
// then hands over to ShowtimeFields, which can start its state from that data.
function ShowtimeForm({
  hallId,
  date,
  showtime,
  onDone,
}: {
  hallId: string;
  date: string;
  showtime?: AdminShowtime;
  onDone: () => void;
}) {
  const invalidate = useInvalidateCatalog();

  // The hall detail tells us which formats are allowed and which seat types need a price.
  const { data: hall } = useQuery({
    queryKey: ["admin", "hall", hallId],
    queryFn: () => fetchHall(hallId),
  });

  // Movies you can schedule: not archived. The public list pages at 50 max, so ask per status.
  const { data: movies = [] } = useQuery({
    queryKey: ["admin", "movies", "schedulable"],
    queryFn: async () => {
      const [nowShowing, upcoming] = await Promise.all([
        fetchAdminMovies({ status: "now_showing", page: 1, limit: 50 }),
        fetchAdminMovies({ status: "upcoming", page: 1, limit: 50 }),
      ]);
      return [...nowShowing.items, ...upcoming.items].sort((a, b) =>
        a.title.localeCompare(b.title),
      );
    },
  });

  if (!hall) return <p className="text-slate-400">Loading hall…</p>;
  return (
    <ShowtimeFields
      hall={hall}
      movies={movies}
      date={date}
      showtime={showtime}
      onDone={onDone}
      invalidate={invalidate}
    />
  );
}

function ShowtimeFields({
  hall,
  movies,
  date,
  showtime,
  onDone,
  invalidate,
}: {
  hall: HallDetail;
  movies: { _id: string; title: string; durationMinutes: number }[];
  date: string;
  showtime?: AdminShowtime;
  onDone: () => void;
  invalidate: () => Promise<unknown>;
}) {
  // Which seat types does this hall actually have? Each needs a price (the server checks too).
  // "standard" is always asked because the API requires it.
  const presentTypes = new Set<SeatType>(["standard"]);
  for (const row of hall.seatLayout.rows)
    for (const s of row.seats) presentTypes.add(s.type);
  const priceTypes = SEAT_TYPES.filter((t) => presentTypes.has(t));

  // When editing, show the stored UTC time as the cinema's local date + time.
  const initial = showtime ? isoToCinemaTime(showtime.startTime) : null;
  const [movie, setMovie] = useState(showtime?.movie ?? "");
  const [day, setDay] = useState(initial?.date ?? date);
  const [time, setTime] = useState(initial?.time ?? "18:00");
  const [language, setLanguage] = useState<string>(
    showtime?.language ?? LANGUAGES[0],
  );
  const [format, setFormat] = useState(
    showtime?.format ?? hall.formats[0] ?? "2D",
  );
  // Prices are typed in major units ("1200.50") and sent as cents.
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      priceTypes.map((t) => [
        t,
        showtime?.prices[t] !== undefined
          ? minorToMajor(showtime.prices[t]!)
          : "",
      ]),
    ),
  );
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (input: ShowtimeInput) =>
      showtime ? updateShowtime(showtime._id, input) : createShowtime(input),
    onSuccess: async () => {
      await invalidate();
      onDone();
    },
    // The server's overlap message is readable already, e.g.
    // "Overlaps with another show in Screen 1 starting Nov 25, 6:00 PM"
    onError: (err) => setFormError(getErrorMessage(err)),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!movie) return setFormError("Choose a movie");
    if (!day || !time) return setFormError("Choose a date and start time");

    const cents: ShowtimeInput["prices"] = {};
    for (const t of priceTypes) {
      const value = majorToMinor(prices[t] ?? "");
      if (value === null)
        return setFormError(`Enter a valid ${t} price, like 1200 or 1200.50`);
      cents[t] = value;
    }
    setFormError(null);
    save.mutate({
      movie,
      hall: hall._id,
      startTime: cinemaTimeToIso(day, time),
      language,
      format,
      prices: cents,
    });
  }

  const chosen = movies.find((m) => m._id === movie);

  return (
    <form onSubmit={handleSubmit} className={`${cardClass} space-y-4`}>
      <h3 className="font-semibold">
        {showtime ? "Edit showtime" : `Add showtime in ${hall.name}`}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="f-movie"
          label="Movie"
          value={movie}
          onChange={(e) => setMovie(e.target.value)}
          required
        >
          <option value="">Select…</option>
          {/* While editing, the show's movie might be archived and so missing from the list */}
          {showtime && !chosen && (
            <option value={showtime.movie}>{showtime.movieTitle}</option>
          )}
          {movies.map((m) => (
            <option key={m._id} value={m._id}>
              {m.title}
            </option>
          ))}
        </SelectField>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            id="f-day"
            label="Date"
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            required
          />
          <TextField
            id="f-time"
            label="Start (cinema time)"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
          />
        </div>
        <SelectField
          id="f-lang"
          label="Language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          {LANGUAGES.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </SelectField>
        <SelectField
          id="f-format"
          label="Format"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        >
          {hall.formats.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </SelectField>
      </div>

      <fieldset>
        <legend className="mb-1 text-sm text-slate-300">
          Ticket prices (one per seat type in this hall)
        </legend>
        <div className="grid gap-3 sm:grid-cols-4">
          {priceTypes.map((t) => (
            <label key={t} className="text-sm">
              <span className="mb-1 block capitalize text-slate-400">{t}</span>
              <input
                inputMode="decimal"
                placeholder="1200.00"
                value={prices[t] ?? ""}
                onChange={(e) =>
                  setPrices((p) => ({ ...p, [t]: e.target.value }))
                }
                className={inputClass}
              />
            </label>
          ))}
        </div>
      </fieldset>

      {chosen && (
        <p className="text-xs text-slate-500">
          Ends about {chosen.durationMinutes + 20} minutes after the start (
          {chosen.durationMinutes} min movie + 20 min cleaning).
        </p>
      )}

      <ErrorBanner message={formError} />
      <div className="flex gap-3">
        <button type="submit" className={btnPrimary} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </button>
        <button type="button" className={btnSecondary} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
