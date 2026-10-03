import { SLOT_TIMES } from "@/lib/slots";
import type { ScheduleViewShift } from "@/lib/scheduling/store";

const SLOTS = ["open", "mid", "close"] as const;
const STATIONS = ["food", "drink", "cs"] as const;
const STATION_LABEL = { food: "Food", drink: "Drinks", cs: "Register" } as const;
const SLOT_LABEL = { open: "Open", mid: "Mid", close: "Close" } as const;

function dayLabel(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function Cell({ shift }: { shift: ScheduleViewShift | undefined }) {
  if (!shift) return <td className="border border-violet-900 p-2" />;

  const rows = STATIONS.flatMap((station) => {
    const inStation = shift.assignments.filter((a) => a.station === station);
    const anchors = inStation.filter((a) => a.role === "anchor" && a.status === "scheduled");
    const shadows = inStation.filter((a) => a.role === "shadow" && a.status === "scheduled");
    const off = inStation.filter((a) => a.status !== "scheduled");
    const missing = Math.max(0, shift.required[station] - anchors.length);
    return [
      ...off.map((a) => ({ key: a.id, station, text: a.employeeName, kind: "off" })),
      ...anchors.map((a) => ({ key: a.id, station, text: a.employeeName, kind: "anchor" })),
      ...shadows.map((a) => ({ key: a.id, station, text: a.employeeName, kind: "shadow" })),
      ...Array.from({ length: missing }, (_, i) => ({ key: `${shift.id}-${station}-gap-${i}`, station, text: "Needs cover", kind: "gap" })),
    ];
  });

  return (
    <td className="border border-violet-900 p-2 align-top">
      {rows.length === 0 ? (
        <span className="text-xs text-violet-400">No staff needed</span>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li
              key={row.key}
              className={`rounded px-2 py-1 text-xs ${
                row.kind === "gap"
                  ? "border border-red-400 bg-red-950/60 text-red-200"
                  : row.kind === "shadow"
                    ? "border border-dashed border-violet-300/60 bg-violet-950/40 text-violet-200"
                    : row.kind === "off"
                      ? "bg-zinc-800 text-zinc-400 line-through"
                      : "bg-violet-800/70"
              }`}
            >
              <span className="font-semibold">{STATION_LABEL[row.station]}</span>: {row.text}
              {row.kind === "shadow" && <span className="ml-1 italic">(shadow)</span>}
            </li>
          ))}
        </ul>
      )}
    </td>
  );
}

export function ScheduleGrid({ shifts }: { shifts: ScheduleViewShift[] }) {
  const dates = [...new Set(shifts.map((s) => s.date))].sort();
  const lookup = new Map(shifts.map((s) => [`${s.date}|${s.slot}`, s]));
  const hasAssignments = shifts.some((s) => s.assignments.length > 0);

  return (
    <div>
      {!hasAssignments && (
        <p className="mb-3 rounded border border-violet-400/40 bg-violet-950/40 p-3 text-sm">
          No schedule yet. Press <strong>Generate schedule</strong> to staff the week from your team&apos;s certified skills.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
          <caption className="sr-only">Weekly schedule by day and shift</caption>
          <thead>
            <tr>
              <th scope="col" className="border border-violet-900 p-2" />
              {dates.map((date) => (
                <th key={date} scope="col" className="border border-violet-900 p-2 font-semibold">
                  {dayLabel(date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SLOTS.map((slot) => (
              <tr key={slot}>
                <th scope="row" className="border border-violet-900 p-2 align-top font-semibold">
                  {SLOT_LABEL[slot]}
                  <div className="text-xs font-normal text-violet-300">
                    {SLOT_TIMES[slot].start} to {SLOT_TIMES[slot].end}
                  </div>
                </th>
                {dates.map((date) => (
                  <Cell key={date} shift={lookup.get(`${date}|${slot}`)} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-violet-300">
        Solid = certified anchor. Dashed = new hire shadowing beside an anchor. Red = still needs cover.
      </p>
    </div>
  );
}
