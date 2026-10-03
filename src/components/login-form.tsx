"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Account = { id: string; name: string; role: "employee" | "manager"; isNew: boolean };

export function LoginForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState(accounts[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ employeeId }),
    });
    setBusy(false);
    if (!response.ok) {
      setError("Could not sign in. Try reseeding the demo data.");
      return;
    }
    const { user } = (await response.json()) as { user: Account };
    router.push(user.role === "manager" ? "/manager" : "/employee");
    router.refresh();
  }

  return (
    <form onSubmit={signIn} className="flex w-full max-w-sm flex-col gap-4 text-left">
      <label className="flex flex-col gap-1 text-sm">
        Choose a demo account
        <select
          value={employeeId}
          onChange={(event) => setEmployeeId(event.target.value)}
          className="rounded border border-violet-400/40 bg-violet-950/40 p-2 text-base"
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} ({account.role === "manager" ? "manager" : account.isNew ? "new hire" : "employee"})
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <button
        type="submit"
        disabled={busy || !employeeId}
        className="rounded bg-violet-500 px-4 py-2 font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Signing in..." : "Enter the cauldron"}
      </button>
    </form>
  );
}
