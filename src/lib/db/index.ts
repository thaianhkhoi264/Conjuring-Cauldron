import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import * as schema from "./schema";
import { upgradeDatabase } from "./upgrade";

const databasePath = resolve(
  process.cwd(),
  process.env.DATABASE_URL ?? ".data/conjuring-cauldron.db",
);

mkdirSync(dirname(databasePath), { recursive: true });

const sqlite = new Database(databasePath);
sqlite.pragma("foreign_keys = ON");
upgradeDatabase(sqlite); // older databases gain any new columns and tables, keeping their data

export const db = drizzle(sqlite, { schema });
export { sqlite };
