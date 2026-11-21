import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createCinema,
  deleteCinema,
  fetchCinemas,
  updateCinema,
} from "../../api/admin";
import { getErrorMessage } from "../../api/errors";
import { ErrorBanner } from "../../components/admin/fields";
import {
  btnDanger,
  btnLink,
  btnPrimary,
  btnSecondary,
  cardClass,
} from "../../components/admin/styles";
import TextField from "../../components/TextField";
import { useInvalidateCatalog } from "../../hooks/useInvalidateCatalog";
import type { CinemaInput } from "../../types/admin";
import type { Cinema } from "../../types/catalog";

const EMPTY: CinemaInput = { name: "", city: "", address: "", phone: "" };

export default function AdminCinemasPage() {
  const invalidate = useInvalidateCatalog();
  // `editing`: null = form closed, "new" = creating, otherwise the cinema being edited
  const [editing, setEditing] = useState<Cinema | "new" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    data: cinemas = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin", "cinemas"],
    queryFn: fetchCinemas,
  });

  const remove = useMutation({
    mutationFn: deleteCinema,
    onSuccess: () => {
      setActionError(null);
      return invalidate();
    },
    // e.g. 409 "This cinema still has halls. Delete them first."
    onError: (err) => setActionError(getErrorMessage(err)),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Cinemas</h2>
        {!editing && (
          <button className={btnPrimary} onClick={() => setEditing("new")}>
            + Add cinema
          </button>
        )}
      </div>

      <ErrorBanner
        message={actionError ?? (error ? getErrorMessage(error) : null)}
      />

      {editing && (
        // `key` makes React build a brand new form (fresh state) when you switch
        // from editing one cinema to another, instead of reusing the old form's state.
        <CinemaForm
          key={editing === "new" ? "new" : editing._id}
          cinema={editing === "new" ? undefined : editing}
          onDone={() => setEditing(null)}
        />
      )}

      <div className="overflow-x-auto rounded-2xl bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-400">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">City</th>
              <th className="p-3">Address</th>
              <th className="p-3">Phone</th>
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
            {!isLoading && cinemas.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-slate-400">
                  No cinemas yet.
                </td>
              </tr>
            )}
            {cinemas.map((c) => (
              <tr key={c._id} className="border-t border-slate-800">
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3">{c.city}</td>
                <td className="p-3">{c.address || "—"}</td>
                <td className="p-3">{c.phone || "—"}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <button className={btnLink} onClick={() => setEditing(c)}>
                    Edit
                  </button>
                  <button
                    className={btnDanger}
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete ${c.name}?`))
                        remove.mutate(c._id);
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
    </div>
  );
}

function CinemaForm({
  cinema,
  onDone,
}: {
  cinema?: Cinema;
  onDone: () => void;
}) {
  const invalidate = useInvalidateCatalog();
  const [form, setForm] = useState<CinemaInput>(
    cinema
      ? {
          name: cinema.name,
          city: cinema.city,
          address: cinema.address,
          phone: cinema.phone ?? "",
        }
      : EMPTY,
  );
  const [formError, setFormError] = useState<string | null>(null);

  // One small helper instead of four separate setState functions
  const set = (key: keyof CinemaInput) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = useMutation({
    mutationFn: () =>
      cinema ? updateCinema(cinema._id, form) : createCinema(form),
    onSuccess: async () => {
      await invalidate();
      onDone();
    },
    onError: (err) => setFormError(getErrorMessage(err)),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    save.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className={`${cardClass} space-y-4`}>
      <h3 className="font-semibold">{cinema ? "Edit cinema" : "Add cinema"}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="c-name"
          label="Name"
          value={form.name}
          onChange={set("name")}
          required
          maxLength={100}
        />
        <TextField
          id="c-city"
          label="City"
          value={form.city}
          onChange={set("city")}
          required
          maxLength={60}
        />
        <TextField
          id="c-address"
          label="Address"
          value={form.address}
          onChange={set("address")}
          maxLength={200}
        />
        <TextField
          id="c-phone"
          label="Phone"
          value={form.phone}
          onChange={set("phone")}
          maxLength={30}
        />
      </div>
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
