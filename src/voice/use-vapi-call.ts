"use client";

import Vapi from "@vapi-ai/web";
import { useCallback, useEffect, useRef, useState } from "react";

import type { TranscriptTurn } from "@/lib/db/types";
import { mergeTranscript } from "./transcript";
import type { VapiSessionConfig } from "./vapi";

type StartResponse = {
  sessionId: string;
  vapi: VapiSessionConfig;
  scenario: { id: string; title: string; firstMessage: string };
};

type CallStatus = "idle" | "connecting" | "live" | "demo" | "ended" | "error";

function toTurn(message: { type?: string; role?: string; transcript?: string; message?: string }): TranscriptTurn | undefined {
  if (message.type !== "transcript" && message.type !== "conversation-update") return undefined;
  const text = message.transcript ?? message.message;
  if (!text) return undefined;
  return {
    speaker: message.role === "assistant" ? "employee" : "customer",
    text,
  };
}

/** Browser adapter for the Customer Service chapter UI. */
export function useVapiCall() {
  const client = useRef<Vapi | null>(null);
  const [status, setStatus] = useState<CallStatus>("idle");
  const [session, setSession] = useState<StartResponse | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(async () => {
    await client.current?.stop();
    client.current = null;
    setStatus("ended");
  }, []);

  const start = useCallback(async (employeeId: string, scenarioId: string) => {
    setStatus("connecting");
    setError(null);
    setTranscript([]);

    try {
      const response = await fetch("/api/voice/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId, scenarioId }),
      });
      const nextSession = (await response.json()) as StartResponse & { error?: string };
      if (!response.ok) throw new Error(nextSession.error ?? "Unable to start the call.");
      setSession(nextSession);

      if (nextSession.vapi.mode === "demo") {
        setStatus("demo");
        return nextSession;
      }

      const voiceClient = new Vapi(nextSession.vapi.publicKey!);
      client.current = voiceClient;
      voiceClient.on("call-start", () => setStatus("live"));
      voiceClient.on("call-end", () => {
        client.current = null;
        setStatus("ended");
      });
      voiceClient.on("message", (message) => {
        const turn = toTurn(message);
        if (turn) setTranscript((current) => mergeTranscript(current, [turn]));
      });
      voiceClient.on("error", (nextError) => {
        setError(nextError instanceof Error ? nextError.message : "The voice call failed.");
        setStatus("error");
      });
      await voiceClient.start(nextSession.vapi.assistantId, nextSession.vapi.assistantOverrides);
      return nextSession;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start the call.");
      setStatus("error");
      return null;
    }
  }, []);

  useEffect(() => () => { void client.current?.stop(); }, []);

  return { status, session, transcript, error, start, stop };
}
