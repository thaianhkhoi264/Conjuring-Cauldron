import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { callSessions } from "@/lib/db/schema";
import { currentDemoTime } from "@/lib/mastery";
import { getVoiceScenario } from "@/voice/scenarios";

/** Stores only the checked-in fallback transcript; clients cannot submit one. */
export async function POST(request: Request) {
  const body = (await request.json()) as { sessionId?: string };
  if (!body.sessionId) return NextResponse.json({ error: "A call session id is required." }, { status: 400 });
  if (process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY && process.env.VAPI_ASSISTANT_ID) {
    return NextResponse.json({ error: "Fallback replay is unavailable while live Vapi is configured." }, { status: 400 });
  }

  const session = db.select().from(callSessions).where(eq(callSessions.id, body.sessionId)).get();
  const scenario = session ? getVoiceScenario(session.scenarioId) : undefined;
  if (!session || !scenario) return NextResponse.json({ error: "Unknown call session." }, { status: 404 });

  const now = currentDemoTime();
  db.update(callSessions)
    .set({ transcriptJson: JSON.stringify(scenario.fallbackTranscript), endedAt: now })
    .where(eq(callSessions.id, session.id))
    .run();
  return NextResponse.json({ ok: true, transcript: scenario.fallbackTranscript });
}
