import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { deleteHall, fetchCinemas, fetchHalls } from "../../api/admin";
import { getErrorMessage } from "../../api/errors";
import { ErrorBanner, SelectField } from "../../components/admin/fields";
import { btnDanger, btnLink, btnPrimary } from "../../components/admin/styles";
import { useInvalidateCatalog } from "../../hooks/useInvalidateCatalog";

export default function AdminHallsPage() {
  const invalidate = useInvalidateCatalog();
  // The chosen cinema lives in the URL (?cinema=...), like the browse filters:
  // the back button works and "Add hall" can carry the cinema to the next page.
  const [params, setParams] = useSearchParams();
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: cinemas = [] } = useQuery({
    queryKey: ["admin", "cinemas"],
    queryFn: fetchCinemas,
  });
  // Until the admin picks one, show the first cinema.
  const cinemaId = params.get("cinema") ?? cinemas[0]?._id ?? "";

  const {
    data: halls = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin", "halls", cinemaId],
    queryFn: () => fetchHalls(cinemaId),
    enabled: !!cinemaId, // nothing to ask for until we know the cinema
  });

  const remove = useMutation({
    mutationFn: deleteHall,
    onSuccess: () => {
      setActionError(null);
      return invalidate();
    },
    // e.g. 409 "This hall has showtimes. Remove them first."
    onError: (err) => setActionError(getErrorMessage(err)),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-xl font-bold">Halls & seat layouts</h2>
        {cinemaId && (
          <Link
            to={`/admin/halls/new?cinema=${cinemaId}`}
            className={btnPrimary}
          >
            + Add hall
          </Link>
        )}
      </div>

      {cinemas.length === 0 ? (
        <p className="text-slate-400">
          Create a cinema first (Cinemas in the sidebar), then add its halls
          here.
        </p>
      ) : (
        <div className="max-w-sm">
          <SelectField
            id="cinema"
            label="Cinema"
            value={cinemaId}
            onChange={(e) => setParams({ cinema: e.target.value })}
          >
            {cinemas.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name} ({c.city})
              </option>
            ))}
          </SelectField>
        </div>
      )}

      <ErrorBanner
        message={actionError ?? (error ? getErrorMessage(error) : null)}
      />

      {cinemaId && (
        <div className="overflow-x-auto rounded-2xl bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="p-3">Hall</th>
                <th className="p-3">Formats</th>
                <th className="p-3">Seats</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={4} className="p-4 text-slate-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && halls.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-4 text-slate-400">
                    This cinema has no halls yet.
                  </td>
                </tr>
              )}
              {halls.map((h) => (
                <tr key={h._id} className="border-t border-slate-800">
                  <td className="p-3 font-medium">{h.name}</td>
                  <td className="p-3">{h.formats.join(", ")}</td>
                  <td className="p-3">{h.capacity}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <Link to={`/admin/halls/${h._id}`} className={btnLink}>
                      Edit
                    </Link>
                    <button
                      className={btnDanger}
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete ${h.name}?`))
                          remove.mutate(h._id);
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
      )}
    </div>
  );
}
