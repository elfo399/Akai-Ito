import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";
export function openDb(dataDir: string) {
  mkdirSync(dataDir, { recursive: true });
  const sqlite = new Database(path.join(dataDir, "akai.sqlite"));
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  return { sqlite, db: drizzle(sqlite, { schema }) };
}
export function migrate(sqlite: Database.Database) {
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const dir = fileURLToPath(new URL("../migrations/", import.meta.url));
  for (const name of readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    if (
      !sqlite.prepare("SELECT name FROM _migrations WHERE name=?").get(name)
    ) {
      sqlite.transaction(() => {
        sqlite.exec(readFileSync(path.join(dir, name), "utf8"));
        sqlite
          .prepare("INSERT INTO _migrations VALUES(?,?)")
          .run(name, new Date().toISOString());
      })();
    }
  }
}
