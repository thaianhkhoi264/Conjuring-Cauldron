import { NextResponse } from "next/server";

import { createEmployeeChatTools, employeeChatSystemPrompt } from "@/lib/chatbot";
import { runAgent } from "@/lib/llm";

export async function POST(request: Request) {
  const body = (await request.json()) as { employeeId?: string; message?: string; confirmCalloff?: boolean };
  if (!body.employeeId || !body.message?.trim()) {
    return NextResponse.json({ error: "An employee and message are required." }, { status: 400 });
  }
  try {
    const result = await runAgent({
      prompt: body.message,
      system: employeeChatSystemPrompt(body.employeeId),
      tools: createEmployeeChatTools(body.employeeId, body.confirmCalloff === true),
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
