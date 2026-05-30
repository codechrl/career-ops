/**
 * Scan Fetch Client
 * Calls the Python agent to retrieve job listings for a portal.
 * Routes to /fetch-jobs-browser for playwright portals, /fetch-jobs for all others.
 */

import { getLLMKey } from '../models/llm-key.mjs';
import { dbGet } from '../loaders/database.mjs';
import { getPortalCredentials, getPortalSession, savePortalSession } from '../models/portal.mjs';

const AGENT_URL = process.env.AGENT_SERVICE_URL || 'http://agent:8000';
const FETCH_TIMEOUT_MS   = 60_000;
const BROWSER_TIMEOUT_MS = 180_000;

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

function buildUrl(template, role) {
  const query    = encodeURIComponent(role.trim());
  const slug     = role.trim().toLowerCase().replace(/\s+/g, '-');
  const tag      = role.trim().toLowerCase().split(/\s+/)[0] || 'engineer';
  const category = tag;
  return template
    .replace('{query}',    query)
    .replace('{slug}',     slug)
    .replace('{tag}',      tag)
    .replace('{category}', category);
}

/**
 * Fetch job listings for a portal + target role via the Python agent.
 * Routes to browser-use path when search_config.method === 'playwright'.
 */
export async function fetchPortalJobs(portal, targetRole, limit = 50) {
  const method = portal.search_config?.method;
  if (method === 'playwright') {
    return _fetchPlaywright(portal, targetRole, limit);
  }
  return _fetchStandard(portal, targetRole, limit);
}

// ── Standard (json_api / rss_feed / html_scrape) ──────────────────────────────

async function _fetchStandard(portal, targetRole, limit = 50) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${AGENT_URL}/fetch-jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        portal_provider: portal.provider,
        portal_name:     portal.name,
        careers_url:     portal.careers_url || '',
        search_config:   portal.search_config || {},
        target_role:     targetRole,
        limit,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Agent /fetch-jobs returned ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.jobs || [];
  } finally {
    clearTimeout(timer);
  }
}

// ── Playwright (browser-use) ──────────────────────────────────────────────────

async function _fetchPlaywright(portal, targetRole, limit = 50) {
  const cfg   = portal.search_config || {};
  const jobsUrl = cfg.url_template ? buildUrl(cfg.url_template, targetRole) : portal.careers_url;
  if (!jobsUrl) throw new Error(`${portal.name}: no url_template or careers_url for playwright fetch`);

  const creds = await getPortalCredentials(portal.id) || {};
  const sessionRow = await getPortalSession(portal.id);
  const { provider, model, apiKey } = await getScanLLMConfig();
  if (!apiKey) throw new Error(`No API key configured for scan provider "${provider}".`);

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BROWSER_TIMEOUT_MS);
  let result;
  try {
    const res = await fetch(`${AGENT_URL}/fetch-jobs-browser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        portal_id:    portal.id,
        portal_name:  portal.name,
        jobs_url:     jobsUrl,
        login_url:    creds.login_url || cfg.login_url || null,
        credentials:  {
          username:     creds.username    || null,
          password:     creds.password    || null,
          totp_secret:  creds.totp_secret || null,
          login_url:    creds.login_url   || null,
        },
        session_state: sessionRow?.storage_state || null,
        target_role:   targetRole,
        limit,
        llm: { provider, model, api_key: apiKey },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Agent /fetch-jobs-browser returned ${res.status}: ${body.slice(0, 200)}`);
    }
    result = await res.json();
  } finally {
    clearTimeout(timer);
  }

  // Persist updated session state
  if (result.session_state) {
    await savePortalSession(portal.id, result.session_state).catch(err =>
      console.warn(`[scan-fetch] failed to save session for portal ${portal.id}: ${err.message}`)
    );
  }

  return result.jobs || [];
}
