import type Database from "better-sqlite3";

/**
 * Brings a database created by an older version of the app up to date, keeping its data.
 *
 * The schema is normally created with `npm run db:setup`, which also resets the demo data. Pulling a newer version
 * used to mean running that and losing the current demo state, and forgetting it produced errors such as
 * "no such column". This adds only what is missing (new columns and tables, each with a default), every time the
 * database opens, and does nothing on a current database or on an empty one (db:setup / migrations create those).
 * Keep it in step with the files in /drizzle.
 */

function hasTable(sqlite: Database.Database, table: string) {
  return !!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
}

function hasColumn(sqlite: Database.Database, table: string, column: string) {
  return (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === column);
}

function addColumn(sqlite: Database.Database, table: string, column: string, definition: string) {
  if (hasTable(sqlite, table) && !hasColumn(sqlite, table, column)) {
    sqlite.exec(`ALTER TABLE \`${table}\` ADD \`${column}\` ${definition}`);
  }
}

export function upgradeDatabase(sqlite: Database.Database) {
  // A brand new or empty database is created by db:setup or the migrations, not here.
  if (!hasTable(sqlite, "employees")) return;

  // 0001: experience and shift preferences
  addColumn(sqlite, "mastery", "experience", "real DEFAULT 0 NOT NULL");
  addColumn(sqlite, "mastery", "last_worked_at", "text");
  sqlite.exec(`CREATE TABLE IF NOT EXISTS \`preference_requests\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`employee_id\` text NOT NULL,
    \`liked_slots_json\` text DEFAULT '[]' NOT NULL,
    \`avoided_slots_json\` text DEFAULT '[]' NOT NULL,
    \`day_pref\` text DEFAULT 'any' NOT NULL,
    \`note\` text DEFAULT '' NOT NULL,
    \`status\` text DEFAULT 'pending' NOT NULL,
    \`manager_note\` text,
    \`created_at\` text NOT NULL,
    \`decided_at\` text,
    FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);

  // 0002: transcript corrections
  addColumn(sqlite, "call_sessions", "corrections_json", "text");
}
