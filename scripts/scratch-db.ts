import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Set DATABASE_URL before importing src/lib/db, then apply the initial schema. */
export async function createScratchDatabase(label: string) {
  const directory = mkdtempSync(join(tmpdir(), `conjuring-cauldron-${label}-`));
  process.env.DATABASE_URL = join(directory, "test.db");
  const { sqlite } = await import("../src/lib/db");
  sqlite.exec(readFileSync(join(process.cwd(), "drizzle/0000_quiet_green_goblin.sql"), "utf8"));
  return sqlite;
}
