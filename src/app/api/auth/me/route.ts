import { getSessionUser, unauthorized } from "@/lib/session";

export async function GET(request: Request) {
  const user = getSessionUser(request);
  return user ? Response.json({ user }) : unauthorized();
}
