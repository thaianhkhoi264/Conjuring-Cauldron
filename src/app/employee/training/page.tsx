import Link from "next/link";

import { MasteryBar } from "@/components/mastery-bar";
import { getRetestsDue } from "@/lib/demo-clock";
import { requireEmployee } from "@/lib/require-user";
import { getMastery, STATION_LABELS } from "@/lib/training/data";

export const dynamic = "force-dynamic";

const chapters = [
  { station: "food" as const, blurb: "Build every dish from the Conjuring Cauldron recipe book." },
  { station: "drink" as const, blurb: "Brew potions, lattes and ciders in the right order." },
];

export default async function TrainingHub() {
  const user = await requireEmployee();
  const mastery = getMastery(user.id);
  const retestStations = new Set(getRetestsDue(user.id).map((r) => r.station));
  const anyCertified = Object.values(mastery).some((m) => m && m.score >= 0.8);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <header>
        <Link href="/employee" className="text-sm text-violet-300">
          ← Back
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Training chapters</h1>
        <p className="mt-1 text-sm text-violet-200">
          Reach 80% in any chapter to be certified and added to the schedule. You can train the others at any time.
        </p>
        {anyCertified && <p className="mt-2 text-sm text-emerald-300">You are certified on at least one station.</p>}
      </header>

      <div className="grid gap-4">
        {chapters.map(({ station, blurb }) => (
          <Link
            key={station}
            href={`/employee/training/${station}`}
            className="rounded-lg border border-violet-400/40 bg-violet-950/40 p-5 hover:bg-violet-900/40"
          >
            <h2 className="text-lg font-semibold">
              {STATION_LABELS[station]}
              {retestStations.has(station) && (
                <span className="ml-2 rounded bg-amber-500 px-2 py-0.5 text-xs font-semibold text-black">Retest due</span>
              )}
            </h2>
            <p className="mb-4 mt-1 text-sm text-violet-200">{blurb}</p>
            <MasteryBar score={mastery[station]?.score ?? null} label="Mastery" />
          </Link>
        ))}

        <Link
          href="/employee/training/customer-service"
          className="rounded-lg border border-violet-400/40 bg-violet-950/40 p-5 hover:bg-violet-900/40"
        >
          <h2 className="text-lg font-semibold">
            {STATION_LABELS.cs}
            {retestStations.has("cs") && (
              <span className="ml-2 rounded bg-amber-500 px-2 py-0.5 text-xs font-semibold text-black">Retest due</span>
            )}
          </h2>
          <p className="mb-4 mt-1 text-sm text-violet-200">Practise a live call with a witch customer and receive rubric feedback.</p>
          <MasteryBar score={mastery.cs?.score ?? null} label="Mastery" />
        </Link>
      </div>
    </main>
  );
}
