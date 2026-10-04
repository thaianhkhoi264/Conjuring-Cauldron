import { CalloffInbox } from "@/components/calloff-inbox";
import { DemoControls } from "@/components/demo-controls";
import { GenerateScheduleButton } from "@/components/generate-schedule-button";
import { ScheduleGrid } from "@/components/schedule-grid";
import { ScheduleAssistant } from "@/components/schedule-assistant";
import { ScheduleHealthBanner } from "@/components/schedule-health-banner";
import { SignOutButton } from "@/components/sign-out-button";
import { SkillMatrix } from "@/components/skill-matrix";
import { listOpenCalloffs } from "@/lib/calloffs";
import { getDemoDate } from "@/lib/demo-clock";
import { requireManager } from "@/lib/require-user";
import { getScheduleHealth, getScheduleView, getSkillMatrix } from "@/lib/scheduling/store";

export const dynamic = "force-dynamic";

export default async function ManagerHome() {
  const user = await requireManager();
  const shifts = getScheduleView();
  const matrix = getSkillMatrix();
  const calloffs = listOpenCalloffs();
  const health = getScheduleHealth();
  const hasSchedule = shifts.some((s) => s.assignments.length > 0);

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 p-6 md:p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Manager: {user.name}</h1>
        <SignOutButton />
      </header>

      <DemoControls demoDate={getDemoDate()} />

      <section className="flex flex-col gap-3" aria-labelledby="calloffs-heading">
        <h2 id="calloffs-heading" className="text-xl font-semibold">
          Call-off inbox
        </h2>
        <CalloffInbox items={calloffs} />
      </section>

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
        <ScheduleHealthBanner health={health} />
        <ScheduleGrid shifts={shifts} />
      </section>

      <ScheduleAssistant />

      <section className="flex flex-col gap-3" aria-labelledby="skills-heading">
        <h2 id="skills-heading" className="text-xl font-semibold">
          Team skills
        </h2>
        <SkillMatrix rows={matrix} />
      </section>
    </main>
  );
}
