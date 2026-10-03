import { GenerateScheduleButton } from "@/components/generate-schedule-button";
import { ScheduleGrid } from "@/components/schedule-grid";
import { SignOutButton } from "@/components/sign-out-button";
import { SkillMatrix } from "@/components/skill-matrix";
import { requireManager } from "@/lib/require-user";
import { getScheduleView, getSkillMatrix } from "@/lib/scheduling/store";

export const dynamic = "force-dynamic";

export default async function ManagerHome() {
  const user = await requireManager();
  const shifts = getScheduleView();
  const matrix = getSkillMatrix();
  const hasSchedule = shifts.some((s) => s.assignments.length > 0);

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 p-6 md:p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Manager: {user.name}</h1>
        <SignOutButton />
      </header>

      <section className="flex flex-col gap-4" aria-labelledby="schedule-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="schedule-heading" className="text-xl font-semibold">
              Weekly schedule
            </h2>
            <p className="text-sm text-violet-200">
              Shifts are staffed from certified skills, hour caps and availability.
            </p>
          </div>
          <GenerateScheduleButton hasSchedule={hasSchedule} />
        </div>
        <ScheduleGrid shifts={shifts} />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="skills-heading">
        <h2 id="skills-heading" className="text-xl font-semibold">
          Team skills
        </h2>
        <SkillMatrix rows={matrix} />
      </section>
    </main>
  );
}
