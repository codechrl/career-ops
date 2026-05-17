/**
 * Scan Fetch Client
 * Calls the Python agent /fetch-jobs endpoint to retrieve job listings
 * for a portal based on its search_config (set by portal discovery).
 */

const AGENT_URL = process.env.AGENT_SERVICE_URL || 'http://agent:8000';
const FETCH_TIMEOUT_MS = 60_000;

/**
 * Fetch job listings for a portal + target role via the Python agent.
 * @param {object} portal  - DB row: { provider, name, careers_url, search_config }
 * @param {string} targetRole
 * @param {number} [limit]
 * @returns {Promise<Array<{title, url, company, jd_text}>>}
 */
export async function fetchPortalJobs(portal, targetRole, limit = 50) {
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
