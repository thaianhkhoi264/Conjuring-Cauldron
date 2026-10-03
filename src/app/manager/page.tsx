import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/sign-out-button";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ManagerHome() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "manager") redirect("/employee");

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Manager: {user.name}</h1>
        <SignOutButton />
      </header>
      <p>The weekly schedule and call-off inbox will appear here.</p>
    </main>
  );
}
