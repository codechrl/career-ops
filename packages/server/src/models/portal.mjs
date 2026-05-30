import { dbAll, dbGet, dbRun, dbInsert } from '../loaders/database.mjs';

export async function listPortals() {
  return dbAll('SELECT * FROM portals ORDER BY name ASC');
}

export async function getPortal(id) {
  return dbGet('SELECT * FROM portals WHERE id = ?', [id]);
}

export async function addPortal({ name, provider, careers_url, auth_type, enabled }) {
  const now = new Date().toISOString();
  const id = await dbInsert(
    'INSERT INTO portals (name, provider, careers_url, auth_type, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, provider || null, careers_url || null, auth_type || 'none', enabled ?? 1, now, now]
  );
  return getPortal(id);
}

export async function updatePortal(id, { name, provider, careers_url, auth_type, enabled }) {
  const now = new Date().toISOString();
  await dbRun(
    'UPDATE portals SET name = ?, provider = ?, careers_url = ?, auth_type = ?, enabled = ?, updated_at = ? WHERE id = ?',
    [name, provider || null, careers_url || null, auth_type || 'none', enabled ?? 1, now, id]
  );
  return getPortal(id);
}

export async function deletePortal(id) {
  return dbRun('DELETE FROM portals WHERE id = ?', [id]);
}

export async function countPortals() {
  const row = await dbGet('SELECT COUNT(*) as n FROM portals');
  return parseInt(row.n, 10);
}

// ── Playwright credentials ────────────────────────────────────────────────────

export async function getPortalCredentials(id) {
  const row = await dbGet('SELECT auth_credentials FROM portals WHERE id = ?', [id]);
  if (!row) return null;
  return row.auth_credentials || null;
}

export async function setPortalCredentials(id, creds) {
  const now = new Date().toISOString();
  await dbRun(
    'UPDATE portals SET auth_credentials = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(creds), now, id]
  );
  return getPortalCredentials(id);
}

export async function clearPortalCredentials(id) {
  const now = new Date().toISOString();
  await dbRun(
    'UPDATE portals SET auth_credentials = NULL, updated_at = ? WHERE id = ?',
    [now, id]
  );
}

// ── Session state (Playwright storage_state) ──────────────────────────────────

export async function getPortalSession(portalId) {
  return dbGet('SELECT storage_state FROM sessions WHERE portal = ? ORDER BY id DESC LIMIT 1', [String(portalId)]);
}

export async function savePortalSession(portalId, storageStateJson) {
  const now = new Date().toISOString();
  const key = String(portalId);
  const existing = await dbGet('SELECT id FROM sessions WHERE portal = ?', [key]);
  if (existing) {
    await dbRun(
      'UPDATE sessions SET storage_state = ?, updated_at = ? WHERE portal = ?',
      [storageStateJson, now, key]
    );
  } else {
    await dbInsert(
      'INSERT INTO sessions (portal, storage_state, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [key, storageStateJson, now, now]
    );
  }
}

export async function clearPortalSession(portalId) {
  await dbRun('DELETE FROM sessions WHERE portal = ?', [String(portalId)]);
}
