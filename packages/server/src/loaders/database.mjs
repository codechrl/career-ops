import { Database } from 'bun:sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..', '..');
const DB_PATH = path.resolve(ROOT, 'data', 'career-ops.sqlite3');

let db;

export async function initDatabase() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.run('PRAGMA journal_mode = WAL');

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  db.run(`
    CREATE TABLE IF NOT EXISTS llm_keys (
      provider TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portal TEXT NOT NULL,
      storage_state TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  db.run(`
    CREATE TABLE IF NOT EXISTS portals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      provider TEXT,
      careers_url TEXT,
      config_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  db.run(`
    CREATE TABLE IF NOT EXISTS pipeline_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      company TEXT,
      title TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  db.run(`
    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      score TEXT,
      status TEXT NOT NULL DEFAULT 'Evaluada',
      pdf TEXT,
      report TEXT,
      apply_method TEXT DEFAULT 'portal',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);

  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}
