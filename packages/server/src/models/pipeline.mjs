import { dbRun, dbAll } from '../loaders/database.mjs';

export async function addPipelineItem(url, company, title) {
  const now = new Date().toISOString();
  return dbRun('INSERT INTO pipeline_items (url, company, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [url, company, title, now, now]);
}

export async function listPipelineItems() {
  return dbAll('SELECT * FROM pipeline_items ORDER BY created_at DESC');
}

export async function updatePipelineItem(id, fields) {
  const keys = Object.keys(fields);
  const sql = `UPDATE pipeline_items SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`;
  const values = [...keys.map(k => fields[k]), new Date().toISOString(), id];
  return dbRun(sql, values);
}
