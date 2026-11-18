import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";

export default function Navbar() {
  const { user, isLoading, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  return (
    <header className="border-b border-slate-800 bg-slate-900">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="text-lg font-bold">
          🎬 CineBook
        </Link>

        <div className="flex items-center gap-4 text-sm">
          {/* Show nothing while we still don't know, to avoid flashing "Login" for a logged-in user */}
          {!isLoading && !user && (
            <>
              <Link to="/login" className="hover:text-emerald-400">
                Login
              </Link>
              <Link
                to="/register"
                className="rounded-lg bg-emerald-600 px-3 py-1.5 hover:bg-emerald-500"
              >
                Sign up
              </Link>
            </>
          )}

          {user && (
            <>
              {user.role === "admin" && (
                <Link to="/admin" className="hover:text-emerald-400">
                  Admin
                </Link>
              )}
              <Link to="/account" className="hover:text-emerald-400">
                {user.name}
              </Link>
              <button
                onClick={handleLogout}
                className="text-slate-400 hover:text-red-400"
              >
                Logout
              </button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
