import { relations, sql } from "drizzle-orm";
import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const employees = sqliteTable("employees", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role", { enum: ["employee", "manager"] }).notNull(),
  isNew: integer("is_new", { mode: "boolean" }).notNull().default(false),
  hoursCapWeekly: integer("hours_cap_weekly").notNull(),
  avatar: text("avatar"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

export const availability = sqliteTable(
  "availability",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
  },
  (table) => [uniqueIndex("availability_employee_day_time_idx").on(table.employeeId, table.dayOfWeek, table.startTime, table.endTime)],
);

export const recipes = sqliteTable("recipes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  station: text("station", { enum: ["food", "drink"] }).notNull(),
  ingredientsJson: text("ingredients_json").notNull(),
  targetSeconds: integer("target_seconds").notNull(),
  difficulty: integer("difficulty").notNull(),
});

export const mastery = sqliteTable(
  "mastery",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    station: text("station", { enum: ["food", "drink", "cs"] }).notNull(),
    score: real("score").notNull(),
    lastTrainedAt: text("last_trained_at"),
    attempts: integer("attempts").notNull().default(0),
    /** Shifts worked at this station (as a shadow trainee a shift counts half). Slows decay and retests. */
    experience: real("experience").notNull().default(0),
    /** The last demo day a shift at this station was worked; counts as practice for the decay clock. */
    lastWorkedAt: text("last_worked_at"),
  },
  (table) => [uniqueIndex("mastery_employee_station_idx").on(table.employeeId, table.station)],
);

/**
 * An employee's request for scheduling preferences (shifts and days they would rather work).
 * A manager accepts or rejects it; the latest accepted request is the one the scheduler uses.
 */
export const preferenceRequests = sqliteTable("preference_requests", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  likedSlotsJson: text("liked_slots_json").notNull().default("[]"),
  avoidedSlotsJson: text("avoided_slots_json").notNull().default("[]"),
  dayPref: text("day_pref", { enum: ["any", "weekends", "weekdays"] }).notNull().default("any"),
  note: text("note").notNull().default(""),
  status: text("status", { enum: ["pending", "accepted", "rejected"] }).notNull().default("pending"),
  managerNote: text("manager_note"),
  createdAt: text("created_at").notNull(),
  decidedAt: text("decided_at"),
});

export const callSessions = sqliteTable("call_sessions", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  scenarioId: text("scenario_id").notNull(),
  transcriptJson: text("transcript_json"),
  rubricJson: text("rubric_json"),
  /** Transcript lines the trainee reported as misheard, and whether each correction was accepted. */
  correctionsJson: text("corrections_json"),
  score: real("score"),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
});

export const attempts = sqliteTable("attempts", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  station: text("station", { enum: ["food", "drink", "cs"] }).notNull(),
  recipeId: text("recipe_id").references(() => recipes.id),
  callSessionId: text("call_session_id").references(() => callSessions.id),
  score: real("score").notNull(),
  feedbackJson: text("feedback_json").notNull(),
  durationSeconds: integer("duration_s").notNull(),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

export const shifts = sqliteTable("shifts", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  slot: text("slot", { enum: ["open", "mid", "close"] }).notNull(),
  requiredJson: text("required_json").notNull(),
});

export const assignments = sqliteTable("assignments", {
  id: text("id").primaryKey(),
  shiftId: text("shift_id").notNull().references(() => shifts.id, { onDelete: "cascade" }),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  station: text("station", { enum: ["food", "drink", "cs"] }).notNull(),
  role: text("role", { enum: ["anchor", "shadow"] }).notNull(),
  status: text("status", { enum: ["scheduled", "called_off", "covered"] }).notNull().default("scheduled"),
});

export const calloffs = sqliteTable("calloffs", {
  id: text("id").primaryKey(),
  assignmentId: text("assignment_id").notNull().references(() => assignments.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  status: text("status", { enum: ["open", "resolved"] }).notNull().default("open"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

export const calloffCandidates = sqliteTable("calloff_candidates", {
  id: text("id").primaryKey(),
  calloffId: text("calloff_id").notNull().references(() => calloffs.id, { onDelete: "cascade" }),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  rank: integer("rank").notNull(),
  rationale: text("rationale").notNull(),
  status: text("status", { enum: ["proposed", "approved", "declined", "accepted"] }).notNull().default("proposed"),
});

export const demoClock = sqliteTable("demo_clock", {
  id: integer("id").primaryKey().default(1),
  now: text("now").notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  body: text("body").notNull(),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

export const employeesRelations = relations(employees, ({ many }) => ({
  availability: many(availability),
  mastery: many(mastery),
  attempts: many(attempts),
  callSessions: many(callSessions),
  assignments: many(assignments),
  messages: many(messages),
}));

export const callSessionsRelations = relations(callSessions, ({ one, many }) => ({
  employee: one(employees, { fields: [callSessions.employeeId], references: [employees.id] }),
  attempts: many(attempts),
}));
