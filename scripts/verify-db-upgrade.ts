import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { upgradeDatabase } from "../src/lib/db/upgrade";

// A database made by the very first version of the app (migration 0000 only), with data in it.
const sqlite = new Database(join(mkdtempSync(join(tmpdir(), "conjuring-cauldron-upgrade-")), "old.db"));
sqlite.pragma("foreign_keys = ON");

// An empty database is left alone: db:setup / the migrations create the schema.
upgradeDatabase(sqlite);
assert.equal((sqlite.prepare("SELECT count(*) AS n FROM sqlite_master").get() as { n: number }).n, 0, "nothing is created in an empty database");

const first = readFileSync(join(process.cwd(), "drizzle", "0000_quiet_green_goblin.sql"), "utf8");
for (const statement of first.split("--> statement-breakpoint")) sqlite.exec(statement);
sqlite.exec("INSERT INTO employees (id, name, role, is_new, hours_cap_weekly) VALUES ('e1', 'Ann', 'employee', 0, 20)");
sqlite.exec("INSERT INTO mastery (id, employee_id, station, score, attempts) VALUES ('m1', 'e1', 'food', 0.9, 2)");
sqlite.exec("INSERT INTO call_sessions (id, employee_id, scenario_id, started_at) VALUES ('c1', 'e1', 'wrong-order', '2026-10-03T09:00:00.000Z')");

const columns = (table: string) => (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
assert.ok(!columns("mastery").includes("experience"), "the old database lacks the new column");

upgradeDatabase(sqlite);
assert.ok(columns("mastery").includes("experience") && columns("mastery").includes("last_worked_at"));
assert.ok(columns("call_sessions").includes("corrections_json"));
assert.ok(columns("preference_requests").includes("day_pref"), "the new table exists");

// Data survives and the new columns take their defaults.
const row = sqlite.prepare("SELECT score, attempts, experience, last_worked_at FROM mastery WHERE id = 'm1'").get() as Record<string, unknown>;
assert.deepEqual(row, { score: 0.9, attempts: 2, experience: 0, last_worked_at: null });
sqlite.exec("INSERT INTO preference_requests (id, employee_id, created_at) VALUES ('p1', 'e1', '2026-10-03T09:00:00.000Z')");
assert.deepEqual(sqlite.prepare("SELECT status, day_pref, liked_slots_json FROM preference_requests").get(), { status: "pending", day_pref: "any", liked_slots_json: "[]" });

// Running it again changes nothing.
upgradeDatabase(sqlite);
assert.equal((sqlite.prepare("SELECT count(*) AS n FROM mastery").get() as { n: number }).n, 1);

console.info("Database upgrade checks passed.");
