import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Uses a throwaway database in the OS temp folder; never the real dev database.
process.env.DATABASE_URL = join(mkdtempSync(join(tmpdir(), "conjuring-cauldron-breadth-")), "test.db");

async function main() {
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { db } = await import("../src/lib/db");
  const { mastery } = await import("../src/lib/db/schema");
  const { loadDemoSeed } = await import("../src/lib/db/seed");
  const { buildDemoSeed } = await import("../src/lib/db/seed-data");
  const m = await import("../src/lib/mastery");
  const store = await import("../src/lib/scheduling/store");

  migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
  loadDemoSeed(db, buildDemoSeed());

  const attempt = (station: "food" | "drink", recipeId: string, score: number) =>
    m.recordAttempt({ employeeId: "finch", station, recipeId, score, feedback: {} });

  // One recipe made perfectly, again and again, never certifies the station.
  let result = attempt("food", "broomstick-fries", 1);
  for (let i = 0; i < 4; i++) result = attempt("food", "broomstick-fries", 1);
  assert.equal(result.certified, false);
  assert.ok(result.score <= m.UNCERTIFIED_CAP + 1e-9, "held just under the certification line");
  assert.deepEqual(result.coverage, { passed: 1, needed: 3 });

  // The scheduler does not treat them as certified for food.
  const finchInput = store.loadScheduleInput().employees.find((e) => e.id === "finch")!;
  assert.ok(finchInput.skills.food < 0.8, "not eligible to be an anchor on food");

  // A failed attempt at another recipe does not count as passing it.
  result = attempt("food", "cauldron-burger", 0.5);
  assert.equal(result.coverage?.passed, 1);

  // Two recipes: still not enough. The third different recipe certifies.
  result = attempt("food", "cauldron-burger", 0.9);
  assert.equal(result.certified, false);
  assert.deepEqual(result.coverage, { passed: 2, needed: 3 });
  result = attempt("food", "eye-of-newt-tacos", 0.95);
  assert.equal(result.coverage?.passed, 3);
  assert.equal(result.certified, true, "three different recipes passed");
  assert.ok(result.score >= 0.8);
  assert.ok(store.loadScheduleInput().employees.find((e) => e.id === "finch")!.skills.food >= 0.8, "now eligible to be scheduled on food");

  // Drinks are counted separately from food.
  result = attempt("drink", "moonwater-fizz", 1);
  assert.equal(result.certified, false);
  assert.deepEqual(result.coverage, { passed: 1, needed: 3 });

  // Customer service has no recipes and is unaffected.
  const cs = m.applyScore("finch", "cs", 0.95);
  assert.equal(cs.certified, true);
  assert.equal(cs.coverage.needed, 0);

  // The demo data stays consistent: everyone seeded as certified in food or drinks has passed at least three recipes.
  for (const row of db.select().from(mastery).all()) {
    if (row.station === "cs" || row.score < 0.8 || row.employeeId === "finch") continue;
    const coverage = m.recipeCoverage(row.employeeId, row.station);
    assert.ok(coverage.passed >= coverage.needed, `${row.employeeId} ${row.station} is certified with ${coverage.passed} recipes`);
  }

  console.info("Recipe breadth checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
