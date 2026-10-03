import { redirect } from "next/navigation";

import { getCurrentUser, type SessionUser } from "@/lib/session";

/** For employee pages: sign-in required; managers are sent to their own home. */
export async function requireEmployee(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "manager") redirect("/manager");
  return user;
}

/** For manager pages: sign-in required; employees are sent to their own home. */
export async function requireManager(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "manager") redirect("/employee");
  return user;
}
