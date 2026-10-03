import { db } from "../src/lib/db";
import { buildDemoSeed } from "../src/lib/db/seed-data";
import { loadDemoSeed } from "../src/lib/db/seed";

// Deterministic demo content lives in src/lib/db/seed-data.ts. Reset Demo reuses the same path.
const seed = buildDemoSeed();

loadDemoSeed(db, seed);
console.info(
  `Demo database reset: ${seed.employees.length} employees, ${seed.recipes.length} recipes, ${seed.shifts.length} shifts.`,
);
