import { NextResponse } from "next/server";

import { approveCandidate } from "@/lib/calloffs";
import { forbidden, getSessionUser, unauthorized } from "@/lib/session";

/** Manager: approve one ranked candidate. The candidate is notified and must accept. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "manager") return forbidden();

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { candidateId?: unknown };
  if (typeof body.candidateId !== "string") {
    return NextResponse.json({ error: "A candidate is required." }, { status: 400 });
  }

  const result = approveCandidate(id, body.candidateId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ candidate: result.candidateName });
}
