import { getDb } from '../loaders/database.mjs';

export function getUserByUsername(username) {
  return getDb().query('SELECT * FROM users WHERE username = ?').get(username);
}

export function createUser(username, passwordHash) {
  const info = getDb().run('INSERT INTO users (username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)', username, passwordHash, new Date().toISOString(), new Date().toISOString());
  return info.lastInsertRowid;
}

export function updateUserPassword(username, passwordHash) {
  return getDb().run('UPDATE users SET password_hash = ?, updated_at = ? WHERE username = ?', passwordHash, new Date().toISOString(), username);
}

export function ensureDefaultUser() {
  const user = getUserByUsername('kurniawan');
  if (!user) createUser('kurniawan', hashPassword('changeme'));
}

import { createHash } from 'crypto';
export function hashPassword(password) {
  return createHash('sha256').update(password).digest('hex');
}
