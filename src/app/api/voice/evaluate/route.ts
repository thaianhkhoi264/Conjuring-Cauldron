import { NextResponse } from "next/server";

import { generateJsonFromSchema } from "@/lib/llm";
import { scoreApplier } from "@/lib/mastery";
import { forbidden, getSessionUser, unauthorized } from "@/lib/session";
import { evaluateCustomerServiceSession, type JsonGenerator } from "@/voice/evaluator";

/**
 * Grading is quick with low thinking (a few seconds), so a hung first attempt is cut after 8 s and tried once
 * more; the evaluator falls back to its computed rubric if both fail, so nobody waits more than about 16 s.
 */
const generateRubric: JsonGenerator = async <T,>(schema: object, prompt: string) => {
  const options = { thinking: "low", timeoutMs: 8000 } as const;
  try {
    return await generateJsonFromSchema<T>(schema, prompt, options);
  } catch (first) {
    console.warn("Customer service grading retrying after:", first instanceof Error ? first.message.slice(0, 120) : first);
    return generateJsonFromSchema<T>(schema, prompt, options);
  }
};

export async function POST(request: Request) {
  const user = getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "employee") return forbidden();

  const body = (await request.json().catch(() => ({}))) as { sessionId?: string };
  if (!body.sessionId) return NextResponse.json({ error: "A call session is required." }, { status: 400 });

  try {
    const result = await evaluateCustomerServiceSession(body.sessionId, user.id, generateRubric, scoreApplier);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to evaluate the call.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
