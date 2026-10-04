"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { MyShift, Offer } from "@/lib/calloffs";
import { Spinner } from "@/components/ui";

export function MyShifts({ shifts }: { shifts: MyShift[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function callOff(assignmentId: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/calloffs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignmentId, reason }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not call off.");
      setOpenId(null);
      setReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not call off.");
    } finally {
      setBusy(false);
    }
  }

  if (shifts.length === 0) {
    return <p className="text-sm text-violet-200">You have no upcoming shifts yet. Your manager will schedule you once you are certified.</p>;
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-300">
          {error}
        </p>
      )}
      <ul className="space-y-2">
        {shifts.map((shift) => (
          <li key={shift.assignmentId} className="rounded border border-violet-400/30 bg-violet-950/30 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={shift.status === "scheduled" ? "" : "text-zinc-400 line-through"}>
                <strong>{shift.when}</strong> · {shift.stationLabel}
                {shift.role === "shadow" && " (shadowing)"}
              </span>
              {shift.status === "called_off" && <span className="text-amber-300">Called off, finding cover</span>}
              {shift.status === "covered" && <span className="text-emerald-300">Covered by a teammate</span>}
              {shift.canCallOff && openId !== shift.assignmentId && (
                <button
                  type="button"
                  onClick={() => {
                    setOpenId(shift.assignmentId);
                    setError(null);
                  }}
                  className="rounded border border-violet-400/60 px-3 py-1"
                >
                  Call off
                </button>
              )}
            </div>
            {openId === shift.assignmentId && (
              <form
                className="mt-3 flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void callOff(shift.assignmentId);
                }}
              >
                <label className="flex flex-col text-xs">
                  Reason (optional)
                  <input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={200}
                    className="mt-1 rounded border border-violet-400/40 bg-violet-950/40 p-2 text-sm"
                  />
                </label>
                <button type="submit" disabled={busy} className="rounded bg-amber-500 px-3 py-2 font-semibold text-black disabled:opacity-50">
                  {busy ? (<><Spinner />Sending...</>) : "Confirm call-off"}
                </button>
                <button type="button" onClick={() => setOpenId(null)} className="rounded border border-violet-400/40 px-3 py-2">
                  Keep my shift
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ShiftOffers({ offers }: { offers: Offer[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(candidateId: string, accept: boolean) {
    setBusyId(candidateId);
    setError(null);
    try {
      const response = await fetch(`/api/offers/${candidateId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accept }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not send your answer.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your answer.");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (offers.length === 0) return null;
  return (
    <section className="rounded-lg border border-emerald-400/60 bg-emerald-950/30 p-5" aria-labelledby="offers-heading">
      <h2 id="offers-heading" className="mb-3 text-lg font-semibold">
        Shift offers
      </h2>
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-300">
          {error}
        </p>
      )}
      <ul className="space-y-3">
        {offers.map((offer) => (
          <li key={offer.candidateId} className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>
              Can you cover <strong>{offer.when}</strong> · {offer.stationLabel} for {offer.coveringFor}?
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => respond(offer.candidateId, true)}
                className="rounded bg-emerald-500 px-3 py-1 font-semibold text-black disabled:opacity-50"
              >
                Accept
              </button>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => respond(offer.candidateId, false)}
                className="rounded border border-violet-400/60 px-3 py-1 disabled:opacity-50"
              >
                Decline
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
