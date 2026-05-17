import { load as cheerioLoad } from 'cheerio';
import { dbGet, dbRun, dbInsert } from '../loaders/database.mjs';
import { evaluateBatch } from './scan-evaluate-client.mjs';
import { fetchPortalJobs } from './scan-fetch-client.mjs';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isRelevant(title, targetRole) {
  const stops = new Set(['senior', 'junior', 'lead', 'staff', 'principal', 'remote',
    'full', 'time', 'part', 'and', 'or', 'the', 'of', 'for', 'with']);
  const keywords = targetRole.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stops.has(w));
  if (!keywords.length) return true;
  const t = title.toLowerCase();
  return keywords.some(k => t.includes(k));
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
  constructor({ targetIds = [], portalIds = [], scanRunId, signal, onEvent }) {
    this.targetIds = targetIds;
    this.portalIds = portalIds;
    this.scanRunId = scanRunId;
    this.signal    = signal || new AbortController().signal;
    this.onEvent   = onEvent || (() => {});
    this.stats     = { new: 0, skipped: 0, errors: 0 };
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

    const fetchablePortals = portals.filter(p => {
      const cfg = p.search_config;
      if (!cfg) return false;
      const method = cfg.method || '';
      if (['unknown', 'unsupported', 'playwright', 'ats'].includes(method)) return false;
      return !!cfg.url_template;
    });

    const skippedPortals = portals.filter(p => !fetchablePortals.includes(p));
    if (skippedPortals.length) {
      this.emit('info',
        `[Fetch] Skipping ${skippedPortals.length} portal(s) without search config: ${skippedPortals.map(p => p.name).join(', ')}`,
        { agent: 'fetch' });
    }
    if (!fetchablePortals.length) {
      this.emit('warning', 'No portals with search config available. Run portal discovery first.');
      return;
    }

    // ── STAGE 1: Fetch all portals × targets via Python agent ────────────────
    this.emit('progress',
      `[Fetch] Searching ${fetchablePortals.length} portal(s) × ${targets.length} target(s)…`,
      { agent: 'fetch' });

    const pairs = fetchablePortals.flatMap(portal => targets.map(target => ({ portal, target })));

    const fetchResults = await pMap(pairs, async ({ portal, target }) => {
      if (this.signal.aborted) return [];
      const raw = await fetchPortalJobs(portal, target.target_role);
      const newJobs = [];
      for (const job of raw) {
        if (!job.url || !job.title) continue;
        if (!isRelevant(job.title, target.target_role)) continue;
        const exists = await dbGet('SELECT 1 FROM listings WHERE source_url = $1', [job.url]);
        if (exists) { this.stats.skipped++; continue; }
        newJobs.push({ ...job, target, portalName: portal.name });
      }
      this.emit('progress',
        `[Fetch] ${portal.name} × "${target.target_role}": ${newJobs.length} new`,
        { agent: 'fetch' });
      return newJobs;
    }, 8);

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
    this.emit('progress', `[Scrape] Fetching job descriptions…`, { agent: 'scrape' });
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
            `[Scrape] (${idx}/${toScrape.length}) "${job.title}" — ${job.jd_text.length} chars`,
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
    }, 10);

    // ── STAGE 3: Evaluate with Python agent (batched per target) ─────────────
    this.emit('progress', `[Evaluate] Scoring ${pending.length} listings…`, { agent: 'evaluate' });

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
        `[Evaluate] ${group.length} jobs for "${target.target_role}"…`,
        { agent: 'evaluate' });
      try {
        const evalResults = await evaluateBatch(group, target, 3);
        const byUrl = new Map(evalResults.map(r => [r.url, r.scores]));
        for (const job of group) {
          const scores = byUrl.get(job.url);
          job.scores = scores || {
            role_score: 0, industry_score: 0, location_score: 0,
            preference_score: 0, overall_score: 0, preference_scores: {},
            recommendation: 'Research more', recommendation_reason: 'No result returned.',
            next_action: 'Reach out', next_action_detail: '',
          };
          if (scores) {
            this.emit('progress',
              `[Evaluate] "${job.title}" → score=${scores.overall_score} [${scores.recommendation}]`,
              { agent: 'evaluate' });
          }
        }
      } catch (err) {
        this.emit('error',
          `[Evaluate] batch failed for "${target.target_role}": ${err.message}`,
          { agent: 'evaluate' });
        this.stats.errors += group.length;
        for (const job of group) {
          job.scores = {
            role_score: 0, industry_score: 0, location_score: 0,
            preference_score: 0, overall_score: 0, preference_scores: {},
            recommendation: 'Research more', recommendation_reason: 'Evaluation failed.',
            next_action: 'Reach out', next_action_detail: '',
          };
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
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
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
      'UPDATE scan_runs SET new_count = $1, skipped_count = $2, error_count = $3 WHERE id = $4',
      [this.stats.new, this.stats.skipped, this.stats.errors, this.scanRunId],
    );
  }
}
