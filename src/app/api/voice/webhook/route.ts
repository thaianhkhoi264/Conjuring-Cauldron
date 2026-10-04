import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { callSessions } from "@/lib/db/schema";
import { currentDemoTime } from "@/lib/mastery";
import { collapseGrowingTurns, extractTranscript } from "@/voice/transcript";

type WebhookBody = {
  message?: {
    type?: string;
    call?: {
      metadata?: { callSessionId?: string };
      assistantOverrides?: { variableValues?: { callSessionId?: string } };
    };
  };
  callSessionId?: string;
};

function getSessionId(body: WebhookBody) {
  return body.callSessionId
    ?? body.message?.call?.metadata?.callSessionId
    ?? body.message?.call?.assistantOverrides?.variableValues?.callSessionId;
}

export async function POST(request: Request) {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-conjuring-voice-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized webhook." }, { status: 401 });
  }

  const body = (await request.json()) as WebhookBody;
  const sessionId = getSessionId(body);
  if (!sessionId) return NextResponse.json({ error: "Missing call session id." }, { status: 400 });

  const session = db.select().from(callSessions).where(eq(callSessions.id, sessionId)).get();
  if (!session) return NextResponse.json({ error: "Unknown call session." }, { status: 404 });

  // Only the end-of-call report carries the finished transcript. Vapi also sends updates while someone is still
  // mid-sentence; storing those filled the transcript with growing fragments of the same sentence.
  const messageType = body.message?.type;
  if (messageType !== "end-of-call-report") return NextResponse.json({ ok: true, ignored: messageType ?? "unknown" });
  // A graded call is final: nothing may change the transcript it was scored on.
  if (session.rubricJson) return NextResponse.json({ ok: true, ignored: "already-graded" });

  const transcript = collapseGrowingTurns(extractTranscript(body));

  db.update(callSessions)
    .set({
      ...(transcript.length ? { transcriptJson: JSON.stringify(transcript) } : {}),
      endedAt: currentDemoTime(),
    })
    .where(eq(callSessions.id, sessionId))
    .run();

  return NextResponse.json({ ok: true });
}
