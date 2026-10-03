import { NextResponse } from "next/server";

import { generateJsonFromSchema } from "@/lib/llm";
import { scoreApplier } from "@/lib/mastery";
import { evaluateCustomerServiceSession } from "@/voice/evaluator";

export async function POST(request: Request) {
  const body = (await request.json()) as { sessionId?: string; employeeId?: string };
  if (!body.sessionId || !body.employeeId) return NextResponse.json({ error: "A call session and employee id are required." }, { status: 400 });

  try {
    const result = await evaluateCustomerServiceSession(body.sessionId, body.employeeId, generateJsonFromSchema, scoreApplier);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to evaluate the call.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
