import { NextResponse } from "next/server";

import { runScheduleAssistant, type ChatTurn } from "@/lib/scheduling/agent";
import { forbidden, getSessionUser, unauthorized } from "@/lib/session";

function parseHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((turn): turn is ChatTurn => {
      if (!turn || typeof turn !== "object") return false;
      const { role, text } = turn as Record<string, unknown>;
      return (role === "user" || role === "assistant") && typeof text === "string";
    })
    .slice(-8);
}

/** Manager only: ask the scheduling assistant a question or for a proposed change. */
export async function POST(request: Request) {
  const user = getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "manager") return forbidden();

  const body = (await request.json().catch(() => ({}))) as { message?: unknown; history?: unknown };
  if (typeof body.message !== "string" || !body.message.trim()) {
    return NextResponse.json({ error: "Type a question or request first." }, { status: 400 });
  }
  if (body.message.length > 1000) {
    return NextResponse.json({ error: "Please keep the message under 1000 characters." }, { status: 400 });
  }

  const result = await runScheduleAssistant(body.message.trim(), parseHistory(body.history));
  return NextResponse.json(result);
}
