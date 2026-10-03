import { NextResponse } from "next/server";

import { respondToOffer } from "@/lib/calloffs";
import { forbidden, getSessionUser, unauthorized } from "@/lib/session";

/** Employee: accept or decline a shift offer made after someone called off. */
export async function POST(request: Request, { params }: { params: Promise<{ candidateId: string }> }) {
  const user = getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "employee") return forbidden();

  const { candidateId } = await params;
  const body = (await request.json().catch(() => ({}))) as { accept?: unknown };
  if (typeof body.accept !== "boolean") {
    return NextResponse.json({ error: "Say whether you accept." }, { status: 400 });
  }

  const result = respondToOffer(candidateId, user.id, body.accept);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ resolved: result.resolved });
}
