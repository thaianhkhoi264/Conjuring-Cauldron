"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { InboxItem } from "@/lib/calloffs";
import { Spinner, EmptyState } from "@/components/ui";

export function CalloffInbox({ items }: { items: InboxItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function approve(calloffId: string, candidateId: string) {
    setBusyId(candidateId);
    setError(null);
    try {
      const response = await fetch(`/api/calloffs/${calloffId}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidateId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not send that offer.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send that offer.");
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <EmptyState icon="🎉" title="No open call-offs">
        Everyone is on their shift.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      {items.map((item) => {
        const waiting = item.candidates.some((c) => c.status === "approved");
        const firstProposed = item.candidates.find((c) => c.status === "proposed");
        return (
          <article key={item.calloffId} className="rounded-lg border border-amber-400/50 bg-amber-950/20 p-4">
            <h3 className="font-semibold">
              {item.employeeName} called off {item.when} · {item.stationLabel}
            </h3>
            <p className="text-sm text-violet-200">Reason: {item.reason}</p>

            {item.noCandidates ? (
              <p className="mt-3 rounded border border-red-400/60 bg-red-950/40 p-3 text-sm">
                No certified, available team member can cover this without breaking an hours or availability rule. The slot
                shows as &quot;Needs cover&quot; on the schedule.
              </p>
            ) : (
              <ol className="mt-3 space-y-2">
                {item.candidates.map((c) => (
                  <li
                    key={c.id}
                    className={`rounded border p-3 text-sm ${
                      c.status === "declined"
                        ? "border-zinc-700 bg-zinc-900/60 text-zinc-400"
                        : c.status === "approved"
                          ? "border-emerald-400/60 bg-emerald-950/30"
                          : "border-violet-400/40 bg-violet-950/40"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">
                        {c.rank}. {c.name}
                        {c.status === "declined" && <span className="ml-2 font-normal">(declined)</span>}
                        {c.status === "approved" && <span className="ml-2 font-normal text-emerald-300">(offer sent, waiting for reply)</span>}
                      </span>
                      {c.status === "proposed" && !waiting && (
                        <button
                          type="button"
                          disabled={busyId !== null}
                          onClick={() => approve(item.calloffId, c.id)}
                          className={`rounded px-3 py-1 font-semibold disabled:opacity-50 ${
                            c.id === firstProposed?.id ? "bg-emerald-500 text-black" : "border border-violet-400/60"
                          }`}
                        >
                          {busyId === c.id ? (<><Spinner />Sending...</>) : c.id === firstProposed?.id ? "Approve" : "Approve instead"}
                        </button>
                      )}
                    </div>
                    {c.status !== "declined" && <p className="mt-1 text-violet-200">{c.rationale}</p>}
                  </li>
                ))}
              </ol>
            )}
          </article>
        );
      })}
    </div>
  );
}
