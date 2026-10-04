import { redirect } from "next/navigation";

import { BubbleBackground } from "@/components/bubble-background";
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
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(to_bottom,#14101f_0%,#171428_55%,#0d2420_100%)]">
      <BubbleBackground />
      <main className="relative z-10 mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-7 p-8 text-center">
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-300/80">A witch&apos;s café</p>
          <h1 className="title-glow pb-1 text-5xl font-extrabold tracking-tight sm:text-6xl">Conjuring Cauldron</h1>
          <p className="text-lg text-violet-100/90">Train. Evaluate. Schedule.</p>
        </div>

        <div className="w-full max-w-sm rounded-2xl border border-emerald-300/25 bg-violet-950/55 p-6 shadow-[0_0_60px_-12px_rgba(16,185,129,0.45)] backdrop-blur-md">
          <p className="mb-4 text-sm text-violet-200">Demo login: pick a seeded account to explore the employee or manager view.</p>
          {accounts.length ? (
            <LoginForm accounts={accounts} />
          ) : (
            <p role="alert">
              No demo accounts yet. Run <code>npm run db:push</code> and <code>npm run db:seed</code>.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
