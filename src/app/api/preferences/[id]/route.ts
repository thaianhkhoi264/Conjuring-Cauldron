import { NextResponse } from "next/server";

import { decideRequest } from "@/lib/preferences";
import { forbidden, getSessionUser, unauthorized } from "@/lib/session";

/** Manager: accept or reject an employee's preference request, with an optional note they will see. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "manager") return forbidden();

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { decision?: unknown; note?: unknown };
  if (body.decision !== "accept" && body.decision !== "reject") {
    return NextResponse.json({ error: "Choose accept or reject." }, { status: 400 });
  }

  const result = decideRequest(id, body.decision, body.note);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ status: result.status });
}
