import { NextResponse } from "next/server";

import { commitChanges } from "@/lib/scheduling/apply";
import { forbidden, getSessionUser, unauthorized } from "@/lib/session";

/**
 * Manager only: apply a proposed set of schedule changes. The server re-validates every hard rule
 * against the saved schedule, so a stale or edited proposal is rejected and nothing is written.
 */
export async function POST(request: Request) {
  const user = getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "manager") return forbidden();

  const body = (await request.json().catch(() => ({}))) as { changes?: unknown };
  const result = commitChanges(body.changes);
  if (!result.ok) return NextResponse.json({ error: result.errors.join(" ") }, { status: 400 });
  return NextResponse.json({ applied: result.lines, newGaps: result.newGaps });
}
