import { getDb } from '../loaders/database.mjs';

export function saveSession(portal, storageState) {
  const row = getDb().query('SELECT id FROM sessions WHERE portal = ?').get(portal);
  const now = new Date().toISOString();
  if (row) {
    return getDb().run('UPDATE sessions SET storage_state = ?, updated_at = ? WHERE portal = ?', storageState, now, portal);
  }
  return getDb().run('INSERT INTO sessions (portal, storage_state, created_at, updated_at) VALUES (?, ?, ?, ?)', portal, storageState, now, now());
}

export function getSession(portal) {
  return getDb().query('SELECT id, portal, storage_state, created_at, updated_at FROM sessions WHERE portal = ?').get(portal);
}

export function deleteSession(portal) {
  return getDb().run('DELETE FROM sessions WHERE portal = ?', portal);
}

export function listSessions() {
  return getDb().query('SELECT id, portal, created_at, updated_at FROM sessions').all();
}
