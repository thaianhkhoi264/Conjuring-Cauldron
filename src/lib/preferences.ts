import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { employees, messages, preferenceRequests } from "@/lib/db/schema";
import { currentDemoTime } from "@/lib/mastery";
import {
  describePreference,
  hasPreference,
  NO_PREFERENCE,
  parsePreference,
  type EnginePreference,
} from "@/lib/scheduling/preference";

/**
 * Employee scheduling preferences. An employee sends a request; a manager accepts or rejects it; the
 * most recent accepted request is the employee's active preference and the only one the scheduler sees.
 */

type Row = typeof preferenceRequests.$inferSelect;

export type PreferenceRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  preference: EnginePreference;
  description: string;
  note: string;
  status: "pending" | "accepted" | "rejected";
  managerNote: string | null;
  createdAt: string;
  decidedAt: string | null;
};

const MAX_NOTE = 200;

function toPreference(row: Row): EnginePreference {
  return {
    liked: JSON.parse(row.likedSlotsJson) as EnginePreference["liked"],
    avoided: JSON.parse(row.avoidedSlotsJson) as EnginePreference["avoided"],
    days: row.dayPref,
  };
}

function names() {
  return new Map(db.select({ id: employees.id, name: employees.name }).from(employees).all().map((e) => [e.id, e.name]));
}

function toRequest(row: Row, nameOf: Map<string, string>): PreferenceRequest {
  const preference = toPreference(row);
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: nameOf.get(row.employeeId) ?? row.employeeId,
    preference,
    description: describePreference(preference),
    note: row.note,
    status: row.status,
    managerNote: row.managerNote,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
  };
}

function same(a: EnginePreference, b: EnginePreference) {
  const key = (p: EnginePreference) => JSON.stringify([[...p.liked].sort(), [...p.avoided].sort(), p.days]);
  return key(a) === key(b);
}

/** The accepted preference of each employee who has one (the latest accepted request wins). */
export function getActivePreferences(): Map<string, EnginePreference> {
  const result = new Map<string, EnginePreference>();
  const accepted = db
    .select()
    .from(preferenceRequests)
    .where(eq(preferenceRequests.status, "accepted"))
    // Decisions made at the same demo time are told apart by insertion order (rowid), newest first.
    .orderBy(desc(preferenceRequests.decidedAt), desc(sql`rowid`))
    .all();
  for (const row of accepted) {
    if (result.has(row.employeeId)) continue;
    const preference = toPreference(row);
    if (hasPreference(preference)) result.set(row.employeeId, preference);
    else result.set(row.employeeId, NO_PREFERENCE);
  }
  // An accepted "no preference" request clears the preference.
  for (const [id, preference] of result) if (!hasPreference(preference)) result.delete(id);
  return result;
}

export type MyPreferenceState = {
  active: EnginePreference | null;
  pending: PreferenceRequest | null;
  /** The most recent decision, if it was a rejection that came after the active preference. */
  rejected: PreferenceRequest | null;
};

export function getMyPreferenceState(employeeId: string): MyPreferenceState {
  const nameOf = names();
  const rows = db
    .select()
    .from(preferenceRequests)
    .where(eq(preferenceRequests.employeeId, employeeId))
    .orderBy(desc(sql`rowid`))
    .all();
  const pending = rows.find((r) => r.status === "pending") ?? null;
  const decided = rows.filter((r) => r.status !== "pending").sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""));
  const latestDecision = decided[0] ?? null;
  const active = getActivePreferences().get(employeeId) ?? null;
  return {
    active,
    pending: pending ? toRequest(pending, nameOf) : null,
    rejected: latestDecision && latestDecision.status === "rejected" ? toRequest(latestDecision, nameOf) : null,
  };
}

export type SubmitResult = { ok: true; id: string } | { ok: false; error: string };

export function submitPreference(
  employeeId: string,
  input: { liked?: unknown; avoided?: unknown; days?: unknown; note?: unknown },
): SubmitResult {
  const parsed = parsePreference(input);
  if (!parsed.ok) return parsed;
  const note = typeof input.note === "string" ? input.note.trim().slice(0, MAX_NOTE) : "";
  const current = getActivePreferences().get(employeeId) ?? NO_PREFERENCE;
  if (same(parsed.value, current)) return { ok: false, error: "That is already your current preference." };

  const id = randomUUID();
  db.transaction((tx) => {
    // One open request at a time: a new one replaces the old.
    tx.delete(preferenceRequests)
      .where(and(eq(preferenceRequests.employeeId, employeeId), eq(preferenceRequests.status, "pending")))
      .run();
    tx.insert(preferenceRequests)
      .values({
        id,
        employeeId,
        likedSlotsJson: JSON.stringify(parsed.value.liked),
        avoidedSlotsJson: JSON.stringify(parsed.value.avoided),
        dayPref: parsed.value.days,
        note,
        status: "pending",
        createdAt: currentDemoTime(tx),
      })
      .run();
  });
  return { ok: true, id };
}

export function listPendingRequests(): (PreferenceRequest & { current: string })[] {
  const nameOf = names();
  const active = getActivePreferences();
  return db
    .select()
    .from(preferenceRequests)
    .where(eq(preferenceRequests.status, "pending"))
    .orderBy(preferenceRequests.createdAt)
    .all()
    .map((row) => ({ ...toRequest(row, nameOf), current: describePreference(active.get(row.employeeId)) }));
}

export type DecideResult = { ok: true; status: "accepted" | "rejected" } | { ok: false; error: string };

export function decideRequest(id: string, decision: "accept" | "reject", managerNote?: unknown): DecideResult {
  const row = db.select().from(preferenceRequests).where(eq(preferenceRequests.id, id)).get();
  if (!row) return { ok: false, error: "That request no longer exists." };
  if (row.status !== "pending") return { ok: false, error: "That request has already been decided." };

  const status = decision === "accept" ? "accepted" : "rejected";
  const note = typeof managerNote === "string" ? managerNote.trim().slice(0, MAX_NOTE) : "";
  const now = currentDemoTime();
  const preference = toPreference(row);

  db.transaction((tx) => {
    tx.update(preferenceRequests)
      .set({ status, managerNote: note || null, decidedAt: now })
      .where(eq(preferenceRequests.id, id))
      .run();
    const summary = describePreference(preference);
    tx.insert(messages)
      .values({
        id: randomUUID(),
        employeeId: row.employeeId,
        kind: "preference",
        read: false,
        createdAt: now,
        body:
          status === "accepted"
            ? `Your shift preferences were approved (${summary}). They will guide your schedule from the next one on.${note ? ` Manager's note: ${note}` : ""}`
            : `Your shift preference request was not approved this time.${note ? ` Manager's note: ${note}` : ""}`,
      })
      .run();
  });
  return { ok: true, status };
}
