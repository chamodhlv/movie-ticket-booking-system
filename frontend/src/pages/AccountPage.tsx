import { api } from "../api/client";
import { useAuth } from "../auth/auth-context";

export default function AccountPage() {
  const { user } = useAuth();

  // TEMPORARY dev test: fires 5 requests at the same time (used in Step 10).
  async function fireParallel() {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => api.get("/api/auth/me")),
    );
    console.log(results.map((r) => r.status));
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold">My account</h1>
      <p className="text-slate-300">
        {user?.name} · {user?.email} · role: {user?.role}
      </p>
      <button
        onClick={fireParallel}
        className="mt-6 rounded-lg bg-slate-800 px-3 py-2 text-sm"
      >
        Dev test: 5 parallel requests
      </button>
    </main>
  );
}
