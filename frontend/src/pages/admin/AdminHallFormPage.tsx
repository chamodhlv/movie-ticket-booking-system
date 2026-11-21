import { useState, type FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createHall,
  fetchCinemas,
  fetchHall,
  updateHall,
} from "../../api/admin";
import { getErrorMessage } from "../../api/errors";
import { ErrorBanner, SelectField } from "../../components/admin/fields";
import SeatLayoutEditor from "../../components/admin/SeatLayoutEditor";
import {
  btnPrimary,
  btnSecondary,
  cardClass,
} from "../../components/admin/styles";
import TextField from "../../components/TextField";
import { useInvalidateCatalog } from "../../hooks/useInvalidateCatalog";
import { FORMATS } from "../../lib/options";
import {
  fromApiLayout,
  toApiLayout,
  validateLayout,
  type EditorLayout,
} from "../../lib/seatLayout";
import type { HallDetail } from "../../types/admin";

// Same pattern as the movie form: the outer component loads, the inner one holds the state.
export default function AdminHallFormPage() {
  const { id } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "hall", id],
    queryFn: () => fetchHall(id!),
    enabled: !!id,
  });

  if (id && isLoading) return <p className="text-slate-400">Loading…</p>;
  if (id && error) return <ErrorBanner message={getErrorMessage(error)} />;
  return <HallForm hall={data} />;
}

function HallForm({ hall }: { hall?: HallDetail }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const invalidate = useInvalidateCatalog();

  const { data: cinemas = [] } = useQuery({
    queryKey: ["admin", "cinemas"],
    queryFn: fetchCinemas,
  });

  // A hall can't be moved to another cinema (the server ignores a changed cinema),
  // so the cinema is only selectable while creating.
  const [cinema, setCinema] = useState(
    hall?.cinema ?? params.get("cinema") ?? "",
  );
  const [name, setName] = useState(hall?.name ?? "");
  const [formats, setFormats] = useState<string[]>(hall?.formats ?? ["2D"]);
  const [layout, setLayout] = useState<EditorLayout>(() =>
    hall
      ? fromApiLayout(hall.seatLayout)
      : { columns: 0, aisleCols: [], rows: [] },
  );
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const input = {
        cinema,
        name: name.trim(),
        formats,
        seatLayout: toApiLayout(layout),
      };
      return hall ? updateHall(hall._id, input) : createHall(input);
    },
    onSuccess: async () => {
      await invalidate();
      navigate(`/admin/halls?cinema=${cinema}`);
    },
    // e.g. 409 "This hall has upcoming showtimes, so its seat layout can't be changed."
    onError: (err) => setFormError(getErrorMessage(err)),
  });

  function toggleFormat(f: string) {
    setFormats((current) =>
      current.includes(f) ? current.filter((x) => x !== f) : [...current, f],
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!cinema) return setFormError("Choose a cinema");
    if (formats.length === 0) return setFormError("Pick at least one format");
    const problem = validateLayout(layout);
    if (problem) return setFormError(problem);
    setFormError(null);
    save.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xl font-bold">
        {hall ? `Edit ${hall.name}` : "Add hall"}
      </h2>

      <div className={`${cardClass} space-y-4`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="cinema"
            label="Cinema"
            value={cinema}
            onChange={(e) => setCinema(e.target.value)}
            disabled={!!hall}
            required
          >
            <option value="">Select…</option>
            {cinemas.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name} ({c.city})
              </option>
            ))}
          </SelectField>
          <TextField
            id="hall-name"
            label="Hall name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={50}
            placeholder="Screen 1"
          />
        </div>

        <fieldset>
          <legend className="mb-1 text-sm text-slate-300">
            Formats this hall can show
          </legend>
          <div className="flex flex-wrap gap-4">
            {FORMATS.map((f) => (
              <label key={f} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formats.includes(f)}
                  onChange={() => toggleFormat(f)}
                />
                {f}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className={cardClass}>
        <h3 className="mb-3 font-semibold">Seat layout</h3>
        <SeatLayoutEditor value={layout} onChange={setLayout} />
      </div>

      <ErrorBanner message={formError} />

      <div className="flex gap-3">
        <button type="submit" className={btnPrimary} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save hall"}
        </button>
        <Link
          to={`/admin/halls${cinema ? `?cinema=${cinema}` : ""}`}
          className={btnSecondary}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
