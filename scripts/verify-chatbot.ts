import assert from "node:assert/strict";

import { db } from "../src/lib/db";
import { assignments, calloffs, employees, shifts } from "../src/lib/db/schema";
import { getEmployeeSchedule, requestCalloff } from "../src/lib/chatbot";

db.delete(calloffs).run();
db.delete(assignments).run();
db.delete(shifts).run();
db.delete(employees).run();
db.insert(employees).values({ id: "chat-test-employee", name: "Chat Test", role: "employee", isNew: false, hoursCapWeekly: 20 }).run();
db.insert(shifts).values({ id: "chat-test-shift", date: "2026-10-08", slot: "close", requiredJson: JSON.stringify({ food: 1, drink: 1, cs: 1 }) }).run();
db.insert(assignments).values({ id: "chat-test-assignment", shiftId: "chat-test-shift", employeeId: "chat-test-employee", station: "drink", role: "anchor", status: "scheduled" }).run();

assert.equal(getEmployeeSchedule("chat-test-employee").length, 1, "employee schedule must be scoped to the employee");
assert.equal(requestCalloff("chat-test-employee", "chat-test-assignment", "Feeling ill", false).requiresConfirmation, true, "call-offs require confirmation");
assert.equal(requestCalloff("chat-test-employee", "chat-test-assignment", "Feeling ill", true).created, true, "confirmed call-offs must be created");
assert.equal(getEmployeeSchedule("chat-test-employee")[0]?.status, "called_off", "confirmed call-offs must update assignment state");
console.info("Employee chatbot tool checks passed.");
