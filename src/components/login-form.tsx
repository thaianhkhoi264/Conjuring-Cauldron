"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useLoginStage } from "@/components/login-stage";

type Account = { id: string; name: string; role: "employee" | "manager"; isNew: boolean };

export function LoginForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const stage = useLoginStage();
  const [employeeId, setEmployeeId] = useState(accounts[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    let user: Account;
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId }),
      });
      if (!response.ok) throw new Error("rejected");
      user = ((await response.json()) as { user: Account }).user;
    } catch {
      setBusy(false);
      setError("Could not sign in. Try reseeding the demo data.");
      return;
    }
    const href = user.role === "manager" ? "/manager" : "/employee";
    // Stay "busy" while the toss-into-the-cauldron sequence plays, so the form cannot be submitted twice.
    if (stage) {
      await stage.play(href);
      return;
    }
    setBusy(false);
    router.push(href);
    router.refresh();
  }

  return (
    <form onSubmit={signIn} className="flex w-full max-w-sm flex-col gap-4 text-left">
      <label className="flex flex-col gap-1 text-sm">
        Choose a demo account
        <select
          value={employeeId}
          onChange={(event) => setEmployeeId(event.target.value)}
          className="rounded-lg border border-violet-300/30 bg-violet-950/60 p-2.5 text-base [color-scheme:dark] outline-none focus:border-emerald-300/70 focus:ring-2 focus:ring-emerald-400/30"
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
        className="rounded-lg bg-gradient-to-r from-emerald-400 to-emerald-500 px-4 py-2.5 font-semibold text-emerald-950 shadow-[0_0_24px_-4px_rgba(52,211,153,0.6)] transition hover:from-emerald-300 hover:to-emerald-400 disabled:opacity-50"
      >
        {busy ? "Signing in..." : "Enter the cauldron"}
      </button>
    </form>
  );
}
