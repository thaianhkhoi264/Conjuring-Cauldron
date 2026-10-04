import { NextResponse } from "next/server";

import { getEvaluation } from "@/lib/evaluation/load";
import { writeNarrative } from "@/lib/evaluation/narrative";
import { getSessionUser, unauthorized } from "@/lib/session";

/**
 * The AI-written summary of an evaluation. Employees get their own; managers may ask for anyone's
 * by passing `employeeId`. The facts come from the database, never from the request.
 */
export async function POST(request: Request) {
  const user = getSessionUser(request);
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as { employeeId?: unknown };
  const target = user.role === "manager" && typeof body.employeeId === "string" ? body.employeeId : user.id;

  const evaluation = getEvaluation(target);
  if (!evaluation) return NextResponse.json({ error: "No evaluation for that person." }, { status: 404 });
  return NextResponse.json(await writeNarrative(evaluation));
}
