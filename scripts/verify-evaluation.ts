import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildEvaluation, toMillis, type EvalAttempt, type EvalInput } from "../src/lib/evaluation/build";
import { fallbackNarrative, writeNarrative } from "../src/lib/evaluation/narrative";

// Uses a throwaway database in the OS temp folder; never the real dev database. No Gemini calls.
process.env.DATABASE_URL = join(mkdtempSync(join(tmpdir(), "conjuring-cauldron-eval-")), "test.db");
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_GENAI_USE_VERTEXAI;

const recipes: EvalInput["recipes"] = [
  { id: "burger", name: "Cauldron Burger", station: "food", difficulty: 2 },
  { id: "fries", name: "Broomstick Fries", station: "food", difficulty: 1 },
  { id: "fizz", name: "Moonwater Fizz", station: "drink", difficulty: 1 },
  { id: "latte", name: "Love Potion Latte", station: "drink", difficulty: 3 },
];

const base = (overrides: Partial<EvalInput> = {}): EvalInput => ({
  name: "Test Person",
  isNew: false,
  mastery: [],
  attempts: [],
  recipes,
  upcomingShiftCount: 0,
  retestStations: [],
  ...overrides,
});

const attempt = (station: EvalAttempt["station"], recipeId: string | null, score: number, at: string, feedback: Record<string, unknown> = {}): EvalAttempt => ({
  station,
  recipeId,
  score,
  createdAt: at,
  feedback,
});

// Timestamps from SQL defaults and from the demo clock sort together.
assert.ok(toMillis("2026-10-03 09:00:00") > 0);
assert.equal(toMillis("2026-10-03 09:00:00"), toMillis("2026-10-03T09:00:00.000Z"));
assert.equal(toMillis("garbage"), 0);

// 1. Brand-new hire with no training.
{
  const ev = buildEvaluation(base({ isNew: true }));
  assert.equal(ev.hasData, false);
  assert.match(ev.headline, /Start your first chapter/);
  assert.equal(ev.notStarted.length, 3);
  assert.deepEqual(ev.canStartNow, []);
  assert.match(ev.schedulingStatus, /Not yet schedulable/);
  assert.equal(ev.stations.every((s) => s.score === null && !s.certified), true);
}

// 2. Part-way through Food as a new hire: can shadow, not schedulable as an anchor.
{
  const ev = buildEvaluation(
    base({
      isNew: true,
      mastery: [{ station: "food", score: 0.6, attempts: 2, lastTrainedAt: "2026-10-02T09:00:00.000Z" }],
      attempts: [attempt("food", "burger", 0.5, "2026-10-01T09:00:00.000Z"), attempt("food", "burger", 0.7, "2026-10-02T09:00:00.000Z")],
    }),
  );
  assert.equal(ev.hasData, true);
  assert.match(ev.headline, /reach 80%/);
  assert.deepEqual(ev.canStartNow.map((c) => [c.station, c.role]), [["food", "shadow"]]);
  assert.equal(ev.needsImprovement.length, 1);
  assert.ok(Math.abs(ev.needsImprovement[0].gapToCertify - 0.2) < 1e-9);
  assert.match(ev.needsImprovement[0].suggestion, /Cauldron Burger/);
  assert.equal(ev.stations[0].trend, "up");
  assert.deepEqual(ev.notStarted.map((n) => n.station), ["drink", "cs"]);
  assert.match(ev.schedulingStatus, /Not yet schedulable/);
}

// 3. A non-new employee below the line cannot shadow (shadowing is for new hires only).
{
  const ev = buildEvaluation(base({ mastery: [{ station: "food", score: 0.6, attempts: 1, lastTrainedAt: null }], attempts: [attempt("food", "burger", 0.6, "2026-10-01T09:00:00.000Z")] }));
  assert.deepEqual(ev.canStartNow, []);
}

// 4. Certified, fast, excellent builds: strengths, anchor role, scheduling status.
{
  const feedback = { accuracy: 1, speed: 1, facts: { missing: [], extra: [], outOfOrder: [] } };
  const ev = buildEvaluation(
    base({
      mastery: [{ station: "drink", score: 0.92, attempts: 2, lastTrainedAt: "2026-10-02T09:00:00.000Z" }],
      attempts: [attempt("drink", "fizz", 0.95, "2026-10-01T09:00:00.000Z", feedback), attempt("drink", "latte", 0.9, "2026-10-02T09:00:00.000Z", feedback)],
      upcomingShiftCount: 3,
    }),
  );
  assert.ok(ev.strengths.some((s) => s.startsWith("Drinks: 92%")));
  assert.ok(ev.strengths.some((s) => s.includes("Moonwater Fizz (95%)")));
  assert.ok(ev.strengths.some((s) => s.includes("finish within the target time")));
  assert.deepEqual(ev.canStartNow.map((c) => [c.station, c.role]), [["drink", "anchor"]]);
  assert.match(ev.headline, /ready for the schedule/);
  assert.equal(ev.schedulingStatus, "You have 3 upcoming shifts.");
  assert.equal(ev.stations[1].certified, true);
}

// 5. Certified but nobody has scheduled them yet.
{
  const ev = buildEvaluation(base({ mastery: [{ station: "food", score: 0.85, attempts: 1, lastTrainedAt: null }], attempts: [attempt("food", "fries", 0.85, "2026-10-01T09:00:00.000Z")] }));
  assert.match(ev.schedulingStatus, /Certified and waiting/);
}

// 6. Repeated mistakes become weaknesses; a single slip does not.
{
  const slip = (missing: string[], speed = 0.4) => ({ accuracy: 0.6, speed, facts: { missing, extra: ["Ice"], outOfOrder: [] } });
  const ev = buildEvaluation(
    base({
      mastery: [{ station: "food", score: 0.55, attempts: 3, lastTrainedAt: null }],
      attempts: [
        attempt("food", "burger", 0.5, "2026-10-01T09:00:00.000Z", slip(["Goblin cheese"])),
        attempt("food", "burger", 0.55, "2026-10-02T09:00:00.000Z", slip(["Goblin cheese", "Top bun"])),
        attempt("food", "fries", 0.55, "2026-10-03T09:00:00.000Z", slip([])),
      ],
    }),
  );
  assert.ok(ev.weaknesses.some((w) => w.includes("keep forgetting Goblin cheese")));
  assert.ok(!ev.weaknesses.some((w) => w.includes("Top bun")), "a one-off slip is not a pattern");
  assert.ok(ev.weaknesses.some((w) => w.includes("Ice")), "repeated extra item is reported");
  assert.ok(ev.weaknesses.some((w) => w.includes("over the target time")));
  assert.ok(ev.weaknesses.some((w) => w.includes("Needs practice")));
}

// 7. Customer service rubric: strong and weak dimensions, and the seed's plain feedback is tolerated.
{
  const rubric = (greeting: number, deesc: number) => ({
    greeting_and_warmth: { score: greeting, justification: "x" },
    deescalation_and_empathy: { score: deesc, justification: "x" },
    order_accuracy: { score: 3.8, justification: "x" },
    score: 0.6,
  });
  const ev = buildEvaluation(
    base({
      mastery: [{ station: "cs", score: 0.6, attempts: 3, lastTrainedAt: null }],
      attempts: [
        attempt("cs", null, 0.5, "2026-10-01T09:00:00.000Z", { source: "seed", coaching: "Practise." }),
        attempt("cs", null, 0.6, "2026-10-02T09:00:00.000Z", rubric(5, 2)),
        attempt("cs", null, 0.6, "2026-10-03T09:00:00.000Z", rubric(4, 3)),
      ],
    }),
  );
  assert.ok(ev.strengths.some((s) => s.includes("strong greeting and warmth")));
  assert.ok(ev.weaknesses.some((w) => w.includes("de-escalation and empathy") && w.includes("2.5")));
  assert.match(ev.needsImprovement[0].suggestion, /de-escalation/);
}

// 8. Retests come first in the next steps, and a decline shows as a downward trend.
{
  const ev = buildEvaluation(
    base({
      mastery: [{ station: "drink", score: 0.78, attempts: 2, lastTrainedAt: null }],
      attempts: [attempt("drink", "fizz", 0.95, "2026-10-01 09:00:00"), attempt("drink", "latte", 0.6, "2026-10-02T09:00:00.000Z")],
      retestStations: ["drink"],
    }),
  );
  assert.equal(ev.stations[1].trend, "down");
  assert.match(ev.nextSteps[0], /Retest Drinks/);
  assert.ok(ev.nextSteps.length <= 3);
  assert.ok(ev.stations[1].retestDue);
}

// 9. Fallback narrative uses only the computed facts and never throws without a key.
{
  const ev = buildEvaluation(base({ name: "Wren Ashby", isNew: true, mastery: [{ station: "food", score: 0.6, attempts: 1, lastTrainedAt: null }], attempts: [attempt("food", "burger", 0.6, "2026-10-01T09:00:00.000Z")] }));
  const text = fallbackNarrative(ev);
  assert.equal(text.source, "fallback");
  assert.ok(text.summary.startsWith("Wren, "));
}

async function main() {
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { db } = await import("../src/lib/db");
  const { loadDemoSeed } = await import("../src/lib/db/seed");
  const { buildDemoSeed } = await import("../src/lib/db/seed-data");
  const { getEvaluation } = await import("../src/lib/evaluation/load");
  const store = await import("../src/lib/scheduling/store");
  const { recordAttempt } = await import("../src/lib/mastery");
  const { employees } = await import("../src/lib/db/schema");

  migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
  loadDemoSeed(db, buildDemoSeed());
  store.generateAndSaveSchedule();

  // Every employee in the seed produces a sensible report; managers and unknown ids do not.
  for (const person of db.select().from(employees).all()) {
    const ev = getEvaluation(person.id);
    if (person.role === "manager") {
      assert.equal(ev, null);
      continue;
    }
    assert.ok(ev, `evaluation for ${person.id}`);
    assert.equal(ev!.stations.length, 3);
    assert.ok(ev!.headline.length > 0);
  }
  assert.equal(getEvaluation("nobody"), null);

  const finch = getEvaluation("finch")!;
  assert.equal(finch.hasData, false);
  assert.match(finch.headline, /Start your first chapter/);

  const wren = getEvaluation("wren")!;
  assert.deepEqual(wren.canStartNow.map((c) => c.role), ["shadow"]);
  assert.ok(wren.needsImprovement.some((n) => n.station === "food"));

  const odette = getEvaluation("odette")!;
  assert.deepEqual(odette.canStartNow.map((c) => c.station).sort(), ["cs", "drink", "food"]);
  assert.match(odette.schedulingStatus, /upcoming shift/);

  // Finch trains one station and the report follows.
  recordAttempt({
    employeeId: "finch",
    station: "drink",
    score: 0.95,
    recipeId: "moonwater-fizz",
    feedback: { accuracy: 1, speed: 1, mistakes: [], facts: { missing: [], extra: [], outOfOrder: [] } },
  });
  const trained = getEvaluation("finch")!;
  assert.equal(trained.hasData, true);
  assert.ok(!/Certified and waiting/.test(trained.schedulingStatus), "one perfect recipe is not enough to certify a station");
  assert.ok(!trained.strengths.some((s) => /certified/.test(s)), "and is not reported as a certified strength");

  // Two more different recipes at 80%+ and the station certifies.
  for (const recipeId of ["love-potion-latte", "dragons-breath-cider"]) {
    recordAttempt({
      employeeId: "finch",
      station: "drink",
      score: 0.9,
      recipeId,
      feedback: { accuracy: 1, speed: 1, mistakes: [], facts: { missing: [], extra: [], outOfOrder: [] } },
    });
  }
  const certified = getEvaluation("finch")!;
  assert.ok(certified.strengths.some((s) => s.startsWith("Drinks:") && /certified/.test(s)));
  assert.match(certified.schedulingStatus, /Certified and waiting/);

  // The narrative never throws and falls back when Gemini is unavailable.
  const narrative = await writeNarrative(certified);
  assert.equal(narrative.source, "fallback");
  assert.ok(narrative.summary.length > 0);
  assert.equal((await writeNarrative(getEvaluation("finch")!)).source, "fallback");

  console.info("Evaluation report checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
