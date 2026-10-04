import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/** Set DATABASE_URL before importing src/lib/db, then apply every migration. */
export async function createScratchDatabase(label: string) {
  const directory = mkdtempSync(join(tmpdir(), `conjuring-cauldron-${label}-`));
  process.env.DATABASE_URL = join(directory, "test.db");
  const { db, sqlite } = await import("../src/lib/db");
  migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
  return sqlite;
}
