/**
 * Portal Catalog Service
 * Manages search_config (JSONB) per portal — verification, LLM discovery, scheduled refresh.
 */
import { dbAll, dbGet, dbRun } from '../loaders/database.mjs';
import { getLLMForProcess } from '../llm/index.mjs';
import { runPortalDiscoveryAgent } from './portal-discovery-agent.mjs';

const VERIFY_TIMEOUT_MS = 15_000;

/**
 * Test that a portal's primary search URL is reachable (HTTP 2xx/3xx).
 * Returns { ok, status, error }.
 */
async function pingUrl(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), VERIFY_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'career-ops/catalog-verify' },
      redirect: 'follow',
    });
    return { ok: res.ok || res.status < 400, status: res.status };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build the test URL for a portal given its search_config.
 * Uses a sample query so the URL is valid.
 */
function buildTestUrl(portal) {
  const cfg = portal.search_config;
  if (!cfg?.url_template) return portal.careers_url;
  const tpl = cfg.url_template;
  // Fill in common template variables with safe defaults
  return tpl
    .replace('{query}', encodeURIComponent('software engineer'))
    .replace('{tag}', 'software')
    .replace('{category}', 'software')
    .replace('{slug}', 'software-engineer')
    .replace('{company}', 'test');
}

/**
 * Verify a single portal and update its catalog_status + last_catalog_refresh.
 */
export async function verifyPortal(portalId) {
  const portal = await dbGet('SELECT * FROM portals WHERE id = ?', [portalId]);
  if (!portal) throw new Error(`Portal ${portalId} not found`);

  const cfg = portal.search_config || {};
  const method = cfg.method || 'unknown';

  let result;
  if (method === 'ats') {
    // ATS portals are per-company — just check the base careers_url
    result = await pingUrl(portal.careers_url || cfg.url_template?.replace('{company}', 'test') || '');
  } else if (method === 'unsupported') {
    result = { ok: false, error: 'unsupported' };
  } else {
    const url = buildTestUrl(portal);
    result = await pingUrl(url);
  }

  const status = result.ok ? 'ok' : 'failing';
  const now = new Date().toISOString();
  await dbRun(
    'UPDATE portals SET catalog_status = ?, last_catalog_refresh = ?, updated_at = ? WHERE id = ?',
    [status, now, now, portalId]
  );

  return { id: portalId, provider: portal.provider, status, ...result };
}

/**
 * Run agentic discovery for all portals.
 * The agent fetches pages, tests endpoints, reasons, and saves the found search_config.
 */
export async function refreshAllPortals(onEvent, signal) {
  const portals = await dbAll("SELECT * FROM portals WHERE enabled = 1 ORDER BY id ASC");
  const results = [];
  const llm = await getLLMForProcess('portal-discovery');

  for (const portal of portals) {
    if (signal?.aborted) {
      onEvent?.({ type: 'done', total: results.length, ok: results.filter(r => !r.error).length, failing: results.filter(r => r.error).length, cancelled: true });
      return results;
    }

    // Skip if already discovered and URL still works
    const existingCfg = portal.search_config;
    if (existingCfg?.url_template && existingCfg.method !== 'unsupported' && existingCfg.method !== 'unknown') {
      const testUrl = buildTestUrl(portal);
      const ping = await pingUrl(testUrl);
      if (ping.ok) {
        const now = new Date().toISOString();
        await dbRun(
          'UPDATE portals SET catalog_status = ?, last_catalog_refresh = ?, updated_at = ? WHERE id = ?',
          ['ok', now, now, portal.id]
        );
        results.push({ id: portal.id, provider: portal.provider, status: 'skipped', confidence: existingCfg.confidence });
        onEvent?.({ type: 'progress', id: portal.id, provider: portal.provider, status: 'skipped (still working)', skipped: true });
        continue;
      }
      onEvent?.({ type: 'log', id: portal.id, provider: portal.provider, message: `Existing config failed ping (${ping.status || ping.error}), re-discovering…` });
    }

    onEvent?.({ type: 'progress', id: portal.id, provider: portal.provider, status: 'discovering' });
    try {
      const cfg = await runPortalDiscoveryAgent(
        portal,
        llm,
        (msg) => onEvent?.({ type: 'log', id: portal.id, provider: portal.provider, message: msg }),
        signal,
      );
      const now = new Date().toISOString();
      const newConfig = {
        ...cfg,
        discovered_by: 'agent',
        discovered_at: now,
      };
      await dbRun(
        'UPDATE portals SET search_config = ?, catalog_status = ?, last_catalog_refresh = ?, updated_at = ? WHERE id = ?',
        [JSON.stringify(newConfig), cfg.confidence === 'high' ? 'ok' : 'pending', now, now, portal.id]
      );
      results.push({ id: portal.id, provider: portal.provider, status: cfg.method, confidence: cfg.confidence });
      onEvent?.({ type: 'progress', id: portal.id, provider: portal.provider, status: `${cfg.method} (${cfg.confidence})` });
    } catch (err) {
      results.push({ id: portal.id, provider: portal.provider, error: err.message });
      onEvent?.({ type: 'progress', id: portal.id, provider: portal.provider, status: 'error', message: err.message });
    }
  }

  const done = results.filter(r => !r.error).length;
  const failed = results.filter(r => r.error).length;
  onEvent?.({ type: 'done', total: results.length, ok: done, failing: failed });
  return results;
}

/**
 * Run the discovery agent for a single portal and save the result.
 */
export async function discoverPortalConfig(portalId) {
  const portal = await dbGet('SELECT * FROM portals WHERE id = ?', [portalId]);
  if (!portal) throw new Error(`Portal ${portalId} not found`);

  const llm = await getLLMForProcess('portal-discovery');
  if (!llm) throw new Error('No LLM configured for portal-discovery');

  const cfg = await runPortalDiscoveryAgent(portal, llm);

  const now = new Date().toISOString();
  const newConfig = {
    ...cfg,
    discovered_by: 'agent',
    discovered_at: now,
  };

  await dbRun(
    'UPDATE portals SET search_config = ?, catalog_status = ?, last_catalog_refresh = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(newConfig), cfg.confidence === 'high' ? 'ok' : 'pending', now, now, portalId]
  );

  return { id: portalId, provider: portal.provider, search_config: newConfig };
}
