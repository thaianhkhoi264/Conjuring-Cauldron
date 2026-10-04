import type { Content } from "@google/genai";

import { runAgent } from "@/lib/llm";
import { buildAssistantPrompt, createScheduleTools, type Proposal } from "./agent-tools";

export type ChatTurn = { role: "user" | "assistant"; text: string };

export type AssistantResult = {
  reply: string;
  proposal: Proposal | null;
  /** True when the model could not be reached; the UI shows a friendlier hint. */
  unavailable?: boolean;
};

const MAX_HISTORY = 8;
const MAX_TURN_CHARS = 2000;

function isTransient(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  return /"code":\s*(429|500|502|503|504)|high demand|UNAVAILABLE|RESOURCE_EXHAUSTED|fetch failed/i.test(text);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ATTEMPT_TIMEOUT_MS = 30_000;

/** Reject if the model takes too long, so the caller can try the other model. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('{"code":504,"message":"Timed out waiting for the model."}')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Ask Gemini to answer a manager's question or draft schedule changes. The model only gets
 * read tools plus `propose_changes`, which stores a proposal for the manager to apply.
 */
export async function runScheduleAssistant(message: string, history: ChatTurn[] = []): Promise<AssistantResult> {
  const contents: Content[] = history.slice(-MAX_HISTORY).map((turn) => ({
    role: turn.role === "user" ? "user" : "model",
    parts: [{ text: turn.text.slice(0, MAX_TURN_CHARS) }],
  }));

  // Two attempts on different models: if one is slow or overloaded, try the other rather than the same one.
  const tiers = ["pro", "fast"] as const;
  let lastError: unknown;
  for (let attempt = 0; attempt < tiers.length; attempt++) {
    const { tools, getProposal } = createScheduleTools();
    try {
      const result = await withTimeout(
        runAgent({
          prompt: message.slice(0, MAX_TURN_CHARS),
          system: buildAssistantPrompt(),
          tools,
          history: contents,
          tier: tiers[attempt],
          thinking: "low",
          maxSteps: 10,
        }),
        ATTEMPT_TIMEOUT_MS,
      );
      const proposal = getProposal();
      const reply =
        result.text.trim() ||
        (proposal ? "I drafted a change for you to review below." : "I could not put together an answer. Could you rephrase that?");
      return { reply, proposal };
    } catch (error) {
      lastError = error;
      if (!isTransient(error) || attempt === tiers.length - 1) break;
      await wait(1000);
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  console.warn("Schedule assistant failed:", detail.slice(0, 300));
  const rateLimited = /"code":\s*429|RESOURCE_EXHAUSTED|quota/i.test(detail);
  return {
    reply: rateLimited
      ? "The AI service has hit its usage limit for the moment. Please wait a minute and try again. The schedule, Regenerate button and call-off inbox all still work."
      : "The assistant is busy or unavailable right now. The schedule, Regenerate button and call-off inbox all still work.",
    proposal: null,
    unavailable: true,
  };
}
