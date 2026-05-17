import { getDb } from '../loaders/database.mjs';

export function listListings() {
  return getDb().query('SELECT * FROM listings ORDER BY created_at DESC').all();
}

export function addListing({ company, role, score, status, pdf, report, apply_method }) {
  const now = new Date().toISOString();
  return getDb().run('INSERT INTO listings (company, role, score, status, pdf, report, apply_method, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', company, role, score, status, pdf, report, apply_method, now, now());
}

export function updateListing(id, fields) {
  const keys = Object.keys(fields);
  const sql = `UPDATE listings SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`;
  const values = [...keys.map(k => fields[k]), new Date().toISOString(), id];
  return getDb().run(sql, ...values);
}

export function getListing(id) {
  return getDb().query('SELECT * FROM listings WHERE id = ?').get(id);
}
