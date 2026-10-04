import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { callSessions } from "@/lib/db/schema";
import type { TranscriptTurn } from "@/lib/db/types";
import { forbidden, getSessionUser, unauthorized } from "@/lib/session";
import { MAX_CORRECTIONS, type CorrectionResult } from "@/voice/corrections";
import { getVoiceScenario } from "@/voice/scenarios";
import { collapseGrowingTurns } from "@/voice/transcript";

/**
 * The finished transcript of one of your own calls, exactly as the grader will see it, so you can check it for
 * mishearings before asking for feedback. Before the call report has arrived `ready` is false and the page tries
 * again. Once the call is graded, accepted corrections are shown in place with the original wording alongside.
 */
export async function GET(request: Request) {
  const user = getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "employee") return forbidden();

  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "A call session is required." }, { status: 400 });

  const session = db.select().from(callSessions).where(eq(callSessions.id, sessionId)).get();
  if (!session) return NextResponse.json({ error: "Unknown call session." }, { status: 404 });
  if (session.employeeId !== user.id) return forbidden();

  const stored = session.transcriptJson ? (JSON.parse(session.transcriptJson) as TranscriptTurn[]) : [];
  const turns = collapseGrowingTurns(stored);
  const corrections = session.correctionsJson ? (JSON.parse(session.correctionsJson) as CorrectionResult[]) : [];
  const applied = new Map(corrections.filter((c) => c.status === "applied").map((c) => [c.index, c]));

  return NextResponse.json({
    ready: turns.some((turn) => turn.speaker === "employee"),
    graded: session.rubricJson !== null,
    customerName: getVoiceScenario(session.scenarioId)?.customerName ?? "Customer",
    maxCorrections: MAX_CORRECTIONS,
    corrections,
    turns: turns.map((turn, index) => ({
      index,
      speaker: turn.speaker,
      text: applied.get(index)?.said ?? turn.text,
      ...(applied.has(index) ? { originalText: turn.text } : {}),
    })),
  });
}
