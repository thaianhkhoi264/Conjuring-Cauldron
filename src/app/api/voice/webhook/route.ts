import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { callSessions } from "@/lib/db/schema";
import { currentDemoTime } from "@/lib/mastery";
import type { TranscriptTurn } from "@/lib/db/types";
import { extractTranscript, mergeTranscript } from "@/voice/transcript";

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

  const existing = session.transcriptJson ? (JSON.parse(session.transcriptJson) as TranscriptTurn[]) : [];
  const transcript = mergeTranscript(existing, extractTranscript(body));
  const messageType = body.message?.type;

  db.update(callSessions)
    .set({
      transcriptJson: JSON.stringify(transcript),
      ...(messageType === "end-of-call-report" ? { endedAt: currentDemoTime() } : {}),
    })
    .where(eq(callSessions.id, sessionId))
    .run();

  return NextResponse.json({ ok: true });
}
