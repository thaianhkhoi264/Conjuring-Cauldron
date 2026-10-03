import { NextResponse } from "next/server";

import { createSessionToken, findSessionUser, SESSION_COOKIE } from "@/lib/session";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { employeeId?: string };
  const user = findSessionUser(body.employeeId ?? null);
  if (!user) return NextResponse.json({ error: "Unknown demo account." }, { status: 404 });

  const response = NextResponse.json({ user });
  response.cookies.set(SESSION_COOKIE, createSessionToken(user.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
