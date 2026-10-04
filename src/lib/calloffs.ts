import { and, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { assignments, calloffCandidates, calloffs, employees, messages, shifts } from "@/lib/db/schema";
import { currentDemoTime } from "@/lib/mastery";
import { rankReplacements } from "@/lib/scheduling/engine";
import { validateSchedule } from "@/lib/scheduling/rules";
import { loadActiveAssignments, loadScheduleInput } from "@/lib/scheduling/store";
import type { EngineAssignment } from "@/lib/scheduling/types";
import type { Station } from "@/lib/db/types";

/**
 * Call-off workflow:
 *   employee calls off -> engine ranks replacements -> manager approves one ->
 *   replacement accepts (covered) or declines (next candidate is proposed).
 * Every state change is one transaction, and every acceptance is re-validated
 * against the hard scheduling rules before it is stored.
 */

const SLOT_LABEL: Record<string, string> = { open: "open", mid: "mid", close: "close" };
const STATION_LABEL: Record<Station, string> = { food: "Food", drink: "Drinks", cs: "Register" };
const CANDIDATES_PER_ROUND = 3;

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function describeShift(date: string, slot: string) {
  const day = new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${day} ${SLOT_LABEL[slot] ?? slot}`;
}

function notify(employeeIds: string[], kind: string, body: string, executor: Pick<typeof db, "insert"> = db) {
  const createdAt = currentDemoTime();
  for (const employeeId of employeeIds) {
    executor.insert(messages).values({ id: randomUUID(), employeeId, kind, body, read: false, createdAt }).run();
  }
}

function managerIds() {
  return db.select({ id: employees.id }).from(employees).where(eq(employees.role, "manager")).all().map((m) => m.id);
}

function nameOf(employeeId: string) {
  return db.select({ name: employees.name }).from(employees).where(eq(employees.id, employeeId)).get()?.name ?? employeeId;
}

/** An employee calls off one of their own upcoming assignments. */
export function createCalloff(employeeId: string, assignmentId: string, reason: string): Result<{ calloffId: string; needsCover: boolean }> {
  const row = db
    .select({
      id: assignments.id,
      employeeId: assignments.employeeId,
      station: assignments.station,
      role: assignments.role,
      status: assignments.status,
      date: shifts.date,
      slot: shifts.slot,
    })
    .from(assignments)
    .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
    .where(eq(assignments.id, assignmentId))
    .get();

  if (!row || row.employeeId !== employeeId) return fail("That shift was not found on your schedule.");
  if (row.status !== "scheduled") return fail("That shift is already called off or covered.");
  if (row.date < currentDemoTime().slice(0, 10)) return fail("That shift has already passed.");

  const needsCover = row.role === "anchor";
  const calloffId = randomUUID();
  const when = describeShift(row.date, row.slot);
  const who = nameOf(employeeId);

  db.transaction((tx) => {
    tx.update(assignments).set({ status: "called_off" }).where(eq(assignments.id, assignmentId)).run();
    tx.insert(calloffs)
      .values({
        id: calloffId,
        assignmentId,
        reason: reason.trim().slice(0, 200) || "No reason given",
        // A trainee shadow does not need cover, so there is nothing for a manager to resolve.
        status: needsCover ? "open" : "resolved",
        createdAt: currentDemoTime(),
      })
      .run();
    notify(
      managerIds(),
      "calloff",
      needsCover
        ? `${who} called off ${when} (${STATION_LABEL[row.station]}). Review the suggested replacements.`
        : `${who} called off their ${when} shadow shift (${STATION_LABEL[row.station]}). No cover needed.`,
      tx,
    );
  });
  return { ok: true, calloffId, needsCover };
}

function calloffContext(calloffId: string) {
  return db
    .select({
      calloffId: calloffs.id,
      calloffStatus: calloffs.status,
      reason: calloffs.reason,
      createdAt: calloffs.createdAt,
      assignmentId: assignments.id,
      employeeId: assignments.employeeId,
      shiftId: assignments.shiftId,
      station: assignments.station,
      role: assignments.role,
      date: shifts.date,
      slot: shifts.slot,
    })
    .from(calloffs)
    .innerJoin(assignments, eq(calloffs.assignmentId, assignments.id))
    .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
    .where(eq(calloffs.id, calloffId))
    .get();
}

/**
 * Make sure an open call-off has ranked candidates. Existing proposals are kept; when none
 * are waiting (and nobody has been approved) a fresh round is ranked, skipping anyone who
 * already declined.
 */
export function ensureCandidates(calloffId: string) {
  const ctx = calloffContext(calloffId);
  if (!ctx || ctx.calloffStatus !== "open" || ctx.role !== "anchor") return;

  const existing = db.select().from(calloffCandidates).where(eq(calloffCandidates.calloffId, calloffId)).all();
  if (existing.some((c) => c.status === "proposed" || c.status === "approved")) return;

  const input = loadScheduleInput();
  const ranked = rankReplacements(
    input,
    loadActiveAssignments(input),
    { shiftId: ctx.shiftId, station: ctx.station },
    { exclude: [ctx.employeeId, ...existing.map((c) => c.employeeId)], limit: CANDIDATES_PER_ROUND },
  );
  const startRank = existing.reduce((max, c) => Math.max(max, c.rank), 0);

  if (ranked.length === 0) return;
  db.transaction((tx) => {
    ranked.forEach((candidate, index) => {
      tx.insert(calloffCandidates)
        .values({
          id: randomUUID(),
          calloffId,
          employeeId: candidate.employeeId,
          rank: startRank + index + 1,
          rationale: candidate.reasons.join(" "),
          status: "proposed",
        })
        .run();
    });
  });
}

export type InboxCandidate = {
  id: string;
  employeeId: string;
  name: string;
  rank: number;
  rationale: string;
  status: string;
};

export type InboxItem = {
  calloffId: string;
  employeeName: string;
  when: string;
  station: Station;
  stationLabel: string;
  reason: string;
  candidates: InboxCandidate[];
  /** True when nobody qualifies and the manager must find cover another way. */
  noCandidates: boolean;
};

/** Manager inbox: every open call-off with its ranked candidates (ranked on demand). */
export function listOpenCalloffs(): InboxItem[] {
  const open = db.select().from(calloffs).where(eq(calloffs.status, "open")).orderBy(desc(calloffs.createdAt)).all();
  return open.flatMap((c) => {
    ensureCandidates(c.id);
    const ctx = calloffContext(c.id);
    if (!ctx) return [];
    const candidates = db
      .select()
      .from(calloffCandidates)
      .where(eq(calloffCandidates.calloffId, c.id))
      .all()
      .sort((a, b) => a.rank - b.rank)
      .map((cand) => ({
        id: cand.id,
        employeeId: cand.employeeId,
        name: nameOf(cand.employeeId),
        rank: cand.rank,
        rationale: cand.rationale,
        status: cand.status,
      }));
    return [
      {
        calloffId: c.id,
        employeeName: nameOf(ctx.employeeId),
        when: describeShift(ctx.date, ctx.slot),
        station: ctx.station,
        stationLabel: STATION_LABEL[ctx.station],
        reason: ctx.reason,
        candidates,
        noCandidates: !candidates.some((x) => x.status === "proposed" || x.status === "approved"),
      },
    ];
  });
}

/** Manager picks a candidate; the replacement is notified and must accept. */
export function approveCandidate(calloffId: string, candidateId: string): Result<{ candidateName: string }> {
  const ctx = calloffContext(calloffId);
  if (!ctx || ctx.calloffStatus !== "open") return fail("That call-off is not open.");

  const candidates = db.select().from(calloffCandidates).where(eq(calloffCandidates.calloffId, calloffId)).all();
  const chosen = candidates.find((c) => c.id === candidateId);
  if (!chosen) return fail("Unknown candidate.");
  if (chosen.status !== "proposed") return fail("That candidate is no longer available.");
  if (candidates.some((c) => c.status === "approved")) return fail("An offer is already waiting for a reply.");

  db.transaction((tx) => {
    tx.update(calloffCandidates).set({ status: "approved" }).where(eq(calloffCandidates.id, chosen.id)).run();
    notify(
      [chosen.employeeId],
      "calloff-offer",
      `You have been offered the ${describeShift(ctx.date, ctx.slot)} ${STATION_LABEL[ctx.station]} shift. Open your schedule to accept or decline.`,
      tx,
    );
  });
  return { ok: true, candidateName: nameOf(chosen.employeeId) };
}

export type Offer = {
  candidateId: string;
  calloffId: string;
  when: string;
  stationLabel: string;
  coveringFor: string;
};

/** Open offers waiting for this employee's answer. */
export function getMyOffers(employeeId: string): Offer[] {
  const rows = db
    .select()
    .from(calloffCandidates)
    .where(and(eq(calloffCandidates.employeeId, employeeId), eq(calloffCandidates.status, "approved")))
    .all();
  return rows.flatMap((cand) => {
    const ctx = calloffContext(cand.calloffId);
    if (!ctx || ctx.calloffStatus !== "open") return [];
    return [
      {
        candidateId: cand.id,
        calloffId: cand.calloffId,
        when: describeShift(ctx.date, ctx.slot),
        stationLabel: STATION_LABEL[ctx.station],
        coveringFor: nameOf(ctx.employeeId),
      },
    ];
  });
}

/** The replacement answers an offer. Accepting is re-validated against the hard rules. */
export function respondToOffer(candidateId: string, employeeId: string, accept: boolean): Result<{ resolved: boolean }> {
  const cand = db.select().from(calloffCandidates).where(eq(calloffCandidates.id, candidateId)).get();
  if (!cand || cand.employeeId !== employeeId) return fail("That offer was not found.");
  if (cand.status !== "approved") return fail("That offer is no longer open.");
  const ctx = calloffContext(cand.calloffId);
  if (!ctx || ctx.calloffStatus !== "open") return fail("That call-off is already resolved.");

  const who = nameOf(employeeId);
  const when = describeShift(ctx.date, ctx.slot);
  const managers = managerIds();

  if (!accept) {
    db.transaction((tx) => {
      tx.update(calloffCandidates).set({ status: "declined" }).where(eq(calloffCandidates.id, cand.id)).run();
      notify(managers, "calloff-declined", `${who} declined the ${when} ${STATION_LABEL[ctx.station]} shift. Check the inbox for the next option.`, tx);
    });
    ensureCandidates(cand.calloffId); // proposes the next best people, skipping everyone who declined
    return { ok: true, resolved: false };
  }

  // Re-check against the live schedule: things may have changed since the offer was made.
  const input = loadScheduleInput();
  const proposed: EngineAssignment = { shiftId: ctx.shiftId, employeeId, station: ctx.station, role: "anchor" };
  const violations = validateSchedule(input, [...loadActiveAssignments(input), proposed]).filter((v) => v.rule !== "coverage");
  if (violations.length > 0) {
    db.transaction((tx) => {
      tx.update(calloffCandidates).set({ status: "declined" }).where(eq(calloffCandidates.id, cand.id)).run();
      notify(managers, "calloff-declined", `${who} can no longer take the ${when} shift (${violations[0].message}) Check the inbox for the next option.`, tx);
    });
    ensureCandidates(cand.calloffId);
    return fail("That shift no longer fits your schedule. Your manager has been told.");
  }

  db.transaction((tx) => {
    tx.update(calloffCandidates).set({ status: "accepted" }).where(eq(calloffCandidates.id, cand.id)).run();
    tx.update(assignments).set({ status: "covered" }).where(eq(assignments.id, ctx.assignmentId)).run();
    tx.insert(assignments)
      .values({
        id: `asg-${ctx.shiftId}-${ctx.station}-cover-${employeeId}-${cand.id.slice(0, 8)}`,
        shiftId: ctx.shiftId,
        employeeId,
        station: ctx.station,
        role: "anchor",
        status: "scheduled",
      })
      .run();
    tx.update(calloffs).set({ status: "resolved" }).where(eq(calloffs.id, cand.calloffId)).run();
    // Anyone still waiting in the queue no longer needs to be considered.
    tx.update(calloffCandidates)
      .set({ status: "declined" })
      .where(and(eq(calloffCandidates.calloffId, cand.calloffId), eq(calloffCandidates.status, "proposed")))
      .run();
    notify(managers, "calloff-covered", `${who} accepted the ${when} ${STATION_LABEL[ctx.station]} shift. It is covered.`, tx);
    notify([ctx.employeeId], "calloff-covered", `Your ${when} shift is now covered by ${who}.`, tx);
  });
  return { ok: true, resolved: true };
}

export type MyShift = {
  assignmentId: string;
  date: string;
  slot: string;
  when: string;
  station: Station;
  stationLabel: string;
  role: string;
  status: string;
  /** True when the employee can still call this shift off. */
  canCallOff: boolean;
};

/** This employee's upcoming shifts (from the demo date on), including called-off ones. */
export function getMyShifts(employeeId: string): MyShift[] {
  const today = currentDemoTime().slice(0, 10);
  return db
    .select({
      assignmentId: assignments.id,
      date: shifts.date,
      slot: shifts.slot,
      station: assignments.station,
      role: assignments.role,
      status: assignments.status,
    })
    .from(assignments)
    .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
    .where(eq(assignments.employeeId, employeeId))
    .all()
    .filter((a) => a.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || ["open", "mid", "close"].indexOf(a.slot) - ["open", "mid", "close"].indexOf(b.slot))
    .map((a) => ({
      assignmentId: a.assignmentId,
      date: a.date,
      slot: a.slot,
      when: describeShift(a.date, a.slot),
      station: a.station,
      stationLabel: STATION_LABEL[a.station],
      role: a.role,
      status: a.status,
      canCallOff: a.status === "scheduled",
    }));
}

export type MyMessage = { id: string; kind: string; body: string; createdAt: string; read: boolean };

export function getMyMessages(employeeId: string, limit = 8): MyMessage[] {
  return db
    .select()
    .from(messages)
    .where(eq(messages.employeeId, employeeId))
    .orderBy(desc(messages.createdAt))
    .limit(limit)
    .all()
    .map((m) => ({ id: m.id, kind: m.kind, body: m.body, createdAt: m.createdAt, read: m.read }));
}

export function markMessagesRead(employeeId: string, ids: string[]) {
  if (ids.length === 0) return;
  db.update(messages).set({ read: true }).where(and(eq(messages.employeeId, employeeId), inArray(messages.id, ids))).run();
}
