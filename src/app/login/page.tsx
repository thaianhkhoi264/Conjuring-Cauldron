import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "manager" ? "/manager" : "/employee");

  const accounts = db
    .select({ id: employees.id, name: employees.name, role: employees.role, isNew: employees.isNew })
    .from(employees)
    .all();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold">Conjuring Cauldron</h1>
      <p>Demo login. Pick a seeded account to explore the employee or manager view.</p>
      {accounts.length ? (
        <LoginForm accounts={accounts} />
      ) : (
        <p role="alert">No demo accounts yet. Run <code>npm run db:push</code> and <code>npm run db:seed</code>.</p>
      )}
    </main>
  );
}
