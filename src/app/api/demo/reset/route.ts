import { resetDemo } from "@/lib/demo-clock";
import { forbidden, getSessionUser, unauthorized } from "@/lib/session";

/** Manager demo control: restore the seeded demo state (clock, people, skills, empty schedule). */
export async function POST(request: Request) {
  const user = getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "manager") return forbidden();

  resetDemo();
  return Response.json({ ok: true });
}
