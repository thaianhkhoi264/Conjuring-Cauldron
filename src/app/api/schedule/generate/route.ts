import { generateAndSaveSchedule } from "@/lib/scheduling/store";
import { forbidden, getSessionUser, unauthorized } from "@/lib/session";

/** Manager only: regenerate and save the weekly schedule from current skills and availability. */
export async function POST(request: Request) {
  const user = getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "manager") return forbidden();

  const result = generateAndSaveSchedule();
  return Response.json({
    stats: result.stats,
    unfilled: result.unfilled,
    warnings: result.warnings,
    assignments: result.assignments.length,
  });
}
