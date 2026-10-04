import { eq } from "drizzle-orm";

import { getMyShifts } from "@/lib/calloffs";
import { db } from "@/lib/db";
import { attempts, employees, mastery, recipes } from "@/lib/db/schema";
import { getRetestsDue } from "@/lib/demo-clock";
import { buildEvaluation, type Evaluation, type EvalAttempt } from "./build";

function parseFeedback(json: string): Record<string, unknown> {
  try {
    const value = JSON.parse(json);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The stored evaluation for one employee, or null if they do not exist. */
export function getEvaluation(employeeId: string): Evaluation | null {
  const employee = db.select().from(employees).where(eq(employees.id, employeeId)).get();
  if (!employee || employee.role !== "employee") return null;

  const masteryRows = db.select().from(mastery).where(eq(mastery.employeeId, employeeId)).all();
  const attemptRows = db.select().from(attempts).where(eq(attempts.employeeId, employeeId)).all();
  const recipeRows = db.select().from(recipes).all();

  const evalAttempts: EvalAttempt[] = attemptRows.map((a) => ({
    station: a.station,
    recipeId: a.recipeId,
    score: a.score,
    createdAt: a.createdAt,
    feedback: parseFeedback(a.feedbackJson),
  }));

  return buildEvaluation({
    name: employee.name,
    isNew: employee.isNew,
    mastery: masteryRows.map((m) => ({ station: m.station, score: m.score, attempts: m.attempts, lastTrainedAt: m.lastTrainedAt })),
    attempts: evalAttempts,
    recipes: recipeRows.map((r) => ({ id: r.id, name: r.name, station: r.station, difficulty: r.difficulty })),
    upcomingShiftCount: getMyShifts(employeeId).filter((s) => s.status === "scheduled").length,
    retestStations: getRetestsDue(employeeId).map((r) => r.station),
  });
}
