"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState, Spinner } from "@/components/ui";

export type PendingPreference = {
  id: string;
  employeeName: string;
  description: string;
  current: string;
  note: string;
};

/** The manager's queue of shift-preference requests. Accepting only changes future schedules (Regenerate to apply). */
export function PreferenceInbox({ items }: { items: PendingPreference[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  async function decide(id: string, decision: "accept" | "reject") {
    setBusy(`${id}:${decision}`);
    setError(null);
    try {
      const response = await fetch(`/api/preferences/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, note: notes[id] ?? "" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save that decision.");
      if (decision === "accept") setAccepted(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that decision.");
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return (
      <>
        {accepted && <p className="mb-3 text-sm text-emerald-300">Approved. Press Regenerate schedule to plan with it.</p>}
        <EmptyState icon="🗓️" title="No preference requests waiting">
          Employees can ask for the shifts and days they like. Requests appear here for you to approve.
        </EmptyState>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      {accepted && <p className="text-sm text-emerald-300">Approved. Press Regenerate schedule to plan with it.</p>}
      {items.map((item) => (
        <article key={item.id} className="rounded-xl border border-violet-400/40 bg-violet-950/40 p-4">
          <h3 className="font-semibold">{item.employeeName} would like to change their shift preferences</h3>
          <p className="mt-1 text-sm">
            <span className="text-violet-300">Asking for: </span>
            {item.description}
          </p>
          <p className="text-sm text-violet-300">Now: {item.current}</p>
          {item.note && <p className="mt-1 text-sm italic text-violet-200">&ldquo;{item.note}&rdquo;</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`note-${item.id}`}>
              Note to {item.employeeName}
            </label>
            <input
              id={`note-${item.id}`}
              value={notes[item.id] ?? ""}
              onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))}
              maxLength={200}
              placeholder="Optional note to them"
              className="min-w-0 flex-1 rounded border border-violet-400/40 bg-violet-950/40 p-2 text-sm"
            />
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => decide(item.id, "accept")}
              className="rounded-lg bg-gradient-to-b from-emerald-300 to-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 disabled:opacity-50"
            >
              {busy === `${item.id}:accept` ? (<><Spinner />Saving...</>) : "Accept"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => decide(item.id, "reject")}
              className="rounded-lg border border-violet-400/60 px-4 py-2 text-sm disabled:opacity-50"
            >
              {busy === `${item.id}:reject` ? (<><Spinner />Saving...</>) : "Reject"}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
