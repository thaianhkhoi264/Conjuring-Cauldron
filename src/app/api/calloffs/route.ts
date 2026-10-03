import { NextResponse } from "next/server";

import { createCalloff, listOpenCalloffs } from "@/lib/calloffs";
import { forbidden, getSessionUser, unauthorized } from "@/lib/session";

/** Manager: open call-offs with ranked replacement candidates. */
export async function GET(request: Request) {
  const user = getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "manager") return forbidden();
  return NextResponse.json({ calloffs: listOpenCalloffs() });
}

/** Employee: call off one of your own upcoming shifts. */
export async function POST(request: Request) {
  const user = getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "employee") return forbidden();

  const body = (await request.json().catch(() => ({}))) as { assignmentId?: unknown; reason?: unknown };
  if (typeof body.assignmentId !== "string" || !body.assignmentId) {
    return NextResponse.json({ error: "A shift is required." }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason : "";

  const result = createCalloff(user.id, body.assignmentId, reason);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ calloffId: result.calloffId, needsCover: result.needsCover });
}
