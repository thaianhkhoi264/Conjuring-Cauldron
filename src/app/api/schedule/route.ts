import { getScheduleView } from "@/lib/scheduling/store";
import { getSessionUser, unauthorized } from "@/lib/session";

/** The saved weekly schedule, grouped by shift. Any signed-in user may read it. */
export async function GET(request: Request) {
  if (!getSessionUser(request)) return unauthorized();
  return Response.json({ shifts: getScheduleView() });
}
