import { NextResponse } from "next/server";

import { createEmployeeChatTools, employeeChatSystemPrompt } from "@/lib/chatbot";
import { runAgent } from "@/lib/llm";
import { forbidden, getSessionUser, unauthorized } from "@/lib/session";

export async function POST(request: Request) {
  const user = getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "employee") return forbidden();

  const body = (await request.json().catch(() => ({}))) as { message?: string; confirmCalloff?: boolean };
  if (!body.message?.trim()) {
    return NextResponse.json({ error: "A message is required." }, { status: 400 });
  }
  try {
    const result = await runAgent({
      prompt: body.message,
      system: employeeChatSystemPrompt(user.id),
      tools: createEmployeeChatTools(user.id, body.confirmCalloff === true),
    });
    const confirmation = result.toolCalls.find((call) => {
      const output = call.result as { requiresConfirmation?: boolean };
      return output?.requiresConfirmation;
    });
    return NextResponse.json({ text: result.text, requiresCalloffConfirmation: Boolean(confirmation), toolCalls: result.toolCalls });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to answer that request." }, { status: 400 });
  }
}
