"use client";

import { useEffect, useState } from "react";

type Narrative = { summary: string; tips: string[]; source: "gemini" | "fallback" };

/** Loads the AI-written summary after the page has rendered, so the report itself is never blocked. */
export function EvaluationNarrative({ employeeId }: { employeeId?: string }) {
  const [narrative, setNarrative] = useState<Narrative | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setNarrative(null);
    fetch("/api/evaluation/narrative", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ employeeId }),
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("failed"))))
      .then((data: Narrative) => {
        if (!cancelled) setNarrative(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId, attempt]);

  if (failed) return null;

  return (
    <section className="rounded-lg border border-violet-400/40 bg-violet-900/30 p-5" aria-labelledby="summary-heading" aria-live="polite">
      <h2 id="summary-heading" className="mb-2 text-lg font-semibold">
        Trainer&apos;s summary
      </h2>
      {!narrative ? (
        <p className="text-sm text-violet-300">Writing the summary...</p>
      ) : (
        <>
          <p>{narrative.summary}</p>
          {narrative.tips.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {narrative.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          )}
          {narrative.source === "fallback" && (
            <p className="mt-3 text-xs text-violet-300">
              Written from the scores (the AI trainer is unavailable right now).{" "}
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="underline">
                Try again
              </button>
            </p>
          )}
        </>
      )}
    </section>
  );
}
