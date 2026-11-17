import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

type ReadyResponse = { status: string; mongo: boolean; redis: boolean };

export default function HomePage() {
  const { data, isLoading, isError } = useQuery({
    // queryKey is the cache ID for this request. If another component uses
    // the same key, React Query reuses the cached data instead of calling again.
    queryKey: ["ready"],
    queryFn: async () => (await api.get<ReadyResponse>("/ready")).data,
  });

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl bg-slate-900 p-6 shadow-lg">
        <h1 className="text-2xl font-bold mb-4">🎬 Movie Ticket Booking</h1>

        {isLoading && <p className="text-slate-400">Checking backend…</p>}
        {isError && <p className="text-red-400">Cannot reach the backend.</p>}

        {data && (
          <ul className="space-y-2">
            <li>
              API: <span className="text-emerald-400">{data.status}</span>
            </li>
            <li>MongoDB: {data.mongo ? "✅" : "❌"}</li>
            <li>Redis: {data.redis ? "✅" : "❌"}</li>
          </ul>
        )}
      </div>
    </main>
  );
}
