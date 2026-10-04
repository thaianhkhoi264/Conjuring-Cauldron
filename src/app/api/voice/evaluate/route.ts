import { NextResponse } from "next/server";

import { generateJsonFromSchema } from "@/lib/llm";
import { scoreApplier } from "@/lib/mastery";
import { forbidden, getSessionUser, unauthorized } from "@/lib/session";
import { evaluateCustomerServiceSession } from "@/voice/evaluator";

export async function POST(request: Request) {
  const user = getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "employee") return forbidden();

  const body = (await request.json().catch(() => ({}))) as { sessionId?: string };
  if (!body.sessionId) return NextResponse.json({ error: "A call session is required." }, { status: 400 });

  try {
    const result = await evaluateCustomerServiceSession(body.sessionId, user.id, generateJsonFromSchema, scoreApplier);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to evaluate the call.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
