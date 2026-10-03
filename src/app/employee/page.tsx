import Link from "next/link";

import { MasteryBar } from "@/components/mastery-bar";
import { MyShifts, ShiftOffers } from "@/components/my-shifts";
import { SignOutButton } from "@/components/sign-out-button";
import { getMyMessages, getMyOffers, getMyShifts } from "@/lib/calloffs";
import { requireEmployee } from "@/lib/require-user";
import { getMastery, STATION_LABELS } from "@/lib/training/data";

export const dynamic = "force-dynamic";

export default async function EmployeeHome() {
  const user = await requireEmployee();
  const mastery = getMastery(user.id);
  const shifts = getMyShifts(user.id);
  const offers = getMyOffers(user.id);
  const messages = getMyMessages(user.id, 5);
  const stations = (["food", "drink", "cs"] as const).map((station) => ({ station, score: mastery[station]?.score ?? null }));
  const certified = stations.filter((s) => (s.score ?? 0) >= 0.8).map((s) => STATION_LABELS[s.station]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Hello, {user.name}</h1>
        <SignOutButton />
      </header>

      <ShiftOffers offers={offers} />

      <section className="rounded-lg border border-violet-400/40 bg-violet-950/40 p-5" aria-labelledby="shifts-heading">
        <h2 id="shifts-heading" className="mb-3 text-lg font-semibold">
          My shifts
        </h2>
        <MyShifts shifts={shifts} />
      </section>

      <section className="rounded-lg border border-violet-400/40 bg-violet-950/40 p-5">
        <h2 className="mb-3 text-lg font-semibold">Your skills</h2>
        <div className="grid gap-3">
          {stations.map(({ station, score }) => (
            <MasteryBar key={station} score={score} label={STATION_LABELS[station]} />
          ))}
        </div>
        <p className="mt-4 text-sm text-violet-200">
          {certified.length
            ? `Certified on: ${certified.join(", ")}. You are ready to be scheduled there.`
            : user.isNew
              ? "Welcome! Reach 80% in any chapter to be added to the schedule."
              : "Keep training to stay certified."}
        </p>
        <Link href="/employee/training" className="mt-4 inline-block rounded bg-violet-500 px-4 py-2 font-semibold text-white">
          {user.isNew && certified.length === 0 ? "Start training" : "Go to training"}
        </Link>
      </section>

      {messages.length > 0 && (
        <section className="rounded-lg border border-violet-400/30 bg-violet-950/30 p-5" aria-labelledby="messages-heading">
          <h2 id="messages-heading" className="mb-3 text-lg font-semibold">
            Messages
          </h2>
          <ul className="space-y-2 text-sm">
            {messages.map((m) => (
              <li key={m.id}>{m.body}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
