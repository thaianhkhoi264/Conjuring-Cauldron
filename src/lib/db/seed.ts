import type { InferInsertModel } from "drizzle-orm";

import {
  assignments,
  attempts,
  availability,
  calloffCandidates,
  calloffs,
  callSessions,
  demoClock,
  employees,
  mastery,
  messages,
  preferenceRequests,
  recipes,
  shifts,
} from "./schema";

export type DemoSeed = {
  employees: InferInsertModel<typeof employees>[];
  availability: InferInsertModel<typeof availability>[];
  recipes: InferInsertModel<typeof recipes>[];
  mastery: InferInsertModel<typeof mastery>[];
  callSessions: InferInsertModel<typeof callSessions>[];
  attempts: InferInsertModel<typeof attempts>[];
  shifts: InferInsertModel<typeof shifts>[];
  assignments: InferInsertModel<typeof assignments>[];
  calloffs: InferInsertModel<typeof calloffs>[];
  calloffCandidates: InferInsertModel<typeof calloffCandidates>[];
  messages: InferInsertModel<typeof messages>[];
  preferenceRequests: InferInsertModel<typeof preferenceRequests>[];
  demoClock: InferInsertModel<typeof demoClock>;
};

/**
 * Replaces all demo state in dependency-safe order. Seed content is kept
 * separate so it can be generated once and checked into the repository.
 */
export function loadDemoSeed(database: typeof import("./index").db, seed: DemoSeed) {
  return database.transaction((tx) => {
    tx.delete(calloffCandidates).run();
    tx.delete(calloffs).run();
    tx.delete(assignments).run();
    tx.delete(attempts).run();
    tx.delete(callSessions).run();
    tx.delete(mastery).run();
    tx.delete(availability).run();
    tx.delete(messages).run();
    tx.delete(preferenceRequests).run();
    tx.delete(shifts).run();
    tx.delete(recipes).run();
    tx.delete(employees).run();
    tx.delete(demoClock).run();

    if (seed.employees.length) tx.insert(employees).values(seed.employees).run();
    if (seed.availability.length) tx.insert(availability).values(seed.availability).run();
    if (seed.recipes.length) tx.insert(recipes).values(seed.recipes).run();
    if (seed.mastery.length) tx.insert(mastery).values(seed.mastery).run();
    if (seed.callSessions.length) tx.insert(callSessions).values(seed.callSessions).run();
    if (seed.attempts.length) tx.insert(attempts).values(seed.attempts).run();
    if (seed.shifts.length) tx.insert(shifts).values(seed.shifts).run();
    if (seed.assignments.length) tx.insert(assignments).values(seed.assignments).run();
    if (seed.calloffs.length) tx.insert(calloffs).values(seed.calloffs).run();
    if (seed.calloffCandidates.length) tx.insert(calloffCandidates).values(seed.calloffCandidates).run();
    if (seed.messages.length) tx.insert(messages).values(seed.messages).run();
    if (seed.preferenceRequests.length) tx.insert(preferenceRequests).values(seed.preferenceRequests).run();
    tx.insert(demoClock).values(seed.demoClock).run();
  });
}
