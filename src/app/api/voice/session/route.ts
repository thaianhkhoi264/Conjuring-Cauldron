import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { callSessions, employees } from "@/lib/db/schema";
import { currentDemoTime } from "@/lib/mastery";
import { forbidden, getSessionUser, unauthorized } from "@/lib/session";
import { getVoiceScenario } from "@/voice/scenarios";
import { createVapiSessionConfig } from "@/voice/vapi";

export async function POST(request: Request) {
  const user = getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "employee") return forbidden();

  const body = (await request.json().catch(() => ({}))) as { scenarioId?: string };
  const scenario = body.scenarioId ? getVoiceScenario(body.scenarioId) : undefined;

  if (!scenario) {
    return NextResponse.json({ error: "A valid scenario is required." }, { status: 400 });
  }

  const employee = db.select({ id: employees.id }).from(employees).where(eq(employees.id, user.id)).get();
  if (!employee) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

  const sessionId = crypto.randomUUID();
  db.insert(callSessions).values({
    id: sessionId,
    employeeId: employee.id,
    scenarioId: scenario.id,
    startedAt: currentDemoTime(),
  }).run();

  return NextResponse.json({
    sessionId,
    scenario: { id: scenario.id, title: scenario.title, firstMessage: scenario.firstMessage },
    vapi: createVapiSessionConfig(sessionId, scenario),
  });
}
