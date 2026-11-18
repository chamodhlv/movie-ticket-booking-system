import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { getErrorMessage } from "../api/errors";
import TextField from "../components/TextField";

export default function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const location = useLocation();

  // ProtectedRoute remembers where the user wanted to go (e.g. /account)
  // and passes it here, so after login we send them back there instead of Home.
  const from =
    (location.state as { from?: { pathname: string } } | null)?.from
      ?.pathname ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already logged in (or just logged in successfully): go on to the destination.
  if (!isLoading && user) return <Navigate to={from} replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); // stop the browser's default full-page form submit
    setError(null);
    setSubmitting(true);
    try {
      await login({ email, password }); // on success `user` is set and the line above redirects
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-2xl font-bold">Log in</h1>
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl bg-slate-900 p-6"
      >
        <TextField
          id="email"
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          id="password"
          label="Password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-emerald-600 py-2 font-medium hover:bg-emerald-500 disabled:opacity-50"
        >
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-400">
        No account?{" "}
        <Link to="/register" className="text-emerald-400 hover:underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
