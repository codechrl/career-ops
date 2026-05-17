/**
 * Portal Discovery Agent
 * Uses Vercel AI SDK generateText with native tool calling.
 * Tools: fetch_url, test_search, extract_links, finish
 */
import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { getAISdkModel } from '../llm/ai-sdk-model.mjs';
import { getLLMKey } from '../models/llm-key.mjs';

const MAX_STEPS = 14;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_BODY_CHARS = 3000;

// ── Tools ──────────────────────────────────────────────────────────────────────

async function fetchUrl({ url, method = 'GET' }) {
  if (!url || typeof url !== 'string') return { error: 'url is required' };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'career-ops/portal-discovery (+https://github.com/career-ops)',
        Accept: 'text/html,application/json,application/xml,application/rss+xml,*/*;q=0.9',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);
    const contentType = res.headers.get('content-type') || '';
    const body = method === 'HEAD' ? '' : (await res.text()).slice(0, MAX_BODY_CHARS);
    return { status: res.status, ok: res.ok, content_type: contentType, body, url: res.url };
  } catch (err) {
    return { error: err.message, url };
  }
}

async function testSearch({ url_template, query = 'software engineer' }) {
  if (!url_template) return { error: 'url_template is required' };
  const filled = url_template
    .replace(/\{query\}/g, encodeURIComponent(query))
    .replace(/\{tag\}/g, 'software')
    .replace(/\{slug\}/g, 'software-engineer')
    .replace(/\{category\}/g, 'software')
    .replace(/\{company\}/g, 'test');
  const result = await fetchUrl({ url: filled });
  if (result.error) return result;
  const body = result.body || '';
  const isJson = /^\s*[\[{]/.test(body);
  const isXml = /^\s*(<\?xml|<rss|<feed|<channel)/i.test(body);
  const hasJobKeyword = /\b(job|position|role|vacancy|opening|career|title|company)\b/i.test(body);
  const itemCount = isJson
    ? (body.match(/"(title|job_title|name)"\s*:/g) || []).length
    : (body.match(/<(item|entry|job)[\s>]/gi) || []).length;
  return {
    ...result,
    is_json: isJson,
    is_xml: isXml,
    has_job_keyword: hasJobKeyword,
    estimated_item_count: itemCount,
    looks_like_jobs: hasJobKeyword && (isJson || isXml || itemCount > 0),
  };
}

async function extractLinks({ url }) {
  const result = await fetchUrl({ url });
  if (result.error) return result;
  const body = result.body || '';
  const links = new Set();
  const hrefRe = /href=["']([^"'#\s]+)["']/gi;
  let m;
  while ((m = hrefRe.exec(body)) !== null) {
    const href = m[1];
    if (/job|api|rss|feed|search|career|position|vacancy|opening/i.test(href)) {
      // Resolve relative URLs
      try {
        const abs = new URL(href, url).href;
        links.add(abs);
      } catch {
        links.add(href);
      }
    }
  }
  // Also look for inline text references to API paths
  const apiRe = /["'`](\/[^\s"'`<>]*(?:api|rss|feed|search|jobs)[^\s"'`<>]*)["'`]/gi;
  while ((m = apiRe.exec(body)) !== null) {
    try { links.add(new URL(m[1], url).href); } catch { links.add(m[1]); }
  }
  return { links: [...links].slice(0, 40), total_found: links.size };
}

async function googleSearch({ query }) {
  if (!query) return { error: 'query is required' };
  const keyRow = await getLLMKey('serpapi');
  if (!keyRow?.api_key) return { error: 'SerpAPI key not configured. Add it in Settings → API Keys.' };
  try {
    const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=10&api_key=${keyRow.api_key}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return { error: `SerpAPI error: HTTP ${res.status}` };
    const data = await res.json();
    const results = (data.organic_results || []).map(r => ({
      title: r.title,
      link: r.link,
      snippet: r.snippet,
    }));
    return { results, total: results.length };
  } catch (err) {
    return { error: err.message };
  }
}

// ── System prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a job board search analyst. Your task is to discover the best programmatic way to search for job listings on a given job portal.

Use the provided tools to explore the portal: fetch pages, extract links, test search URL templates, and if stuck, use google_search to find API documentation or developer guides.

Methods to identify:
- rss_feed: Portal exposes an RSS/Atom feed (prefer this)
- json_api: Portal has a JSON API endpoint returning job listings (prefer this)
- html_scrape: Portal returns parseable HTML
- playwright: Portal requires a real browser (JS-heavy SPAs — last resort)
- ats: Per-company ATS (greenhouse.io, ashby, lever, workable) — search per company slug
- unsupported: Cannot be searched programmatically

URL template variables:
- {query} = URL-encoded search term
- {tag} = simple lowercase tag
- {slug} = role slug like "software-engineer"
- {category} = category slug
- {company} = company identifier

Strategy:
1. Fetch the main page / /jobs path to understand the portal structure
2. Use extract_links to find API/RSS/search endpoints
3. Test promising templates with test_search
4. If the portal structure is unclear, use google_search to find developer docs or API info (e.g. "site:portal.com api jobs" or "portal.com RSS feed")
5. Prefer JSON API > RSS > HTML scrape > Playwright
6. Confirm your best candidate returns actual job data, then call finish.`;

// ── Agent ──────────────────────────────────────────────────────────────────────

/**
 * @param {object}   portal  - { id, name, provider, careers_url }
 * @param {*}        _llm    - legacy param (ignored; AI SDK reads config directly)
 * @param {function} [onLog]
 * @param {AbortSignal} [signal]
 */
export async function runPortalDiscoveryAgent(portal, _llm, onLog, signal) {
  const baseUrl = portal.careers_url || `https://${portal.provider}.com`;
  const log = (msg) => onLog?.(msg);

  log(`Starting discovery for ${portal.name} (${baseUrl})`);

  let model;
  try {
    model = await getAISdkModel('portal-discovery');
  } catch (err) {
    log(`AI SDK model error: ${err.message}`);
    return { method: 'unknown', url_template: null, notes: err.message, confidence: 'low' };
  }

  let discoveryResult = null;

  const tools = {
    fetch_url: tool({
      description: 'Fetch a URL and return status, content-type, and body preview. Use method GET (default) or HEAD.',
      inputSchema: z.object({
        url: z.string(),
        method: z.enum(['GET', 'HEAD']),
      }),
      execute: async ({ url, method = 'GET' }) => {
        if (signal?.aborted) return { error: 'Cancelled' };
        log(`  → fetch_url(${url})`);
        return fetchUrl({ url, method });
      },
    }),
    test_search: tool({
      description: 'Fill a URL template with a sample query and check if the response looks like job listings. Use {query} placeholder in the template.',
      inputSchema: z.object({
        url_template: z.string(),
        query: z.string(),
      }),
      execute: async ({ url_template, query = 'software engineer' }) => {
        if (signal?.aborted) return { error: 'Cancelled' };
        log(`  → test_search(${url_template})`);
        return testSearch({ url_template, query });
      },
    }),
    extract_links: tool({
      description: 'Extract all job/api/rss/search-related links from a page.',
      inputSchema: z.object({ url: z.string() }),
      execute: async ({ url }) => {
        if (signal?.aborted) return { error: 'Cancelled' };
        log(`  → extract_links(${url})`);
        return extractLinks({ url });
      },
    }),
    google_search: tool({
      description: 'Search Google via SerpAPI. Use this to find API docs, RSS feeds, or developer guides for the portal when direct exploration is unclear.',
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        if (signal?.aborted) return { error: 'Cancelled' };
        log(`  → google_search(${query})`);
        return googleSearch({ query });
      },
    }),
    finish: tool({
      description: 'Submit your final discovery result.',
      inputSchema: z.object({
        method: z.enum(['rss_feed', 'json_api', 'html_scrape', 'playwright', 'ats', 'unsupported', 'unknown']),
        url_template: z.string().nullable(),
        notes: z.string(),
        confidence: z.enum(['high', 'medium', 'low']),
      }),
      execute: async (result) => {
        discoveryResult = result;
        log(`Done → ${result.method} (${result.confidence})`);
        return { ok: true };
      },
    }),
  };

  try {
    await generateText({
      model,
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      maxRetries: 3,
      temperature: 0.2,
      maxOutputTokens: 1500,
      abortSignal: signal,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `Discover how to programmatically search for jobs on this portal:\n\nName: ${portal.name}\nProvider: ${portal.provider}\nURL: ${baseUrl}\n\nStart by fetching the main page or the /jobs path.` },
      ],
      onStepFinish({ text }) {
        if (text?.trim()) log(`Thought: ${text.trim().slice(0, 200)}`);
      },
    });
  } catch (err) {
    if (err.name === 'AbortError' || signal?.aborted) {
      return { method: 'unknown', url_template: null, notes: 'Cancelled', confidence: 'low' };
    }
    log(`Agent error: ${err.message}`);
  }

  if (discoveryResult) return discoveryResult;
  log('Agent finished without calling finish. Marking as unknown.');
  return { method: 'unknown', url_template: null, notes: 'Agent did not submit a result', confidence: 'low' };
}
