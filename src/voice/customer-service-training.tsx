"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Spinner, Thinking } from "@/components/ui";
import type { CustomerServiceRubric } from "@/lib/db/types";
import type { CorrectionResult } from "./corrections";
import { CustomerServiceFeedbackCard } from "./customer-service-feedback-card";
import { FallbackCallPlayer } from "./fallback-call";
import { LiveTranscript, type TranscriptLine } from "./live-transcript";
import { voiceScenarios } from "./scenarios";
import { useVapiCall } from "./use-vapi-call";

type Evaluation = {
  rubric: CustomerServiceRubric;
  score: number;
  judgedBy?: "gemini" | "fallback";
  reused: boolean;
  corrections?: CorrectionResult[];
};

type StoredTranscript = {
  ready: boolean;
  graded: boolean;
  customerName: string;
  maxCorrections: number;
  corrections: CorrectionResult[];
  turns: { index: number; speaker: "customer" | "employee" | "system"; text: string; originalText?: string }[];
};

async function postJson<T>(url: string, body: object): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "Something went wrong. Please try again.");
  return result;
}

async function loadTranscript(sessionId: string) {
  const response = await fetch(`/api/voice/transcript?sessionId=${encodeURIComponent(sessionId)}`);
  if (!response.ok) return null;
  return (await response.json()) as StoredTranscript;
}

const POLL_MS = 1500;
const POLL_TRIES = 16;

/** Interactive Customer Service chapter. The server chooses the signed-in employee. */
export function CustomerServiceTraining({ initialScore }: { initialScore: number | null }) {
  const [scenarioId, setScenarioId] = useState("wrong-order");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [stored, setStored] = useState<StoredTranscript | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [corrections, setCorrections] = useState<Record<number, string>>({});
  const { status, session, transcript, partial, error, start, stop } = useVapiCall();
  const selected = voiceScenarios.find((scenario) => scenario.id === scenarioId)!;
  const liveCall = session?.vapi.mode === "live";

  const begin = async () => {
    setEvaluation(null);
    setPageError(null);
    setStored(null);
    setCorrections({});
    await start(scenarioId);
  };

  // After a live call, fetch the finished transcript from the server: it is what the grader will read, and it
  // arrives a moment after the call ends, so try again for a few seconds.
  useEffect(() => {
    if (status !== "ended" || !session || !liveCall || evaluation) return;
    let cancelled = false;
    let tries = 0;
    setWaiting(true);
    const check = async () => {
      const result = await loadTranscript(session.sessionId).catch(() => null);
      if (cancelled) return;
      if (result?.ready) {
        setStored(result);
        setWaiting(false);
        return;
      }
      tries += 1;
      if (tries >= POLL_TRIES) {
        setWaiting(false);
        return;
      }
      timer = window.setTimeout(check, POLL_MS);
    };
    let timer = window.setTimeout(check, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [status, session, liveCall, evaluation]);

  const setCorrection = useCallback((index: number, said: string | null) => {
    setCorrections((current) => {
      const next = { ...current };
      if (said === null) delete next[index];
      else next[index] = said;
      return next;
    });
  }, []);

  const evaluate = async (storeFallback: boolean) => {
    if (!session || submitting) return;
    setSubmitting(true);
    setPageError(null);
    try {
      if (storeFallback) await postJson("/api/voice/fallback", { sessionId: session.sessionId });
      const result = await postJson<Evaluation>("/api/voice/evaluate", {
        sessionId: session.sessionId,
        corrections: Object.entries(corrections).map(([index, said]) => ({ index: Number(index), said })),
      });
      setEvaluation(result);
      if (liveCall) setStored(await loadTranscript(session.sessionId));
    } catch (caught) {
      setPageError(caught instanceof Error ? caught.message : "Unable to score this call.");
    } finally {
      setSubmitting(false);
    }
  };

  const customerName = stored?.customerName ?? selected.customerName;
  const liveLines: TranscriptLine[] = transcript.map((turn) => ({ speaker: turn.speaker, text: turn.text }));
  const storedLines: TranscriptLine[] = (stored?.turns ?? []).map((turn) => ({
    index: turn.index,
    speaker: turn.speaker,
    text: turn.text,
    originalText: turn.originalText,
  }));
  const rejected = Object.fromEntries((evaluation?.corrections ?? []).filter((c) => c.status === "rejected" && c.reason).map((c) => [c.index, c.reason!]));
  const appliedCount = (evaluation?.corrections ?? []).filter((c) => c.status === "applied").length;
  const rejectedCount = (evaluation?.corrections ?? []).filter((c) => c.status === "rejected").length;
  const inCall = status === "connecting" || status === "live";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-violet-400/40 bg-violet-950/40 p-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-violet-300">Customer Service</p>
        <h2 className="mt-1 text-2xl font-bold">Handle a witch-customer call</h2>
        <p className="mt-2 text-sm text-violet-100">Choose a scenario, resolve the concern with warmth and accuracy, then review your rubric feedback. Reach 80% to certify.</p>
        {initialScore !== null && <p className="mt-3 text-sm text-emerald-300">Previous chapter mastery: {Math.round(initialScore * 100)}%</p>}

        <label className="mt-5 block text-sm font-semibold" htmlFor="voice-scenario">Practice scenario</label>
        <select
          id="voice-scenario"
          value={scenarioId}
          disabled={status === "connecting" || status === "live" || status === "demo" || submitting}
          onChange={(event) => setScenarioId(event.target.value)}
          className="mt-2 w-full rounded-lg border border-violet-300/50 bg-slate-950 px-3 py-2 text-sm"
        >
          {voiceScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.title}</option>)}
        </select>
        <p className="mt-3 rounded-lg bg-slate-950/50 p-3 text-sm text-violet-100"><span className="font-semibold">Goal:</span> {selected.goal}</p>

        {status === "idle" || status === "ended" || status === "error" ? (
          <button type="button" onClick={begin} className="mt-5 rounded-lg bg-gradient-to-b from-emerald-300 to-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:brightness-110">
            {status === "ended" ? "Start a new practice call" : "Start practice call"}
          </button>
        ) : null}
        {status === "connecting" && <p className="mt-4 text-sm text-violet-200"><Spinner />Starting your practice call…</p>}
        {status === "live" && <button type="button" onClick={() => void stop()} className="mt-5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white">End call</button>}
        {status === "ended" && session && !evaluation && (
          <button type="button" onClick={() => void evaluate(false)} disabled={submitting} className="ml-3 mt-5 rounded-lg bg-gradient-to-b from-emerald-300 to-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 disabled:opacity-60">
            {submitting ? (<><Spinner />Scoring call…</>) : "Get feedback"}
          </button>
        )}
      </section>

      {status === "demo" && session && !evaluation && (
        <FallbackCallPlayer scenarioId={session.scenario.id} onComplete={() => void evaluate(true)} />
      )}

      {inCall && <LiveTranscript lines={liveLines} partial={partial} customerName={selected.customerName} live={status === "live"} />}

      {status === "ended" && liveCall && !evaluation && (
        <>
          {waiting && !stored && <Thinking label="Fetching your transcript" />}
          {stored && (
            <LiveTranscript
              lines={storedLines}
              customerName={customerName}
              live={false}
              review={{ corrections, max: stored.maxCorrections, onChange: setCorrection }}
            />
          )}
          {!waiting && !stored && liveLines.length > 0 && (
            <>
              <p className="text-sm text-amber-200">The final transcript has not arrived yet, so lines cannot be corrected. You can still press Get feedback.</p>
              <LiveTranscript lines={liveLines} customerName={selected.customerName} live={false} />
            </>
          )}
        </>
      )}

      {(error || pageError) && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">{pageError ?? error}</p>}
      {submitting && <p className="text-sm text-violet-200">{status === "demo" ? "Saving the approved fallback transcript and preparing your feedback…" : "Reading your call and preparing your feedback…"}</p>}
      {evaluation && (
        <>
          {evaluation.judgedBy === "fallback" && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Gemini was unavailable, so this feedback used the deterministic demo rubric.</p>}
          {(appliedCount > 0 || rejectedCount > 0) && (
            <p className="rounded-lg border border-violet-400/40 bg-violet-950/40 p-3 text-sm text-violet-100">
              {appliedCount > 0 && `${appliedCount} transcript fix${appliedCount === 1 ? " was" : "es were"} applied before scoring. `}
              {rejectedCount > 0 && `${rejectedCount} fix${rejectedCount === 1 ? " was" : "es were"} not applied (see the transcript below). `}
              Your manager can see fixes you reported.
            </p>
          )}
          <CustomerServiceFeedbackCard rubric={evaluation.rubric} />
          {stored && stored.ready && (
            <LiveTranscript
              lines={storedLines}
              customerName={customerName}
              live={false}
              review={{ corrections: {}, max: stored.maxCorrections, onChange: () => undefined, rejected, locked: true }}
            />
          )}
          <div className="flex flex-wrap gap-3">
            <Link href="/employee/evaluation" className="rounded-lg bg-gradient-to-b from-emerald-300 to-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950">View my evaluation</Link>
            <button type="button" onClick={begin} className="rounded-lg border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-100">Try another scenario</button>
          </div>
        </>
      )}
    </div>
  );
}
