import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { callSessions, employees } from "@/lib/db/schema";
import { currentDemoTime } from "@/lib/mastery";
import { getVoiceScenario } from "@/voice/scenarios";
import { createVapiSessionConfig } from "@/voice/vapi";

export async function POST(request: Request) {
  const body = (await request.json()) as { employeeId?: string; scenarioId?: string };
  const scenario = body.scenarioId ? getVoiceScenario(body.scenarioId) : undefined;

  if (!body.employeeId || !scenario) {
    return NextResponse.json({ error: "A valid employee and scenario are required." }, { status: 400 });
  }

  const employee = db.select({ id: employees.id }).from(employees).where(eq(employees.id, body.employeeId)).get();
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
