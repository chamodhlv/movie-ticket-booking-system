import { useAuth } from "../auth/auth-context";

export default function AccountPage() {
  const { user } = useAuth();

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold">My account</h1>
      <p className="text-slate-300">
        {user?.name} · {user?.email} · role: {user?.role}
      </p>
    </main>
  );
}
