"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Spinner } from "@/components/ui";

type Slot = "open" | "mid" | "close";
type Choice = "neutral" | "prefer" | "avoid";
type Days = "any" | "weekends" | "weekdays";
type Preference = { liked: Slot[]; avoided: Slot[]; days: Days };

export type MyPreferenceProps = {
  /** Words for the approved preference, e.g. "Prefers closing shifts". */
  activeText: string;
  active: Preference | null;
  pending: { text: string; note: string } | null;
  rejected: { text: string; managerNote: string | null } | null;
};

const SLOTS: { key: Slot; label: string; hours: string }[] = [
  { key: "open", label: "Opening", hours: "7am to 11am" },
  { key: "mid", label: "Midday", hours: "11am to 3pm" },
  { key: "close", label: "Closing", hours: "3pm to 7pm" },
];

function choiceOf(preference: Preference | null, slot: Slot): Choice {
  if (preference?.liked.includes(slot)) return "prefer";
  if (preference?.avoided.includes(slot)) return "avoid";
  return "neutral";
}

/** Employees ask for the shifts and days they like; a manager approves before the scheduler leans on it. */
export function MyPreferences({ activeText, active, pending, rejected }: MyPreferenceProps) {
  const router = useRouter();
  const [choices, setChoices] = useState<Record<Slot, Choice>>({
    open: choiceOf(active, "open"),
    mid: choiceOf(active, "mid"),
    close: choiceOf(active, "close"),
  });
  const [days, setDays] = useState<Days>(active?.days ?? "any");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/preferences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          liked: SLOTS.filter((s) => choices[s.key] === "prefer").map((s) => s.key),
          avoided: SLOTS.filter((s) => choices[s.key] === "avoid").map((s) => s.key),
          days,
          note,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not send that request.");
      setSent(true);
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send that request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-violet-400/40 bg-violet-950/40 p-5" aria-labelledby="prefs-heading">
      <h2 id="prefs-heading" className="text-lg font-semibold">
        My shift preferences
      </h2>
      <p className="mt-1 text-sm text-violet-200">
        Tell your manager which shifts and days you like. Once approved, the scheduler leans toward them when it can, but
        coverage always comes first.
      </p>
      <p className="mt-3 text-sm">
        <span className="text-violet-300">Approved: </span>
        {activeText}
      </p>
      {pending && (
        <p className="mt-2 rounded-lg border border-amber-300/40 bg-amber-950/20 p-2 text-sm">
          Waiting for your manager: {pending.text}
          {pending.note && <span className="italic"> &ldquo;{pending.note}&rdquo;</span>}
        </p>
      )}
      {rejected && !pending && (
        <p className="mt-2 rounded-lg border border-rose-300/40 bg-rose-950/20 p-2 text-sm">
          Your last request ({rejected.text}) was not approved.
          {rejected.managerNote && <span> Manager&apos;s note: {rejected.managerNote}</span>}
        </p>
      )}

      <fieldset className="mt-4 grid gap-2">
        <legend className="mb-1 text-sm font-medium">Shifts</legend>
        {SLOTS.map((slot) => (
          <div key={slot.key} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">
              {slot.label} <span className="text-xs text-violet-300">{slot.hours}</span>
            </span>
            <div className="inline-flex overflow-hidden rounded-lg border border-violet-400/40" role="group" aria-label={`${slot.label} shifts`}>
              {(["prefer", "neutral", "avoid"] as Choice[]).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  aria-pressed={choices[slot.key] === choice}
                  onClick={() => setChoices((current) => ({ ...current, [slot.key]: choice }))}
                  className={`px-3 py-1 text-sm ${
                    choices[slot.key] === choice
                      ? choice === "prefer"
                        ? "bg-emerald-600 text-white"
                        : choice === "avoid"
                          ? "bg-rose-700 text-white"
                          : "bg-violet-700 text-white"
                      : "text-violet-200 hover:bg-violet-800/50"
                  }`}
                >
                  {choice === "prefer" ? "Prefer" : choice === "avoid" ? "Avoid" : "No preference"}
                </button>
              ))}
            </div>
          </div>
        ))}
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="days-pref" className="text-sm font-medium">
          Days
        </label>
        <select
          id="days-pref"
          value={days}
          onChange={(event) => setDays(event.target.value as Days)}
          className="rounded-lg border border-violet-400/40 bg-violet-950/60 p-2 text-sm [color-scheme:dark]"
        >
          <option value="any">No preference</option>
          <option value="weekends">I prefer weekends</option>
          <option value="weekdays">I prefer weekdays</option>
        </select>
      </div>

      <label htmlFor="pref-note" className="mt-4 block text-sm font-medium">
        Note for your manager (optional)
      </label>
      <input
        id="pref-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={200}
        placeholder="For example: I have classes in the morning"
        className="mt-1 w-full rounded border border-violet-400/40 bg-violet-950/40 p-2 text-sm"
      />

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          {error}
        </p>
      )}
      {sent && !error && <p className="mt-2 text-sm text-emerald-300">Request sent. Your manager will review it.</p>}
      <button
        type="button"
        onClick={send}
        disabled={busy}
        className="mt-4 rounded-lg bg-gradient-to-b from-emerald-300 to-emerald-500 px-4 py-2 font-semibold text-emerald-950 disabled:opacity-50"
      >
        {busy ? (<><Spinner />Sending...</>) : "Send request"}
      </button>
    </section>
  );
}
