import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { fetchAdminUsers, setUserRole } from "../../api/admin";
import { getErrorMessage } from "../../api/errors";
import { ErrorBanner } from "../../components/admin/fields";
import {
  btnLink,
  btnDanger,
  btnSecondary,
} from "../../components/admin/styles";
import { useDebounced } from "../../hooks/useDebounced";
import type { AdminUser } from "../../types/admin";

const ROLE_BADGE: Record<AdminUser["role"], string> = {
  customer: "bg-slate-800 text-slate-300",
  staff: "bg-emerald-950 text-emerald-300",
  admin: "bg-amber-950 text-amber-200",
};

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  // Typing "anna" sends ONE request after you pause, not four.
  const debouncedSearch = useDebounced(search.trim(), 300);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "users", { search: debouncedSearch, page }],
    queryFn: () =>
      fetchAdminUsers({ search: debouncedSearch || undefined, page }),
    placeholderData: keepPreviousData, // keep the old rows on screen while the next ones load
  });

  const changeRole = useMutation({
    mutationFn: (v: { id: string; role: "customer" | "staff" }) =>
      setUserRole(v.id, v.role),
    onSuccess: () => {
      setActionError(null);
      // Refetch every cached page/search of this list so none of them shows the old role.
      return queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err) => setActionError(getErrorMessage(err)),
  });

  function handleRoleChange(u: AdminUser, role: "customer" | "staff") {
    const verb =
      role === "staff"
        ? `Make ${u.name} door staff? They will be able to scan tickets.`
        : `Remove ${u.name} from staff? They will no longer be able to scan tickets.`;
    if (window.confirm(verb)) changeRole.mutate({ id: u.id, role });
  }

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Users</h2>
        <p className="text-sm text-slate-400">
          Make someone door staff so they can scan tickets. The change works
          straight away on the server; the person only needs to reload the site
          to see the "Scan tickets" link.
        </p>
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1); // a new search starts from page 1
        }}
        placeholder="Search by name or e-mail"
        aria-label="Search users"
        className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-emerald-500"
      />

      <ErrorBanner
        message={actionError ?? (error ? getErrorMessage(error) : null)}
      />

      <div className="overflow-x-auto rounded-2xl bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-400">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">E-mail</th>
              <th className="p-3">Role</th>
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
            {data && data.users.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-slate-400">
                  No users found.
                </td>
              </tr>
            )}
            {data?.users.map((u) => (
              <tr key={u.id} className="border-t border-slate-800">
                <td className="p-3 font-medium">{u.name}</td>
                <td className="p-3">{u.email}</td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${ROLE_BADGE[u.role]}`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  {u.role === "customer" && (
                    <button
                      className={btnLink}
                      disabled={changeRole.isPending}
                      onClick={() => handleRoleChange(u, "staff")}
                    >
                      Make staff
                    </button>
                  )}
                  {u.role === "staff" && (
                    <button
                      className={btnDanger}
                      disabled={changeRole.isPending}
                      onClick={() => handleRoleChange(u, "customer")}
                    >
                      Remove staff
                    </button>
                  )}
                  {/* Admins can't be changed here (the server refuses too), so no button. */}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <button
            className={btnSecondary}
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span className="text-slate-400">
            Page {page} of {totalPages} · {data.total} users
          </span>
          <button
            className={btnSecondary}
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
