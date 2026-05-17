/**
 * Portal Catalog Service
 * Manages search_config (JSONB) per portal — verification, LLM discovery, scheduled refresh.
 */
import { dbAll, dbGet, dbRun } from '../loaders/database.mjs';
import { getLLM, getLLMForProcess } from '../llm/index.mjs';
import { structuredChat } from './structured-llm.mjs';

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
 * Verify all portals with a search_config (non-ATS, non-unsupported).
 * Returns array of results.
 */
export async function refreshAllPortals(onEvent) {
  const portals = await dbAll('SELECT id FROM portals ORDER BY id ASC');
  const results = [];
  for (const { id } of portals) {
    try {
      const r = await verifyPortal(id);
      results.push(r);
      if (onEvent) onEvent({ type: 'progress', id, provider: r.provider, status: r.status });
    } catch (err) {
      results.push({ id, error: err.message });
      if (onEvent) onEvent({ type: 'progress', id, provider: String(id), status: 'failing' });
    }
  }
  const ok = results.filter(r => r.status === 'ok').length;
  const failing = results.filter(r => r.status !== 'ok').length;
  if (onEvent) onEvent({ type: 'done', total: results.length, ok, failing });
  return results;
}

/**
 * Use LLM to auto-discover the search approach for a portal.
 * Fetches the portal homepage + /jobs page to infer method/url_template/notes.
 */
export async function discoverPortalConfig(portalId) {
  const portal = await dbGet('SELECT * FROM portals WHERE id = ?', [portalId]);
  if (!portal) throw new Error(`Portal ${portalId} not found`);

  const llm = await getLLMForProcess('portal-discovery');
  if (!llm) throw new Error('No LLM configured');

  const baseUrl = portal.careers_url || `https://${portal.provider}.com`;

  // Fetch homepage and /jobs page for context
  let pageContent = '';
  for (const suffix of ['', '/jobs', '/api', '/rss']) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(`${baseUrl}${suffix}`, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'career-ops/catalog-discover', Accept: 'text/html,application/json,application/xml' },
      });
      clearTimeout(t);
      const text = await res.text();
      // Take first 3000 chars of each page as context
      pageContent += `\n\n--- ${baseUrl}${suffix} (${res.status}) ---\n${text.slice(0, 3000)}`;
      if (pageContent.length > 8000) break;
    } catch { /* skip failed pages */ }
  }

  const schema = {
    method: 'rss_feed',
    url_template: 'https://example.com/jobs.xml?q={query}',
    notes: 'Short description of how search works',
    confidence: 'high',
  };

  const result = await structuredChat(llm, schema, [
    {
      role: 'system',
      content: `You are a job board API analyst. Given content from a job board website, identify the best way to programmatically search for job listings.
Methods: rss_feed, json_api, html_scrape, playwright, ats, unsupported.
URL template variables: {query} = URL-encoded search term, {tag} = simple tag, {category} = category slug, {slug} = role slug, {company} = company identifier.
Return a structured JSON with method, url_template (or null if ats/unsupported), notes, confidence (high/medium/low).`,
    },
    {
      role: 'user',
      content: `Portal: ${portal.name} (${portal.provider})\nBase URL: ${baseUrl}\n\nPage content samples:\n${pageContent}\n\nIdentify the search method and URL template.`,
    },
  ]);

  const now = new Date().toISOString();
  const newConfig = {
    method: result.method || 'unknown',
    url_template: result.url_template || null,
    notes: result.notes || '',
    discovered_by: 'llm',
    discovered_at: now,
    confidence: result.confidence || 'low',
  };

  await dbRun(
    'UPDATE portals SET search_config = ?, catalog_status = ?, last_catalog_refresh = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(newConfig), 'pending', now, now, portalId]
  );

  return { id: portalId, provider: portal.provider, search_config: newConfig };
}
