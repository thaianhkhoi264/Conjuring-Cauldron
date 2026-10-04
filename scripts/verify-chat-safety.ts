import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Uses a throwaway database in the OS temp folder; never the real dev database. No Gemini calls.
process.env.DATABASE_URL = join(mkdtempSync(join(tmpdir(), "conjuring-cauldron-chat-safety-")), "test.db");

async function main() {
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { eq } = await import("drizzle-orm");
  const { db } = await import("../src/lib/db");
  const { assignments, calloffs } = await import("../src/lib/db/schema");
  const { loadDemoSeed } = await import("../src/lib/db/seed");
  const { buildDemoSeed } = await import("../src/lib/db/seed-data");
  const { generateAndSaveSchedule } = await import("../src/lib/scheduling/store");
  const { chatContext, createEmployeeChatTools, employeeChatSystemPrompt } = await import("../src/lib/chatbot");

  migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
  loadDemoSeed(db, buildDemoSeed());
  generateAndSaveSchedule();

  const mine = db.select().from(assignments).where(eq(assignments.employeeId, "elowen")).all().filter((a) => a.status === "scheduled");
  assert.ok(mine.length >= 2, "Elowen has several shifts");
  const [first, second] = mine;
  const others = db.select().from(assignments).all().filter((a) => a.employeeId !== "elowen");
  assert.ok(others.length > 0);

  const callOff = async (confirmed: boolean | string, assignmentId: string) => {
    const tool = createEmployeeChatTools("elowen", confirmed).find((t) => t.declaration.name === "request_calloff")!;
    return (await tool.run({ assignmentId, reason: "test" })) as Record<string, unknown>;
  };

  // 1. Nothing happens without a confirmation: the tool asks first.
  const asked = await callOff(false, first.id);
  assert.equal(asked.requiresConfirmation, true);
  assert.equal(db.select().from(calloffs).all().length, 0);

  // 2. A confirmation for one shift does not let a different shift be called off.
  const wrong = await callOff(second.id, first.id);
  assert.equal(wrong.requiresConfirmation, true, "confirming shift B must not call off shift A");
  assert.equal(db.select().from(calloffs).all().length, 0);
  assert.equal(db.select().from(assignments).where(eq(assignments.id, first.id)).get()!.status, "scheduled");

  // 3. A confirmation for the right shift goes through exactly once.
  const done = await callOff(first.id, first.id);
  assert.equal(done.created, true);
  assert.equal(db.select().from(calloffs).all().length, 1);
  assert.equal(db.select().from(assignments).where(eq(assignments.id, first.id)).get()!.status, "called_off");
  const again = await callOff(first.id, first.id);
  assert.ok(again.error, "the same shift cannot be called off twice");
  assert.equal(db.select().from(calloffs).all().length, 1);

  // 4. Someone else's shift is never accepted, even with a matching confirmation.
  const theirs = others.find((a) => a.status === "scheduled")!;
  const stolen = await callOff(theirs.id, theirs.id);
  assert.ok(stolen.error, "an employee cannot call off another person's shift");
  assert.equal(db.select().from(assignments).where(eq(assignments.id, theirs.id)).get()!.status, "scheduled");

  // 5. The model's context holds only this employee's own shifts.
  const context = chatContext("elowen");
  const ids = new Set(context.myShifts.map((s) => s.assignmentId));
  assert.ok(ids.size > 0 && [...ids].every((id) => id.includes("elowen") || mine.some((m) => m.id === id) || id === first.id));
  assert.ok(others.every((a) => !ids.has(a.id)), "no other employee's assignment ids appear");
  const prompt = employeeChatSystemPrompt("elowen");
  assert.ok(!prompt.includes(theirs.id), "the prompt never contains someone else's assignment ids");
  assert.ok(context.recipes.length === 12, "the whole recipe book is available");
  assert.match(prompt, /plain text only/i);

  console.info("Chat safety checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
