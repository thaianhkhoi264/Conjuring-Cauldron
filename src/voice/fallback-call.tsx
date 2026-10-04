"use client";

import { useEffect, useState } from "react";

import type { TranscriptTurn } from "@/lib/db/types";
import { getVoiceScenario } from "./scenarios";

export function getFallbackCallTranscript(scenarioId: string): TranscriptTurn[] {
  const scenario = getVoiceScenario(scenarioId);
  if (!scenario) throw new Error("Fallback voice scenario is missing.");
  return scenario.fallbackTranscript;
}

/**
 * A deterministic on-screen replay for a venue/network failure. It deliberately
 * shares the same transcript shape as the Vapi flow, so it can be evaluated by
 * the exact same Customer Service rubric.
 */
export function FallbackCallPlayer({ scenarioId, onComplete }: { scenarioId: string; onComplete?: (transcript: TranscriptTurn[]) => void }) {
  const scenario = getVoiceScenario(scenarioId);
  if (!scenario) throw new Error("Fallback voice scenario is missing.");
  const transcript = scenario.fallbackTranscript;
  const [visibleTurns, setVisibleTurns] = useState<TranscriptTurn[]>([]);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    if (visibleTurns.length >= transcript.length) {
      setPlaying(false);
      onComplete?.(transcript);
      return;
    }
    const timer = window.setTimeout(() => {
      setVisibleTurns((current) => [...current, transcript[current.length]]);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [onComplete, playing, transcript, visibleTurns.length]);

  const replay = () => {
    setVisibleTurns([]);
    setPlaying(true);
  };

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5" aria-label="Voice-call demo fallback">
      <p className="text-sm font-semibold uppercase tracking-wide text-amber-800">Demo fallback · {scenario.title}</p>
      <p className="mt-1 text-sm text-amber-950">Use this replay if the live microphone or Vapi call is unavailable. Its transcript follows the normal scoring path.</p>
      <div className="mt-4 space-y-2" aria-live="polite">
        {visibleTurns.map((turn, index) => (
          <p key={`${turn.speaker}-${index}`} className="rounded-lg bg-white px-3 py-2 text-sm text-slate-800">
            <span className="font-semibold">{turn.speaker === "customer" ? scenario.customerName : "Employee"}:</span> {turn.text}
          </p>
        ))}
      </div>
      <button type="button" onClick={replay} disabled={playing} className="mt-4 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {playing ? "Playing fallback…" : visibleTurns.length ? "Replay call" : "Play fallback call"}
      </button>
    </section>
  );
}
