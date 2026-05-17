import { getDb } from '../loaders/database.mjs';

export function setLLMKey(provider, apiKey) {
  const row = getDb().query('SELECT provider FROM llm_keys WHERE provider = ?').get(provider);
  const now = new Date().toISOString();
  if (row) {
    return getDb().run('UPDATE llm_keys SET api_key = ?, updated_at = ? WHERE provider = ?', apiKey, now, provider);
  }
  return getDb().run('INSERT INTO llm_keys (provider, api_key, updated_at) VALUES (?, ?, ?)', provider, apiKey, now);
}

export function getLLMKey(provider) {
  return getDb().query('SELECT provider, api_key, updated_at FROM llm_keys WHERE provider = ?').get(provider);
}

export function listLLMKeys() {
  return getDb().query('SELECT provider, api_key, updated_at FROM llm_keys').all();
}

export function deleteLLMKey(provider) {
  return getDb().run('DELETE FROM llm_keys WHERE provider = ?', provider);
}
