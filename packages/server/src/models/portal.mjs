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
