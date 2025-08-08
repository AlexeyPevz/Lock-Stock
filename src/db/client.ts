import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = process.env.DB_PATH || path.resolve("./lockstock.db");
const SCHEMA_PATH = path.resolve(__dirname, "./schema.sql");

export function openDb() {
  const db = new Database(DB_PATH);
  const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
  db.exec(schema);

  // Lightweight migrations: add columns if missing
  const tableInfo = db.prepare("PRAGMA table_info(facts_by_number)").all() as Array<{ name: string }>;
  const cols = new Set(tableInfo.map((c) => c.name));
  if (!cols.has("quarantined")) {
    db.exec("ALTER TABLE facts_by_number ADD COLUMN quarantined INTEGER DEFAULT 0");
  }

  return db;
}

export type DB = ReturnType<typeof openDb>;