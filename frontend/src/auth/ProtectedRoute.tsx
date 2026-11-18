import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./auth-context";
import type { Role } from "../types/auth";

// Usage in App.tsx:
//   <Route element={<ProtectedRoute />}>                    any logged-in user
//   <Route element={<ProtectedRoute roles={["admin"]} />}>  admins only
export default function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  // Wait for the first "who am I?" answer. Without this, a logged-in user who
  // refreshes the page would be bounced to /login for a split second, because
  // `user` is null until /me responds.
  if (isLoading) return <p className="p-6 text-slate-400">Loading…</p>;

  // Not logged in: go to login, remembering where they wanted to go.
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  // Logged in but the wrong role.
  if (roles && !roles.includes(user.role)) {
    return (
      <p className="p-6 text-red-400">
        403: you don't have access to this page.
      </p>
    );
  }

  // <Outlet /> renders the protected child route.
  return <Outlet />;
}

// IMPORTANT: this only hides pages in the UI. Anyone can still call the API directly
// with any tool, so the real protection is requireAuth/requireRole on the BACKEND.
