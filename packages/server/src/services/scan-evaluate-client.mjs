/**
 * Scan Evaluate Client
 * Calls the Python agent /evaluate endpoint to score job listings with LLM.
 * Drop-in replacement for the structuredChat loop in scan-workflow.mjs Stage 3.
 */
import { getLLMKey } from '../models/llm-key.mjs';
import { dbGet } from '../loaders/database.mjs';

const AGENT_URL = process.env.AGENT_SERVICE_URL || 'http://agent:8000';
const EVALUATE_TIMEOUT_MS = 600_000; // 10 min for a full batch

const DEFAULT_MODELS = {
  deepseek:   'deepseek-chat',
  openrouter: 'anthropic/claude-3-5-sonnet-20241022',
  openai:     'gpt-4o-mini',
  anthropic:  'claude-3-5-haiku-20241022',
  gemini:     'gemini-1.5-flash',
};

async function getScanLLMConfig() {
  let provider = (process.env.LLM_PROVIDER || 'deepseek').toLowerCase();
  let model = null;
  try {
    const row = await dbGet('SELECT value FROM settings WHERE key = ?', ['llm_config_scan']);
    if (row) {
      const cfg = JSON.parse(row.value);
      if (cfg.provider) provider = cfg.provider.toLowerCase();
      if (cfg.model)    model    = cfg.model;
    }
  } catch { /* use defaults */ }

  const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
  const dbRow  = envKey ? null : await getLLMKey(provider).catch(() => null);
  const apiKey = envKey || dbRow?.api_key || null;

  return { provider, model: model || DEFAULT_MODELS[provider] || 'deepseek-chat', apiKey };
}

/**
 * Evaluate a batch of jobs against a single target using the Python agent.
 * @param {Array}  jobs       - Array of job objects with {title, company, url, jd_text}
 * @param {object} target     - Job target with {target_role, industries, target_location, metrics}
 * @param {number} concurrency
 * @returns {Array} [{url, scores: {...}}]
 */
export async function evaluateBatch(jobs, target, concurrency = 3) {
  const { provider, model, apiKey } = await getScanLLMConfig();

  if (!apiKey) {
    throw new Error(`No API key configured for scan provider "${provider}". Add it in Settings → API Keys.`);
  }

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), EVALUATE_TIMEOUT_MS);

  try {
    const res = await fetch(`${AGENT_URL}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        jobs: jobs.map(j => ({
          title:   j.title   || '',
          company: j.company || '',
          url:     j.url     || '',
          jd_text: (j.jd_text || '').slice(0, 2000),
        })),
        target: {
          target_role:      target.target_role      || '',
          industries:       target.industries       || '',
          target_location:  target.target_location  || '',
          metrics:          target.metrics          || '',
        },
        llm: { provider, model, api_key: apiKey },
        concurrency,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Agent /evaluate returned ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    return data.results; // [{url, scores}]
  } finally {
    clearTimeout(timer);
  }
}
