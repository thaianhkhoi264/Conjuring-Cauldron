import { NextResponse } from "next/server";

import { getMyPreferenceState, submitPreference } from "@/lib/preferences";
import { forbidden, getSessionUser, unauthorized } from "@/lib/session";

/** Employee: your current preference, any request waiting for approval, and the last rejection. */
export async function GET(request: Request) {
  const user = getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "employee") return forbidden();
  return NextResponse.json(getMyPreferenceState(user.id));
}

/** Employee: ask for shifts or days you would rather work. A manager must approve it before the scheduler uses it. */
export async function POST(request: Request) {
  const user = getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "employee") return forbidden();

  const body = (await request.json().catch(() => ({}))) as { liked?: unknown; avoided?: unknown; days?: unknown; note?: unknown };
  const result = submitPreference(user.id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ id: result.id });
}
