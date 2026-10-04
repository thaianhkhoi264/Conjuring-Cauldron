import Link from "next/link";

import { EmployeeChatbot } from "@/components/employee-chatbot";
import { MasteryBar } from "@/components/mastery-bar";
import { MyPreferences } from "@/components/my-preferences";
import { MyShifts, ShiftOffers } from "@/components/my-shifts";
import { RetestsDue } from "@/components/retests-due";
import { SignOutButton } from "@/components/sign-out-button";
import { getMyMessages, getMyOffers, getMyShifts } from "@/lib/calloffs";
import { getRetestsDue } from "@/lib/demo-clock";
import { getMyPreferenceState } from "@/lib/preferences";
import { describePreference } from "@/lib/scheduling/preference";
import { requireEmployee } from "@/lib/require-user";
import { getMastery, STATION_LABELS } from "@/lib/training/data";

export const dynamic = "force-dynamic";

export default async function EmployeeHome() {
  const user = await requireEmployee();
  const mastery = getMastery(user.id);
  const shifts = getMyShifts(user.id);
  const offers = getMyOffers(user.id);
  const messages = getMyMessages(user.id, 5);
  const retests = getRetestsDue(user.id);
  const prefs = getMyPreferenceState(user.id);
  const stations = (["food", "drink", "cs"] as const).map((station) => ({
    station,
    score: mastery[station]?.score ?? null,
    experience: Math.round(mastery[station]?.experience ?? 0),
  }));
  const certified = stations.filter((s) => (s.score ?? 0) >= 0.8).map((s) => STATION_LABELS[s.station]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Hello, {user.name}</h1>
        <SignOutButton />
      </header>

      {certified.length === 0 && (
        <section className="rounded-lg border border-emerald-400/60 bg-emerald-950/30 p-5" aria-labelledby="start-heading">
          <h2 id="start-heading" className="text-lg font-semibold">
            {stations.some((s) => s.score !== null) ? "Keep training to join the schedule" : "Start your training"}
          </h2>
          <p className="mt-1 text-sm text-emerald-100">
            Reach 80% in one chapter and you will be added to the schedule: Customer Service with one good call, Food or Drinks by passing 3 different recipes. About 5 minutes each.
          </p>
          <Link href="/employee/training" className="mt-3 inline-block rounded bg-emerald-500 px-4 py-2 font-semibold text-black">
            Go to training
          </Link>
        </section>
      )}

      <ShiftOffers offers={offers} />

      <RetestsDue items={retests} />

      <section className="rounded-lg border border-violet-400/40 bg-violet-950/40 p-5" aria-labelledby="shifts-heading">
        <h2 id="shifts-heading" className="mb-3 text-lg font-semibold">
          My shifts
        </h2>
        <MyShifts shifts={shifts} />
      </section>

      <MyPreferences
        key={JSON.stringify(prefs.active)}
        activeText={describePreference(prefs.active ?? undefined)}
        active={prefs.active}
        pending={prefs.pending ? { text: prefs.pending.description, note: prefs.pending.note } : null}
        rejected={prefs.rejected ? { text: prefs.rejected.description, managerNote: prefs.rejected.managerNote } : null}
      />

      <EmployeeChatbot />

      <section className="rounded-lg border border-violet-400/40 bg-violet-950/40 p-5">
        <h2 className="mb-3 text-lg font-semibold">Your skills</h2>
        <div className="grid gap-3">
          {stations.map(({ station, score, experience }) => (
            <div key={station}>
              <MasteryBar score={score} label={STATION_LABELS[station]} />
              {experience > 0 && (
                <p className="mt-1 text-xs text-violet-300">
                  {experience} shift{experience === 1 ? "" : "s"} of experience{experience >= 12 ? ": your skills fade slowly and you rarely need a retest here" : ""}
                </p>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-violet-300">Working shifts counts as practice. The more you work a station, the slower the skill fades.</p>
        <p className="mt-4 text-sm text-violet-200">
          {certified.length
            ? `Certified on: ${certified.join(", ")}. You are ready to be scheduled there.`
            : user.isNew
              ? "Welcome! Pass a chapter (Food and Drinks need 3 different recipes at 80%) to be added to the schedule."
              : "Keep training to stay certified."}
        </p>
        <Link href="/employee/evaluation" className="mr-3 mt-4 inline-block rounded border border-violet-400/60 px-4 py-2">
          View my full evaluation
        </Link>
        <Link href="/employee/training" className="mt-4 inline-block rounded-lg bg-gradient-to-b from-emerald-300 to-emerald-500 px-4 py-2 font-semibold text-emerald-950 hover:brightness-110">
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
