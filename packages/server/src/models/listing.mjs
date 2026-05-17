import { dbAll, dbGet, dbRun } from '../loaders/database.mjs';

export async function listListings() {
  return dbAll('SELECT * FROM listings ORDER BY created_at DESC');
}

export async function addListing({ company, role, score, status, pdf, report, apply_method }) {
  const now = new Date().toISOString();
  return dbRun('INSERT INTO listings (company, role, score, status, pdf, report, apply_method, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [company, role, score, status, pdf, report, apply_method, now, now]);
}

export async function updateListing(id, fields) {
  const keys = Object.keys(fields);
  const sql = `UPDATE listings SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`;
  const values = [...keys.map(k => fields[k]), new Date().toISOString(), id];
  return dbRun(sql, values);
}

export async function getListing(id) {
  return dbGet('SELECT * FROM listings WHERE id = ?', [id]);
}
