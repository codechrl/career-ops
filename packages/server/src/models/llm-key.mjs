import { dbGet, dbRun, dbAll } from '../loaders/database.mjs';

export async function setLLMKey(provider, apiKey) {
  const row = await dbGet('SELECT provider FROM llm_keys WHERE provider = ?', [provider]);
  const now = new Date().toISOString();
  if (row) {
    return dbRun('UPDATE llm_keys SET api_key = ?, updated_at = ? WHERE provider = ?', [apiKey, now, provider]);
  }
  return dbRun('INSERT INTO llm_keys (provider, api_key, updated_at) VALUES (?, ?, ?)', [provider, apiKey, now]);
}

export async function getLLMKey(provider) {
  return dbGet('SELECT provider, api_key, updated_at FROM llm_keys WHERE provider = ?', [provider]);
}

export async function listLLMKeys() {
  return dbAll('SELECT provider, api_key, updated_at FROM llm_keys');
}

export async function deleteLLMKey(provider) {
  return dbRun('DELETE FROM llm_keys WHERE provider = ?', [provider]);
}
