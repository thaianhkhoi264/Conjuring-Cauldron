import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/sign-out-button";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function EmployeeHome() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "manager") redirect("/manager");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Hello, {user.name}</h1>
        <SignOutButton />
      </header>
      <p>{user.isNew ? "Welcome! Training chapters will appear here." : "Your schedule and retests will appear here."}</p>
    </main>
  );
}
