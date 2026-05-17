import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import Database from 'better-sqlite3';

const DB_PATH = path.resolve('data', 'career-ops.sqlite3');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS llm_keys (
  provider TEXT PRIMARY KEY,
  api_key TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portal TEXT NOT NULL,
  storage_state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  provider TEXT,
  careers_url TEXT,
  config_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pipeline_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  company TEXT,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

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
);
`);

function now() {
  return new Date().toISOString();
}

export function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

export function createUser(username, passwordHash) {
  const stmt = db.prepare('INSERT INTO users (username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)');
  const info = stmt.run(username, passwordHash, now(), now());
  return info.lastInsertRowid;
}

export function updateUserPassword(username, passwordHash) {
  return db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE username = ?').run(passwordHash, now(), username);
}

export function setLLMKey(provider, apiKey) {
  const row = db.prepare('SELECT provider FROM llm_keys WHERE provider = ?').get(provider);
  if (row) {
    return db.prepare('UPDATE llm_keys SET api_key = ?, updated_at = ? WHERE provider = ?').run(apiKey, now(), provider);
  }
  return db.prepare('INSERT INTO llm_keys (provider, api_key, updated_at) VALUES (?, ?, ?)').run(provider, apiKey, now());
}

export function getLLMKey(provider) {
  return db.prepare('SELECT provider, api_key, updated_at FROM llm_keys WHERE provider = ?').get(provider);
}

export function listLLMKeys() {
  return db.prepare('SELECT provider, api_key, updated_at FROM llm_keys').all();
}

export function saveSession(portal, storageState) {
  const row = db.prepare('SELECT id FROM sessions WHERE portal = ?').get(portal);
  if (row) {
    return db.prepare('UPDATE sessions SET storage_state = ?, updated_at = ? WHERE portal = ?').run(storageState, now(), portal);
  }
  return db.prepare('INSERT INTO sessions (portal, storage_state, created_at, updated_at) VALUES (?, ?, ?, ?)').run(portal, storageState, now(), now());
}

export function getSession(portal) {
  return db.prepare('SELECT id, portal, storage_state, created_at, updated_at FROM sessions WHERE portal = ?').get(portal);
}

export function deleteSession(portal) {
  return db.prepare('DELETE FROM sessions WHERE portal = ?').run(portal);
}

export function listSessions() {
  return db.prepare('SELECT id, portal, created_at, updated_at FROM sessions').all();
}

export function addPipelineItem(url, company, title) {
  return db.prepare('INSERT INTO pipeline_items (url, company, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(url, company, title, now(), now());
}

export function listPipelineItems() {
  return db.prepare('SELECT * FROM pipeline_items ORDER BY created_at DESC').all();
}

export function updatePipelineItem(id, fields) {
  const keys = Object.keys(fields);
  const stmt = db.prepare(`UPDATE pipeline_items SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`);
  return stmt.run(...keys.map(k => fields[k]), now(), id);
}

export function listListings() {
  return db.prepare('SELECT * FROM listings ORDER BY created_at DESC').all();
}

export function addListing({ company, role, score, status, pdf, report, apply_method }) {
  return db.prepare('INSERT INTO listings (company, role, score, status, pdf, report, apply_method, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(company, role, score, status, pdf, report, apply_method, now(), now());
}

export function updateListing(id, fields) {
  const keys = Object.keys(fields);
  const stmt = db.prepare(`UPDATE listings SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`);
  return stmt.run(...keys.map(k => fields[k]), now(), id);
}

export function getListing(id) {
  return db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
}

export function ensureDefaultUser() {
  const defaultUser = getUserByUsername('kurniawan');
  if (!defaultUser) {
    const passwordHash = hashPassword('changeme');
    createUser('kurniawan', passwordHash);
  }
}

export function hashPassword(password) {
  return createHash('sha256').update(password).digest('hex');
}

export default db;
