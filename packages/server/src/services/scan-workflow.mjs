import { load as cheerioLoad } from 'cheerio';
import { dbGet, dbRun, dbInsert } from '../loaders/database.mjs';
import { evaluateBatch } from './scan-evaluate-client.mjs';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isRelevant(title, targetRole) {
  const stops = new Set(['senior', 'junior', 'lead', 'staff', 'principal', 'remote',
    'full', 'time', 'part', 'and', 'or', 'the', 'of', 'for', 'with']);
  const keywords = targetRole.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stops.has(w));
  if (!keywords.length) return true;
  const t = title.toLowerCase();
  return keywords.some(k => t.includes(k));
}

function stripHtml(html) {
  const $ = cheerioLoad(html);
  $('script, style').remove();
  return $.text().replace(/\s+/g, ' ').trim();
}

function extractJD(html) {
  const $ = cheerioLoad(html);
  $('script, style, nav, header, footer, aside, [role="navigation"]').remove();
  const selectors = [
    '[data-testid*="description"]', '.job-description', '#job-description',
    '.description', '.posting-description', '.job-details', '.content',
    'article', 'main',
  ];
  for (const sel of selectors) {
    const text = $(sel).first().text().replace(/\s+/g, ' ').trim();
    if (text.length > 300) return text.slice(0, 5000);
  }
  return $('p').map((_, el) => $(el).text()).get().join(' ').replace(/\s+/g, ' ').trim().slice(0, 5000);
}

const UA = 'Mozilla/5.0 (career-ops/1.0; +https://github.com/career-ops)';

async function safeFetch(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res;
}

// ─── Search providers — all return Array<{title, url, company, jd_text?}> ───
async function searchRemotive(target, signal) {
  const kw = target.target_role.split(/\s+/).slice(0, 4).join(' ');
  const res = await safeFetch(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(kw)}&limit=50`, { signal });
  const { jobs = [] } = await res.json();
  return jobs.map(j => ({
    title: j.title || '',
    url: j.url || '',
    company: j.company_name || '',
    jd_text: j.description ? stripHtml(j.description).slice(0, 5000) : '',
  }));
}

async function searchRemoteOK(target, signal) {
  const tag = target.target_role.toLowerCase().split(/\s+/)[0];
  const res = await safeFetch(`https://remoteok.com/api?tags=${encodeURIComponent(tag)}`, { signal });
  const data = await res.json();
  return (Array.isArray(data) ? data.slice(1) : []).filter(j => j.position).map(j => ({
    title: j.position || '',
    url: j.url || `https://remoteok.com/l/${j.slug || j.id}`,
    company: j.company || '',
    jd_text: j.description ? stripHtml(j.description).slice(0, 5000) : '',
  }));
}

async function searchWeWorkRemotely(target, signal) {
  const term = target.target_role.split(/\s+/).slice(0, 3).join(' ');
  const res = await safeFetch(`https://weworkremotely.com/remote-jobs.rss?term=${encodeURIComponent(term)}`, { signal });
  const xml = await res.text();
  const $ = cheerioLoad(xml, { xmlMode: true });
  return $('item').map((_, el) => {
    const raw = $(el).find('title').first().text();
    const title = raw.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const link = $(el).find('link').first().text().trim() || $(el).find('url').first().text().trim();
    const company = $(el).find('author').first().text().replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    return { title, url: link, company, jd_text: '' };
  }).get().filter(j => j.url && j.title);
}

async function searchHimalayas(target, signal) {
  const q = target.target_role;
  const res = await safeFetch(`https://himalayas.app/jobs/api?q=${encodeURIComponent(q)}&limit=30`, { signal });
  const data = await res.json();
  const jobs = data.jobs || data.data || [];
  return jobs.map(j => ({
    title: j.title || j.jobTitle || '',
    url: j.url || j.applicationUrl ||
      (j.company?.slug && j.slug ? `https://himalayas.app/companies/${j.company.slug}/jobs/${j.slug}` : ''),
    company: j.companyName || j.company?.name || '',
    jd_text: '',
  }));
}

async function searchWorkingNomads(target, signal) {
  const cat = encodeURIComponent(target.target_role.toLowerCase().split(/\s+/)[0]);
  const res = await safeFetch(`https://www.workingnomads.com/api/exposed_jobs/?category=${cat}`, { signal });
  const data = await res.json();
  return (Array.isArray(data) ? data.slice(0, 40) : []).filter(j => j.title).map(j => ({
    title: j.title || '',
    url: j.url || '',
    company: j.company_name || '',
    jd_text: '',
  }));
}

// ─── Playwright browser helper ───────────────────────────────────────────────
async function withBrowser(fn) {
  const { chromium } = await import('playwright');
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
           '--disable-gpu', '--single-process'],
  });
  try { return await fn(browser); }
  finally { await browser.close().catch(() => {}); }
}

async function scrapeJobsFromPage(browser, url, selectors) {
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'User-Agent': UA });
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    const jobs = await page.evaluate((sels) => {
      const cards = document.querySelectorAll(sels.card);
      return [...cards].slice(0, 50).map(el => ({
        title: el.querySelector(sels.title)?.textContent?.trim() || '',
        url: el.querySelector(sels.link)?.href || el.querySelector('a')?.href || '',
        company: el.querySelector(sels.company)?.textContent?.trim() || '',
      })).filter(j => j.title && j.url);
    }, selectors);
    return jobs.map(j => ({ ...j, jd_text: '' }));
  } catch (err) {
    return [{ __error: err.message }];
  } finally {
    await page.close().catch(() => {});
  }
}

async function searchAiJobs(target, signal) {
  const q = encodeURIComponent(target.target_role);
  // Try multiple API patterns first
  const apiUrls = [
    `https://ai-jobs.net/jobs/api/?title=${q}&format=json`,
    `https://ai-jobs.net/api/jobs/?search=${q}`,
    `https://ai-jobs.net/api/v0/jobs/?search=${q}&format=json`,
  ];
  for (const url of apiUrls) {
    try {
      const res = await safeFetch(url, { signal });
      const data = await res.json();
      const jobs = data.results || data.jobs || (Array.isArray(data) ? data : []);
      if (Array.isArray(jobs) && jobs.length > 0) {
        return jobs.slice(0, 40).filter(j => j.title).map(j => ({
          title: j.title || '',
          url: j.url || j.absolute_url || j.link || `https://ai-jobs.net${j.path || ''}`,
          company: j.company || j.company_name || '',
          jd_text: '',
        }));
      }
    } catch {}
  }
  // Fallback: Playwright scraping
  try {
    return await withBrowser(browser => scrapeJobsFromPage(browser,
      `https://ai-jobs.net/search/?search-query=${q}`,
      { card: '.job-card, article.job, li.job, [class*="job-item"]',
        title: 'h2, h3, [class*="title"], [class*="job-title"]',
        link: 'a[href*="job"], a[href*="/"]',
        company: '[class*="company"], [class*="employer"]' }));
  } catch (err) {
    return [{ __error: `ai-jobs browser scrape failed: ${err.message}` }];
  }
}

async function searchYCJobs(target, signal) {
  const q = target.target_role.toLowerCase();
  try {
    // YC uses a JSON feed
    const res = await safeFetch(`https://www.ycombinator.com/jobs?q=${encodeURIComponent(q)}`, { signal });
    const html = await res.text();
    const $ = cheerioLoad(html);
    const jobs = [];
    $('a[href*="/companies/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const title = $(el).text().trim();
      if (title && href && href.includes('/jobs')) {
        jobs.push({ title, url: href.startsWith('http') ? href : `https://www.ycombinator.com${href}`, company: '', jd_text: '' });
      }
    });
    return jobs.slice(0, 30);
  } catch {
    return [];
  }
}

async function searchTrueUp(target, signal) {
  const q = encodeURIComponent(target.target_role);
  try {
    const res = await safeFetch(`https://trueup.io/jobs?q=${q}&jobType=Full-Time`, { signal });
    const html = await res.text();
    const $ = cheerioLoad(html);
    const jobs = [];
    $('a[href*="/jobs/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const title = $(el).find('[class*="title"], h3, h2').first().text().trim() || $(el).text().trim();
      const company = $(el).find('[class*="company"]').first().text().trim();
      if (title && href) jobs.push({ title, url: href.startsWith('http') ? href : `https://trueup.io${href}`, company, jd_text: '' });
    });
    return jobs.slice(0, 30);
  } catch {
    return [];
  }
}

async function searchRemoteRocketship(target, signal) {
  const q = encodeURIComponent(target.target_role);
  try {
    const res = await safeFetch(`https://remoterocketship.com/jobs?search=${q}`, { signal });
    const html = await res.text();
    const $ = cheerioLoad(html);
    const jobs = [];
    $('a[href*="/jobs/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const title = $(el).find('h2, h3, [class*="title"]').first().text().trim() || $(el).text().trim();
      const company = $(el).find('[class*="company"]').first().text().trim();
      if (title && href) jobs.push({ title, url: href.startsWith('http') ? href : `https://remoterocketship.com${href}`, company, jd_text: '' });
    });
    return jobs.slice(0, 30);
  } catch {
    return [];
  }
}

function getRoleSlugRemoteYeah(targetRole) {
  const r = targetRole.toLowerCase();
  if (r.includes('machine learning ops') || r.includes('mlops')) return 'machine-learning-ops-engineer';
  if (r.includes('machine learning') || r.includes('ml engineer')) return 'machine-learning-engineer';
  if (r.includes('artificial intelligence') || r.includes('ai engineer') || r.includes('ai native')) return 'artificial-intelligence-engineer';
  if (r.includes('data scientist')) return 'data-scientist';
  if (r.includes('data engineer')) return 'data-engineer';
  if (r.includes('data analyst')) return 'data-analyst';
  if (r.includes('data architect')) return 'data-architect';
  if (r.includes('big data')) return 'big-data-engineer';
  if (r.includes('business intelligence') && r.includes('analyst')) return 'business-intelligence-analyst';
  if (r.includes('business intelligence')) return 'business-intelligence-engineer';
  if (r.includes('developer relations') || r.includes('devrel')) return 'developer-relations-engineer';
  if (r.includes('developer advocate')) return 'developer-advocate';
  if (r.includes('devops')) return 'devops-engineer';
  if (r.includes('site reliability') || (r.includes('sre') && r.includes('engineer'))) return 'site-reliability-engineer';
  if (r.includes('platform engineer')) return 'platform-engineer';
  if (r.includes('infrastructure engineer')) return 'infrastructure-engineer';
  if (r.includes('cloud architect')) return 'cloud-architect';
  if (r.includes('cloud engineer')) return 'cloud-engineer';
  if (r.includes('full stack') || r.includes('fullstack') || r.includes('full-stack')) return 'full-stack-engineer';
  if (r.includes('frontend') || r.includes('front-end') || r.includes('front end')) return 'frontend-engineer';
  if (r.includes('backend') || r.includes('back-end') || r.includes('back end')) return 'backend-engineer';
  if (r.includes('android')) return 'android-developer';
  if (r.includes('ios developer') || r.includes('ios engineer')) return 'ios-developer';
  if (r.includes('mobile')) return 'cross-platform-mobile-developer';
  if (r.includes('blockchain')) return 'blockchain-engineer';
  if (r.includes('web3')) return 'web3-developer';
  if (r.includes('web developer') || r.includes('web dev')) return 'web-developer';
  if (r.includes('database admin') || r.includes('dba')) return 'database-administrator';
  if (r.includes('database engineer')) return 'database-engineer';
  if (r.includes('network admin')) return 'network-administrator';
  if (r.includes('network engineer')) return 'network-engineer';
  if (r.includes('cybersecurity') || r.includes('security engineer')) return 'cybersecurity-engineer';
  if (r.includes('quality assurance') || r.includes('qa engineer') || r.includes('test engineer')) return 'qa-engineer';
  if (r.includes('game developer') || r.includes('game engineer')) return 'game-engineer';
  if (r.includes('prompt engineer')) return 'prompt-engineer';
  if (r.includes('software architect')) return 'software-architect';
  if (r.includes('solutions architect') || r.includes('solution architect')) return 'solution-architect';
  if (r.includes('solutions engineer')) return 'solutions-engineer';
  if (r.includes('system admin') || r.includes('sysadmin')) return 'system-administrator';
  if (r.includes('systems engineer')) return 'systems-engineer';
  if (r.includes('technical lead') || r.includes('tech lead')) return 'technical-lead';
  return 'software-engineer';
}

async function searchRemoteYeah(target, signal) {
  const slug = getRoleSlugRemoteYeah(target.target_role);
  const feedUrl = `https://remoteyeah.com/remote-${slug}-jobs.xml`;
  const res = await safeFetch(feedUrl, { signal });
  const xml = await res.text();
  const $ = cheerioLoad(xml, { xmlMode: true });
  return $('item').map((_, el) => {
    const titleRaw = $(el).find('title').text().replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const title = titleRaw.replace(/^Remote\s+/i, '').replace(/\s+at\s+[^a-z].*$/i, '').trim() || titleRaw;
    const company = $(el).find('company').text().replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const descHtml = $(el).find('description').text();
    const jd_text = stripHtml(descHtml).slice(0, 5000);
    const link = $(el).find('link').text().trim();
    return { title, url: link, company, jd_text };
  }).get().filter(j => j.title && j.url);
}

// Map portal.provider → search function
const SEARCH_FNS = {
  remotive:          searchRemotive,
  remoteok:          searchRemoteOK,
  weworkremotely:    searchWeWorkRemotely,
  himalayas:         searchHimalayas,
  workingnomads:     searchWorkingNomads,
  'ai-jobs':         searchAiJobs,
  ycjobs:            searchYCJobs,
  trueup:            searchTrueUp,
  remoterocketship:  searchRemoteRocketship,
  remoteyeah:        searchRemoteYeah,
};

// ─── Concurrency helper ───────────────────────────────────────────────────────
async function pMap(items, fn, concurrency = 6) {
  const results = [];
  const queue = [...items.entries()];
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (queue.length) {
      const [i, item] = queue.shift();
      results[i] = await fn(item).catch(err => ({ __error: err.message }));
    }
  });
  await Promise.all(workers);
  return results;
}

// ─── ScanWorkflow ─────────────────────────────────────────────────────────────
export class ScanWorkflow {
  constructor({ targetIds = [], portalIds = [], scanRunId, signal, onEvent, useBrowser = false }) {
    this.targetIds  = targetIds;
    this.portalIds  = portalIds;
    this.scanRunId  = scanRunId;
    this.signal     = signal || new AbortController().signal;
    this.onEvent    = onEvent || (() => {});
    this.useBrowser = useBrowser;
    this.stats      = { new: 0, skipped: 0, errors: 0 };
  }

  emit(type, message, extra = {}) {
    const ev = { type, agent: extra.agent || 'scan', message, ...extra };
    console.log(`[scan-workflow] ${type} [${ev.agent}] ${message}`);
    this.onEvent(ev);
  }

  async run() {
    // Load targets
    let targets;
    if (this.targetIds.length) {
      const ph = this.targetIds.map((_, i) => `$${i + 1}`).join(',');
      targets = (await dbRun(`SELECT * FROM job_targets WHERE id IN (${ph})`, this.targetIds)).rows;
    } else {
      targets = (await dbRun('SELECT * FROM job_targets WHERE is_active = 1')).rows;
    }
    if (!targets.length) {
      this.emit('warning', 'No active targets found. Activate at least one job target.');
      return;
    }

    // Load portals
    let portals;
    if (this.portalIds.length) {
      const ph = this.portalIds.map((_, i) => `$${i + 1}`).join(',');
      portals = (await dbRun(`SELECT * FROM portals WHERE id IN (${ph})`, this.portalIds)).rows;
    } else {
      portals = (await dbRun('SELECT * FROM portals WHERE enabled = 1')).rows;
    }

    const searchablePortals = portals.filter(p => SEARCH_FNS[p.provider]);
    const unsupported = portals.filter(p => !SEARCH_FNS[p.provider]);
    if (unsupported.length) {
      this.emit('info', `[Fetch] Skipping unsupported portals: ${unsupported.map(p => p.name).join(', ')}`, { agent: 'fetch' });
    }
    if (!searchablePortals.length) {
      this.emit('warning', 'No searchable portals available.');
      return;
    }

    // LLM config is read by scan-evaluate-client.mjs directly from DB

    // ── STAGE 1: Fetch all portals × targets in parallel ─────────────────────
    this.emit('progress',
      `[Fetch] Searching ${searchablePortals.length} portal(s) × ${targets.length} target(s) in parallel…`,
      { agent: 'fetch' });

    const pairs = searchablePortals.flatMap(portal => targets.map(target => ({ portal, target })));

    const fetchResults = await pMap(pairs, async ({ portal, target }) => {
      if (this.signal.aborted) return [];
      const fn = SEARCH_FNS[portal.provider];
      const raw = await fn(target, this.signal);
      const newJobs = [];
      for (const job of raw) {
        if (!job.url || !job.title) continue;
        if (!isRelevant(job.title, target.target_role)) continue;
        const exists = await dbGet('SELECT 1 FROM listings WHERE source_url = ?', [job.url]);
        if (exists) { this.stats.skipped++; continue; }
        newJobs.push({ ...job, target, portalName: portal.name });
      }
      this.emit('progress',
        `[Fetch] ${portal.name} × "${target.target_role}": ${newJobs.length} new`,
        { agent: 'fetch' });
      return newJobs;
    }, 8); // 8 parallel portal×target fetches

    const pending = fetchResults.flat().filter(j => !j.__error);
    const fetchErrors = fetchResults.filter(r => r?.__error);
    this.stats.errors += fetchErrors.length;
    fetchErrors.forEach(e => this.emit('error', `[Fetch] ${e.__error}`, { agent: 'fetch' }));

    if (!pending.length) {
      this.emit('info',
        `[Fetch] No new listings found (${this.stats.skipped} already tracked).`,
        { agent: 'fetch' });
      await this.saveStats();
      return;
    }
    this.emit('progress', `[Fetch] ${pending.length} new listings to process`, { agent: 'fetch' });

    // ── STAGE 2: Scrape JDs in parallel (only where jd_text is empty) ─────────
    this.emit('progress', `[Scrape] Fetching job descriptions in parallel…`, { agent: 'scrape' });
    const toScrape = pending.filter(j => !j.jd_text || j.jd_text.length < 200);
    this.emit('progress', `[Scrape] ${toScrape.length} URLs to scrape`, { agent: 'scrape' });

    const scrapeCount = { n: 0 };
    await pMap(toScrape, async job => {
      if (this.signal.aborted) return;
      const idx = ++scrapeCount.n;
      try {
        const res = await fetch(job.url, {
          signal: AbortSignal.timeout(10000),
          headers: { 'User-Agent': UA },
          redirect: 'follow',
        });
        if (res.ok) {
          job.jd_text = extractJD(await res.text());
          this.emit('progress',
            `[Scrape] (${idx}/${toScrape.length}) "${job.title}" @ ${job.company} — ${job.jd_text.length} chars`,
            { agent: 'scrape' });
        } else {
          this.emit('warning',
            `[Scrape] (${idx}/${toScrape.length}) HTTP ${res.status} — "${job.title}"`,
            { agent: 'scrape' });
        }
      } catch (err) {
        this.emit('warning',
          `[Scrape] (${idx}/${toScrape.length}) failed "${job.title}" — ${err.message}`,
          { agent: 'scrape' });
      }
    }, 10); // 10 parallel scrapes

    // ── STAGE 3: Evaluate with LLM in parallel (batched) ─────────────────────
    this.emit('progress', `[Evaluate] Scoring ${pending.length} listings via Python agent…`, { agent: 'evaluate' });

    // Group pending jobs by target_id so each target gets one batch call
    const byTarget = new Map();
    for (const job of pending) {
      const tid = job.target.id;
      if (!byTarget.has(tid)) byTarget.set(tid, []);
      byTarget.get(tid).push(job);
    }

    for (const [, group] of byTarget) {
      if (this.signal.aborted) break;
      const target = group[0].target;
      this.emit('progress',
        `[Evaluate] Sending ${group.length} jobs for target "${target.target_role}" to Python agent…`,
        { agent: 'evaluate' });
      try {
        const evalResults = await evaluateBatch(group, target, 3);
        // Map results back by URL
        const byUrl = new Map(evalResults.map(r => [r.url, r.scores]));
        for (const job of group) {
          const scores = byUrl.get(job.url);
          if (scores) {
            job.scores = scores;
            this.emit('progress',
              `[Evaluate] "${job.title}" → overall=${scores.overall_score} role=${scores.role_score} [${scores.recommendation}]`,
              { agent: 'evaluate' });
          } else {
            job.scores = { role_score: 0, industry_score: 0, location_score: 0, preference_score: 0, overall_score: 0, preference_scores: {}, recommendation: 'Research more', recommendation_reason: 'No result returned.', next_action: 'Reach out', next_action_detail: '' };
          }
        }
      } catch (err) {
        this.emit('error', `[Evaluate] batch failed for target "${target.target_role}": ${err.message}`, { agent: 'evaluate' });
        this.stats.errors += group.length;
        for (const job of group) {
          job.scores = { role_score: 0, industry_score: 0, location_score: 0, preference_score: 0, overall_score: 0, preference_scores: {}, recommendation: 'Research more', recommendation_reason: 'Evaluation failed.', next_action: 'Reach out', next_action_detail: '' };
        }
      }
    }

    // ── STAGE 4: Save ─────────────────────────────────────────────────────────
    this.emit('progress', `[Save] Storing ${pending.length} results…`, { agent: 'save' });
    const now = new Date().toISOString();
    let saveIdx = 0;

    for (const job of pending) {
      if (this.signal.aborted) break;
      saveIdx++;
      this.emit('progress',
        `[Save] (${saveIdx}/${pending.length}) "${job.title}" @ ${job.company || '?'} score=${job.scores?.overall_score ?? 0}`,
        { agent: 'save' });
      try {
        const s = job.scores || {};
        const listingId = await dbInsert(
          `INSERT INTO listings
            (company, role, score, status, source_url, source_portal, scan_run_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            job.company || job.portalName,
            job.title,
            String(s.overall_score || 0),
            'To Apply',
            job.url,
            job.portalName,
            this.scanRunId,
            now, now,
          ],
        );
        await dbInsert(
          `INSERT INTO cv_evaluations
            (listing_id, target_role, role_score, industry_score, location_score,
             preference_score, overall_score, industries, target_location, preferences,
             preference_scores, next_action, next_action_reason, recommendation, recommendation_reason,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            listingId,
            job.target.target_role,
            s.role_score || 0,
            s.industry_score || 0,
            s.location_score || 0,
            s.preference_score || 0,
            s.overall_score || 0,
            job.target.industries || '',
            job.target.target_location || '',
            job.target.metrics || '',
            s.preference_scores ? JSON.stringify(s.preference_scores) : null,
            s.next_action || null,
            s.next_action_detail || null,
            s.recommendation || null,
            s.recommendation_reason || null,
            now, now,
          ],
        );
        this.stats.new++;
        await this.saveStats();
      } catch (err) {
        this.stats.errors++;
        await this.saveStats();
        this.emit('error', `[Save] "${job.title}": ${err.message}`, { agent: 'save' });
      }
    }

    await this.saveStats();
    this.emit('progress',
      `[Done] ${this.stats.new} new · ${this.stats.skipped} skipped · ${this.stats.errors} errors`,
      { agent: 'done' });
  }

  async saveStats() {
    await dbRun(
      'UPDATE scan_runs SET new_count = ?, skipped_count = ?, error_count = ? WHERE id = ?',
      [this.stats.new, this.stats.skipped, this.stats.errors, this.scanRunId],
    );
  }
}
