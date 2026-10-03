import { db } from "../src/lib/db";
import { loadDemoSeed, type DemoSeed } from "../src/lib/db/seed";

// Agent B replaces this empty shell with deterministic generated demo content.
// Keeping the loader executable now lets Reset Demo use the same path later.
const seed: DemoSeed = {
  employees: [],
  availability: [],
  recipes: [],
  mastery: [],
  callSessions: [],
  attempts: [],
  shifts: [],
  assignments: [],
  calloffs: [],
  calloffCandidates: [],
  messages: [],
  demoClock: { id: 1, now: "2026-10-03T09:00:00.000Z" },
};

loadDemoSeed(db, seed);
console.info("Demo database reset.");
