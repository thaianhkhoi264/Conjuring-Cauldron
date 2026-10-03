import { NextResponse } from "next/server";

import { generateJsonFromSchema } from "@/lib/llm";
import { scoreApplier } from "@/lib/mastery";
import { evaluateCustomerServiceSession } from "@/voice/evaluator";

export async function POST(request: Request) {
  const body = (await request.json()) as { sessionId?: string };
  if (!body.sessionId) return NextResponse.json({ error: "A call session id is required." }, { status: 400 });

  try {
    const result = await evaluateCustomerServiceSession(body.sessionId, generateJsonFromSchema, scoreApplier);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to evaluate the call.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
