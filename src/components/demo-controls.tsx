"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Summary = {
  from: string;
  to: string;
  days: number;
  decayed: unknown[];
  lostCertifications: { name: string; station: string; before: number; after: number }[];
  retestNotices: number;
};

const STATION_LABEL: Record<string, string> = { food: "Food", drink: "Drinks", cs: "Customer Service" };

export function DemoControls({ demoDate }: { demoDate: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"skip" | "reset" | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "skip" | "reset") {
    if (kind === "reset" && !window.confirm("Reset the demo? This restores the seeded people, skills and an empty schedule.")) return;
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/demo/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: kind === "skip" ? JSON.stringify({ days: 3 }) : undefined,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "That did not work.");
      if (kind === "skip") {
        setSummary(body as Summary);
      } else {
        setSummary(null);
        setNotice("Demo reset to its starting state.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work.");
    } finally {
      setBusy(null);
    }
  }

  const prettyDate = new Date(`${demoDate}T00:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <section className="rounded-lg border border-violet-400/40 bg-violet-950/30 p-4" aria-labelledby="demo-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="demo-heading" className="text-lg font-semibold">
            Demo controls
          </h2>
          <p className="text-sm text-violet-200">
            Demo date: <strong>{prettyDate}</strong>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run("skip")}
            className="rounded bg-violet-500 px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {busy === "skip" ? "Skipping..." : "Skip ahead 3 days"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run("reset")}
            className="rounded border border-violet-400/60 px-4 py-2 disabled:opacity-50"
          >
            {busy === "reset" ? "Resetting..." : "Reset demo"}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}
      {notice && <p className="mt-3 text-sm text-emerald-300">{notice}</p>}
      {summary && (
        <div className="mt-3 text-sm" aria-live="polite">
          <p>
            Moved from {summary.from} to {summary.to}. {summary.decayed.length} skills slipped a little;{" "}
            {summary.retestNotices} employees were asked to retest.
          </p>
          {summary.lostCertifications.length > 0 ? (
            <p className="mt-1 text-amber-300">
              Lost certification:{" "}
              {summary.lostCertifications
                .map((c) => `${c.name} (${STATION_LABEL[c.station] ?? c.station} ${Math.round(c.after * 100)}%)`)
                .join(", ")}
              . Regenerate the schedule to adjust.
            </p>
          ) : (
            <p className="mt-1 text-emerald-300">Everyone stayed certified.</p>
          )}
        </div>
      )}
    </section>
  );
}
