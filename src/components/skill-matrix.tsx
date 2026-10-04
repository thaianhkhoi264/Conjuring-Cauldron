import Link from "next/link";

import type { SkillMatrixRow } from "@/lib/scheduling/store";

const STATIONS = [
  { key: "food", label: "Food" },
  { key: "drink", label: "Drinks" },
  { key: "cs", label: "Customer service" },
] as const;

function skillClass(score: number | null) {
  if (score === null) return "bg-zinc-900 text-zinc-400";
  if (score >= 0.8) return "bg-emerald-700/70 text-white";
  if (score >= 0.5) return "bg-amber-700/60 text-white";
  return "bg-red-900/60 text-white";
}

/** Heat map of mastery per employee and station. Text values are shown, not just colour. */
export function SkillMatrix({ rows }: { rows: SkillMatrixRow[] }) {
  return (
    <div className="table-wrap overflow-x-auto">
      <table className="data-table w-full min-w-[40rem] text-left text-sm">
        <caption className="sr-only">Team skills by station</caption>
        <thead>
          <tr>
            <th scope="col" className="border border-violet-900 p-2">
              Employee
            </th>
            {STATIONS.map((s) => (
              <th key={s.key} scope="col" className="border border-violet-900 p-2">
                {s.label}
              </th>
            ))}
            <th scope="col" className="border border-violet-900 p-2">
              Hours
            </th>
            <th scope="col" className="border border-violet-900 p-2">
              Preferences
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row" className="border border-violet-900 p-2 font-medium">
                <Link href={`/manager/evaluation/${row.id}`} className="underline decoration-violet-400/60 underline-offset-2 hover:text-violet-200">
                  {row.name}
                </Link>
                {row.isNew && <span className="ml-2 rounded bg-violet-800 px-1.5 py-0.5 text-xs">new</span>}
              </th>
              {STATIONS.map((s) => {
                const score = row.skills[s.key];
                return (
                  <td key={s.key} className={`border border-violet-900 p-2 ${skillClass(score)}`}>
                    {score === null ? "Not started" : `${Math.round(score * 100)}%${score >= 0.8 ? " certified" : ""}`}
                    {row.experience[s.key] > 0 && <span className="block text-xs opacity-80">{Math.round(row.experience[s.key])} shifts</span>}
                  </td>
                );
              })}
              <td className="border border-violet-900 p-2">
                {row.hoursScheduled}/{row.hoursCap}h
              </td>
              <td className="border border-violet-900 p-2 text-xs text-violet-200">{row.preference}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
