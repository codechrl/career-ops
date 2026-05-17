/**
 * Portal Discovery Client
 * Calls the Python CrewAI agent microservice instead of running the agent in-process.
 */
import { getLLMKey } from '../models/llm-key.mjs';
import { dbGet } from '../loaders/database.mjs';

const AGENT_URL = process.env.AGENT_SERVICE_URL || 'http://agent:8000';
const DISCOVERY_TIMEOUT_MS = 180_000; // 3 min per portal

const DEFAULT_MODELS = {
  deepseek:   'deepseek-chat',
  openrouter: 'anthropic/claude-3-5-sonnet-20241022',
  openai:     'gpt-4o-mini',
  anthropic:  'claude-3-5-haiku-20241022',
  gemini:     'gemini-1.5-flash',
};

async function getLLMConfig() {
  let provider = (process.env.LLM_PROVIDER || 'deepseek').toLowerCase();
  let model = process.env.LLM_MODEL || null;

  try {
    const row = await dbGet('SELECT value FROM settings WHERE key = ?', ['llm_config_portal-discovery']);
    if (row) {
      const cfg = JSON.parse(row.value);
      if (cfg.provider) provider = cfg.provider.toLowerCase();
      if (cfg.model) model = cfg.model;
    }
  } catch { /* use defaults */ }

  const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
  const dbRow = envKey ? null : await getLLMKey(provider).catch(() => null);
  const apiKey = envKey || dbRow?.api_key || null;

  return { provider, model: model || DEFAULT_MODELS[provider] || 'deepseek-chat', apiKey };
}

/**
 * Drop-in replacement for runPortalDiscoveryAgent.
 * Same signature — portal, _llm (ignored), onLog, signal.
 */
export async function runPortalDiscoveryAgent(portal, _llm, onLog, signal) {
  const log = (msg) => onLog?.(msg);
  log(`Starting discovery for ${portal.name} (${portal.careers_url})`);

  const { provider, model, apiKey } = await getLLMConfig();

  if (!apiKey) {
    const msg = `No API key configured for provider "${provider}". Add it in Settings → API Keys.`;
    log(msg);
    return { method: 'unknown', url_template: null, notes: msg, confidence: 'low' };
  }

  const serpRow = await getLLMKey('serpapi').catch(() => null);
  const serpApiKey = serpRow?.api_key || null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DISCOVERY_TIMEOUT_MS);

  // If caller's signal fires, abort ours too
  signal?.addEventListener('abort', () => ctrl.abort(), { once: true });

  try {
    const res = await fetch(`${AGENT_URL}/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        portal_id:       portal.id,
        portal_name:     portal.name,
        portal_provider: portal.provider,
        careers_url:     portal.careers_url,
        llm: { provider, model, api_key: apiKey },
        serpapi_key:     serpApiKey,
      }),
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text().catch(() => `HTTP ${res.status}`);
      log(`Agent service error: ${errText}`);
      return { method: 'unknown', url_template: null, notes: errText, confidence: 'low' };
    }

    const result = await res.json();
    log(`Done → ${result.method} (${result.confidence})`);
    return result;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError' || signal?.aborted) {
      return { method: 'unknown', url_template: null, notes: 'Cancelled', confidence: 'low' };
    }
    log(`Agent error: ${err.message}`);
    return { method: 'unknown', url_template: null, notes: err.message, confidence: 'low' };
  }
}
