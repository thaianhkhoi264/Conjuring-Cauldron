import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";

/**
 * Demo-grade login: a signed cookie that holds an employee id. It exists so API
 * routes stop trusting an `employeeId` sent by the client; it is not real auth.
 */
export const SESSION_COOKIE = "cc_session";

export type SessionUser = {
  id: string;
  name: string;
  role: "employee" | "manager";
  isNew: boolean;
};

function secret() {
  // Fine for a local demo. Set SESSION_SECRET anywhere the app is reachable by others.
  return process.env.SESSION_SECRET ?? "conjuring-cauldron-dev-secret";
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createSessionToken(employeeId: string) {
  return `${employeeId}.${sign(employeeId)}`;
}

export function readSessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const employeeId = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(employeeId));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return employeeId;
}

function cookieFromHeader(header: string | null, name: string) {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function findSessionUser(employeeId: string | null): SessionUser | null {
  if (!employeeId) return null;
  const row = db
    .select({ id: employees.id, name: employees.name, role: employees.role, isNew: employees.isNew })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .get();
  return row ?? null;
}

/** For API routes: the signed-in user from the request cookie, or null. */
export function getSessionUser(request: Request): SessionUser | null {
  const token = cookieFromHeader(request.headers.get("cookie"), SESSION_COOKIE);
  return findSessionUser(readSessionToken(token));
}

/** For server components: the signed-in user from `next/headers` cookies, or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return findSessionUser(readSessionToken(store.get(SESSION_COOKIE)?.value));
}

/** Standard 401/403 helpers so routes respond consistently. */
export function unauthorized() {
  return Response.json({ error: "Please sign in." }, { status: 401 });
}

export function forbidden() {
  return Response.json({ error: "You are not allowed to do that." }, { status: 403 });
}
