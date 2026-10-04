import assert from "node:assert/strict";

import { createScratchDatabase } from "./scratch-db";

async function main() {
  await createScratchDatabase("chatbot");
  const [{ db }, { assignments, calloffs, demoClock, employees, shifts }, { getEmployeeSchedule, requestCalloff }] = await Promise.all([
    import("../src/lib/db"),
    import("../src/lib/db/schema"),
    import("../src/lib/chatbot"),
  ]);
  db.insert(demoClock).values({ id: 1, now: "2026-10-03T09:00:00.000Z" }).run();
  db.insert(employees).values({ id: "chat-test-employee", name: "Chat Test", role: "employee", isNew: false, hoursCapWeekly: 20 }).run();
  db.insert(shifts).values({ id: "chat-test-shift", date: "2026-10-08", slot: "close", requiredJson: JSON.stringify({ food: 1, drink: 1, cs: 1 }) }).run();
  db.insert(assignments).values({ id: "chat-test-assignment", shiftId: "chat-test-shift", employeeId: "chat-test-employee", station: "drink", role: "anchor", status: "scheduled" }).run();
  assert.equal(getEmployeeSchedule("chat-test-employee").length, 1, "employee schedule must be scoped to the employee");
  assert.equal(requestCalloff("chat-test-employee", "chat-test-assignment", "Feeling ill", false).requiresConfirmation, true, "call-offs require confirmation");
  assert.equal(requestCalloff("chat-test-employee", "chat-test-assignment", "Feeling ill", true).created, true, "confirmed call-offs must be created");
  assert.equal(getEmployeeSchedule("chat-test-employee")[0]?.status, "called_off", "confirmed call-offs must update assignment state");
  assert.equal(db.select().from(calloffs).all().length, 1, "confirmed call-offs must create one record");
  console.info("Employee chatbot tool checks passed in a scratch database.");
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
