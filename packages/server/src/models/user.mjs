import { createHash } from 'crypto';
import { dbGet, dbRun } from '../loaders/database.mjs';

export async function getUserByUsername(username) {
  return dbGet('SELECT * FROM users WHERE username = ?', [username]);
}

export async function createUser(username, passwordHash) {
  const now = new Date().toISOString();
  await dbRun('INSERT INTO users (username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)', [username, passwordHash, now, now]);
}

export async function updateUserPassword(username, passwordHash) {
  return dbRun('UPDATE users SET password_hash = ?, updated_at = ? WHERE username = ?', [passwordHash, new Date().toISOString(), username]);
}

export async function ensureDefaultUser() {
  const username = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
  const password = process.env.DEFAULT_ADMIN_PASSWORD || 'changeme';
  const user = await getUserByUsername(username);
  if (!user) await createUser(username, hashPassword(password));
}

export function hashPassword(password) {
  return createHash('sha256').update(password).digest('hex');
}
