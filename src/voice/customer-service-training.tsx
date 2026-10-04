"use client";

import Link from "next/link";
import { useState } from "react";

import type { CustomerServiceRubric } from "@/lib/db/types";
import { CustomerServiceFeedbackCard } from "./customer-service-feedback-card";
import { FallbackCallPlayer } from "./fallback-call";
import { voiceScenarios } from "./scenarios";
import { useVapiCall } from "./use-vapi-call";

type Evaluation = { rubric: CustomerServiceRubric; score: number; judgedBy?: "gemini" | "fallback"; reused: boolean };

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

/** Interactive Customer Service chapter. The server chooses the signed-in employee. */
export function CustomerServiceTraining({ initialScore }: { initialScore: number | null }) {
  const [scenarioId, setScenarioId] = useState("wrong-order");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const { status, session, error, start, stop } = useVapiCall();
  const selected = voiceScenarios.find((scenario) => scenario.id === scenarioId)!;

  const begin = async () => {
    setEvaluation(null);
    setPageError(null);
    await start(scenarioId);
  };

  const evaluate = async (storeFallback: boolean) => {
    if (!session || submitting) return;
    setSubmitting(true);
    setPageError(null);
    try {
      if (storeFallback) await postJson("/api/voice/fallback", { sessionId: session.sessionId });
      const result = await postJson<Evaluation>("/api/voice/evaluate", { sessionId: session.sessionId });
      setEvaluation(result);
    } catch (caught) {
      setPageError(caught instanceof Error ? caught.message : "Unable to score this call.");
    } finally {
      setSubmitting(false);
    }
  };

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
          <button type="button" onClick={begin} className="mt-5 rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400">
            Start practice call
          </button>
        ) : null}
        {status === "connecting" && <p className="mt-4 text-sm text-violet-200">Starting your practice call…</p>}
        {status === "live" && <button type="button" onClick={() => void stop()} className="mt-5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white">End call</button>}
        {status === "ended" && session && !evaluation && (
          <button type="button" onClick={() => void evaluate(false)} disabled={submitting} className="mt-5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {submitting ? "Scoring call…" : "Get feedback"}
          </button>
        )}
      </section>

      {status === "demo" && session && !evaluation && (
        <FallbackCallPlayer scenarioId={session.scenario.id} onComplete={() => void evaluate(true)} />
      )}

      {(error || pageError) && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">{pageError ?? error}</p>}
      {submitting && <p className="text-sm text-violet-200">Saving the approved fallback transcript and preparing your feedback…</p>}
      {evaluation && (
        <>
          {evaluation.judgedBy === "fallback" && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Gemini was unavailable, so this feedback used the deterministic demo rubric.</p>}
          <CustomerServiceFeedbackCard rubric={evaluation.rubric} />
          <div className="flex flex-wrap gap-3">
            <Link href="/employee/evaluation" className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black">View my evaluation</Link>
            <button type="button" onClick={begin} className="rounded-lg border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-100">Try another scenario</button>
          </div>
        </>
      )}
    </div>
  );
}
