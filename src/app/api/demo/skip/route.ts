import { skipAhead } from "@/lib/demo-clock";
import { forbidden, getSessionUser, unauthorized } from "@/lib/session";

/** Manager demo control: advance the demo clock (3 days by default), decaying stale skills. */
export async function POST(request: Request) {
  const user = getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "manager") return forbidden();

  const body = (await request.json().catch(() => ({}))) as { days?: unknown };
  const days = typeof body.days === "number" ? body.days : undefined;
  return Response.json(skipAhead(days));
}
