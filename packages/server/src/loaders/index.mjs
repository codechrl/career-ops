import { initDatabase, dbGet, dbRun } from './database.mjs';
import { initAuth } from './auth.mjs';
import { initExpress } from './express.mjs';
import { listLLMKeys } from '../models/llm-key.mjs';
import { initScheduler, initCatalogScheduler } from '../services/scan-scheduler.mjs';

export async function initLoaders() {
  await initDatabase();
  // Mark any runs that were still 'running' when the server last died
  const orphanTs = new Date().toISOString();
  await dbRun(
    `UPDATE scan_runs SET status='cancelled', finished_at=$1 WHERE status='running'`,
    [orphanTs]
  ).catch(() => {});
  await dbRun(
    `UPDATE catalog_refresh_runs SET status='cancelled', finished_at=$1 WHERE status='running'`,
    [orphanTs]
  ).catch(() => {});
  // Load saved LLM keys into process.env so providers work after restart
  const keys = await listLLMKeys();
  for (const k of keys) {
    process.env[`${k.provider.toUpperCase()}_API_KEY`] = k.api_key;
  }
  // Load LLM provider/model config
  const cfgRow = await dbGet('SELECT value FROM settings WHERE key = ?', ['llm_config_cv']);
  if (cfgRow) {
    try {
      const cfg = JSON.parse(cfgRow.value);
      if (cfg.provider) process.env.LLM_PROVIDER = cfg.provider;
      if (cfg.model) process.env.LLM_MODEL = cfg.model;
    } catch {}
  }
  await initExpress();
  await initAuth();
  await initScheduler();
  await initCatalogScheduler();
}
