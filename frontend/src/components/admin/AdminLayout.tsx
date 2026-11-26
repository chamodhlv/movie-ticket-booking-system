import { NavLink, Outlet } from "react-router-dom";

const LINKS = [
  { to: "/admin/movies", label: "Movies" },
  { to: "/admin/cinemas", label: "Cinemas" },
  { to: "/admin/halls", label: "Halls & seats" },
  { to: "/admin/showtimes", label: "Showtimes" },
  { to: "/admin/users", label: "Users" },
];

// Sidebar + the page for the current /admin/... URL (rendered at <Outlet />).
// Access control is NOT done here: App.tsx wraps this in <ProtectedRoute roles={["admin"]}>,
// and the real protection is on the backend anyway.
export default function AdminLayout() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row">
      <aside className="md:w-48 md:shrink-0">
        <h1 className="mb-3 text-lg font-bold">Admin</h1>
        <nav className="flex gap-2 md:flex-col">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              // NavLink gives us `isActive`, so the current section is highlighted.
              // It also stays active on nested URLs such as /admin/movies/new.
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm ${isActive ? "bg-emerald-600 text-white" : "text-slate-300 hover:bg-slate-800"}`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
