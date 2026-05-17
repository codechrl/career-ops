import { dbGet, dbRun, dbAll } from '../loaders/database.mjs';

export async function saveSession(portal, storageState) {
  const row = await dbGet('SELECT id FROM sessions WHERE portal = ?', [portal]);
  const now = new Date().toISOString();
  if (row) {
    return dbRun('UPDATE sessions SET storage_state = ?, updated_at = ? WHERE portal = ?', [storageState, now, portal]);
  }
  return dbRun('INSERT INTO sessions (portal, storage_state, created_at, updated_at) VALUES (?, ?, ?, ?)', [portal, storageState, now, now]);
}

export async function getSession(portal) {
  return dbGet('SELECT id, portal, storage_state, created_at, updated_at FROM sessions WHERE portal = ?', [portal]);
}

export async function deleteSession(portal) {
  return dbRun('DELETE FROM sessions WHERE portal = ?', [portal]);
}

export async function listSessions() {
  return dbAll('SELECT id, portal, created_at, updated_at FROM sessions');
}
