import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = process.env.DB_PATH || path.resolve("./lockstock.db");
const SCHEMA_PATH = path.resolve(__dirname, "./schema.sql");

export function openDb() {
  const db = new Database(DB_PATH);
  const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
  db.exec(schema);
  return db;
}

export type DB = ReturnType<typeof openDb>;