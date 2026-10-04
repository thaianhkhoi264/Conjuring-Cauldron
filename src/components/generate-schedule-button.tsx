"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/components/ui";

type Summary = {
  stats: { anchorsRequired: number; anchorsFilled: number; shadows: number };
  unfilled: { shiftId: string; station: string }[];
  warnings: string[];
};

export function GenerateScheduleButton({ hasSchedule }: { hasSchedule: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/schedule/generate", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not generate the schedule.");
      setSummary(body as Summary);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the schedule.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="rounded-lg bg-gradient-to-b from-emerald-300 to-emerald-500 px-4 py-2 font-semibold text-emerald-950 hover:brightness-110 disabled:opacity-50"
        >
          {busy ? (<><Spinner />Scheduling...</>) : hasSchedule ? "Regenerate schedule" : "Generate schedule"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      {summary && (
        <div aria-live="polite" className="text-sm">
          <p>
            Filled {summary.stats.anchorsFilled} of {summary.stats.anchorsRequired} required slots
            {summary.stats.shadows ? `, with ${summary.stats.shadows} trainee shadow slot(s)` : ""}.
          </p>
          {summary.unfilled.length > 0 && (
            <p className="text-red-300">{summary.unfilled.length} slot(s) could not be covered by certified staff.</p>
          )}
          {summary.warnings.map((warning) => (
            <p key={warning} className="text-amber-300">
              {warning}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
