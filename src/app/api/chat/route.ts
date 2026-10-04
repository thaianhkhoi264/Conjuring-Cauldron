import type { Content } from "@google/genai";
import { NextResponse } from "next/server";

import { createEmployeeChatTools, employeeChatSystemPrompt } from "@/lib/chatbot";
import { LlmUnavailableError, runAgentResilient } from "@/lib/llm";
import { forbidden, getSessionUser, unauthorized } from "@/lib/session";

type Turn = { role: "employee" | "assistant"; text: string };

function parseHistory(raw: unknown): Content[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((turn): turn is Turn => {
      if (!turn || typeof turn !== "object") return false;
      const { role, text } = turn as Record<string, unknown>;
      return (role === "employee" || role === "assistant") && typeof text === "string";
    })
    .slice(-8)
    .map((turn) => ({ role: turn.role === "employee" ? "user" : "model", parts: [{ text: turn.text.slice(0, 1500) }] }));
}

/**
 * Employee assistant. The employee is always the signed-in user. A call-off only goes through when the
 * client sends back the id of the exact shift the assistant asked about (`confirmAssignmentId`).
 */
export async function POST(request: Request) {
  const user = getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "employee") return forbidden();

  const body = (await request.json().catch(() => ({}))) as {
    message?: unknown;
    history?: unknown;
    confirmAssignmentId?: unknown;
    confirmCalloff?: unknown;
  };
  if (typeof body.message !== "string" || !body.message.trim()) {
    return NextResponse.json({ error: "A message is required." }, { status: 400 });
  }
  if (body.message.length > 1000) {
    return NextResponse.json({ error: "Please keep your message under 1000 characters." }, { status: 400 });
  }
  const confirmed = typeof body.confirmAssignmentId === "string" && body.confirmAssignmentId ? body.confirmAssignmentId : false;

  try {
    const result = await runAgentResilient({
      prompt: body.message.trim(),
      system: employeeChatSystemPrompt(user.id),
      tools: createEmployeeChatTools(user.id, confirmed),
      history: parseHistory(body.history),
      thinking: "low",
      maxSteps: 6,
    });

    const pending = result.toolCalls
      .map((call) => call.result as { requiresConfirmation?: boolean; assignment?: { assignmentId?: string }; message?: string })
      .find((output) => output?.requiresConfirmation && output.assignment?.assignmentId);
    const created = result.toolCalls.some((call) => (call.result as { created?: boolean })?.created === true);

    return NextResponse.json({
      text: result.text.trim() || (pending?.message ?? "Done."),
      pendingCalloff: pending ? { assignmentId: pending.assignment!.assignmentId, message: pending.message ?? "" } : null,
      calledOff: created,
    });
  } catch (error) {
    if (error instanceof LlmUnavailableError) {
      return NextResponse.json({
        text:
          error.kind === "rate-limit"
            ? "The assistant has hit its usage limit for a moment. Please try again in a minute. You can still use the My shifts list to call off a shift."
            : "The assistant is busy right now. Please try again shortly. You can still use the My shifts list to call off a shift.",
        pendingCalloff: null,
        calledOff: false,
        unavailable: true,
      });
    }
    console.error("Employee assistant failed:", error instanceof Error ? error.message.slice(0, 300) : error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
