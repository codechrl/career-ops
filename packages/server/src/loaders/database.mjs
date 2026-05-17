import pg from 'pg';
import fs from 'fs';

const { Pool } = pg;
let pool;

function toPos(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function dbAll(sql, params = []) {
  const res = await pool.query(toPos(sql), params);
  return res.rows;
}

export async function dbGet(sql, params = []) {
  const res = await pool.query(toPos(sql), params);
  return res.rows[0] || null;
}

export async function dbRun(sql, params = []) {
  return pool.query(toPos(sql), params);
}

export async function dbInsert(sql, params = []) {
  const res = await pool.query(toPos(sql) + ' RETURNING id', params);
  return res.rows[0]?.id;
}

export function getPool() {
  return pool;
}

export async function initDatabase() {
  fs.mkdirSync('data', { recursive: true });
  pool = new Pool({ connectionString: process.env.DATABASE_URL });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS llm_keys (
      provider TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      portal TEXT NOT NULL,
      storage_state TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS portals (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      provider TEXT,
      careers_url TEXT,
      config_json TEXT,
      auth_type TEXT DEFAULT 'none',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pipeline_items (
      id SERIAL PRIMARY KEY,
      url TEXT NOT NULL,
      company TEXT,
      title TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS listings (
      id SERIAL PRIMARY KEY,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      score TEXT,
      status TEXT NOT NULL DEFAULT 'Evaluada',
      pdf TEXT,
      report TEXT,
      apply_method TEXT DEFAULT 'portal',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cv_evaluations (
      id SERIAL PRIMARY KEY,
      listing_id INTEGER NOT NULL,
      target_role TEXT NOT NULL,
      role_score INTEGER DEFAULT 0,
      industry_score INTEGER DEFAULT 0,
      location_score INTEGER DEFAULT 0,
      preference_score INTEGER DEFAULT 0,
      overall_score INTEGER DEFAULT 0,
      industries TEXT,
      target_location TEXT,
      preferences TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_targets (
      id SERIAL PRIMARY KEY,
      target_role TEXT NOT NULL,
      industries TEXT,
      target_location TEXT,
      metrics TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scan_runs (
      id SERIAL PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'queued',
      trigger TEXT NOT NULL DEFAULT 'manual',
      target_ids TEXT NOT NULL DEFAULT '[]',
      portal_ids TEXT NOT NULL DEFAULT '[]',
      new_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      log TEXT NOT NULL DEFAULT '',
      started_at TEXT NOT NULL,
      finished_at TEXT
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_refresh_runs (
      id SERIAL PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'running',
      trigger TEXT NOT NULL DEFAULT 'manual',
      total_count INTEGER NOT NULL DEFAULT 0,
      ok_count INTEGER NOT NULL DEFAULT 0,
      failing_count INTEGER NOT NULL DEFAULT 0,
      log TEXT NOT NULL DEFAULT '',
      started_at TEXT NOT NULL,
      finished_at TEXT
    )`);
  // Migrations: add columns if they don't exist yet
  await pool.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS source_url TEXT`);
  await pool.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS source_portal TEXT`);
  await pool.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS scan_run_id INTEGER`);
  await pool.query(`ALTER TABLE cv_evaluations ADD COLUMN IF NOT EXISTS preference_scores TEXT`);
  await pool.query(`ALTER TABLE cv_evaluations ADD COLUMN IF NOT EXISTS next_action TEXT`);
  await pool.query(`ALTER TABLE cv_evaluations ADD COLUMN IF NOT EXISTS next_action_reason TEXT`);
  await pool.query(`ALTER TABLE cv_evaluations ADD COLUMN IF NOT EXISTS recommendation TEXT`);
  await pool.query(`ALTER TABLE cv_evaluations ADD COLUMN IF NOT EXISTS recommendation_reason TEXT`);

  // Portal catalog columns
  await pool.query(`ALTER TABLE portals ADD COLUMN IF NOT EXISTS search_config JSONB`);
  await pool.query(`ALTER TABLE portals ADD COLUMN IF NOT EXISTS catalog_status TEXT DEFAULT 'unknown'`);
  await pool.query(`ALTER TABLE portals ADD COLUMN IF NOT EXISTS last_catalog_refresh TEXT`);

  // Seed portals if empty
  const { rows } = await pool.query('SELECT COUNT(*) as n FROM portals');
  if (parseInt(rows[0].n, 10) === 0) {
    const seedPortals = [
      { name: 'Greenhouse', provider: 'greenhouse', careers_url: 'https://job-boards.greenhouse.io', auth_type: 'none', enabled: 1 },
      { name: 'Ashby', provider: 'ashby', careers_url: 'https://jobs.ashbyhq.com', auth_type: 'none', enabled: 1 },
      { name: 'Lever', provider: 'lever', careers_url: 'https://jobs.lever.co', auth_type: 'none', enabled: 1 },
      { name: 'Workable', provider: 'workable', careers_url: 'https://apply.workable.com', auth_type: 'none', enabled: 1 },
      { name: 'LinkedIn', provider: 'linkedin', careers_url: 'https://linkedin.com/jobs', auth_type: 'session', enabled: 1 },
      { name: 'RemoteOK', provider: 'remoteok', careers_url: 'https://remoteok.com', auth_type: 'none', enabled: 1 },
      { name: 'WeWorkRemotely', provider: 'weworkremotely', careers_url: 'https://weworkremotely.com', auth_type: 'none', enabled: 1 },
      { name: 'Remotive', provider: 'remotive', careers_url: 'https://remotive.com', auth_type: 'none', enabled: 1 },
      { name: 'Working Nomads', provider: 'workingnomads', careers_url: 'https://workingnomads.com/jobs', auth_type: 'none', enabled: 1 },
      { name: 'Himalayas', provider: 'himalayas', careers_url: 'https://himalayas.app/jobs', auth_type: 'none', enabled: 1 },
      { name: 'ai-jobs.net', provider: 'ai-jobs', careers_url: 'https://ai-jobs.net', auth_type: 'none', enabled: 1 },
      { name: 'YC Jobs', provider: 'ycjobs', careers_url: 'https://ycombinator.com/jobs', auth_type: 'none', enabled: 1 },
      { name: 'TrueUp', provider: 'trueup', careers_url: 'https://trueup.io/jobs', auth_type: 'none', enabled: 1 },
      { name: 'Remote Rocketship', provider: 'remoterocketship', careers_url: 'https://remoterocketship.com', auth_type: 'none', enabled: 1 },
      { name: 'fwddeploy.com', provider: 'fwddeploy', careers_url: 'https://fwddeploy.com', auth_type: 'none', enabled: 1 },
      { name: "HN Who's Hiring", provider: 'hn-hiring', careers_url: 'https://news.ycombinator.com', auth_type: 'none', enabled: 1 },
      { name: 'DevRelX Jobs', provider: 'devrelx', careers_url: 'https://devrelx.com/jobs', auth_type: 'none', enabled: 1 },
      { name: 'DevRel Job Board', provider: 'devrel-jobs', careers_url: 'https://devrel.jobs', auth_type: 'none', enabled: 1 },
      { name: 'EU Remote Jobs', provider: 'eu-remote-jobs', careers_url: 'https://euremotejobs.com', auth_type: 'none', enabled: 1 },
      { name: 'EU Data Jobs', provider: 'eu-data-jobs', careers_url: 'https://eudatajobs.com', auth_type: 'none', enabled: 1 },
      { name: 'Jooble', provider: 'jooble', careers_url: 'https://jooble.org', auth_type: 'none', enabled: 1 },
      { name: 'Manfred', provider: 'manfred', careers_url: 'https://getmanfred.com/ofertas-empleo', auth_type: 'none', enabled: 1 },
      { name: 'Tecnoempleo', provider: 'tecnoempleo', careers_url: 'https://tecnoempleo.com', auth_type: 'none', enabled: 1 },
      { name: 'JobFluent', provider: 'jobfluent', careers_url: 'https://jobfluent.com', auth_type: 'none', enabled: 1 },
      { name: 'Welcome to the Jungle', provider: 'wttj', careers_url: 'https://welcometothejungle.com', auth_type: 'none', enabled: 1 },
      { name: 'Kariyer.net', provider: 'kariyer', careers_url: 'https://kariyer.net', auth_type: 'none', enabled: 0 },
      { name: 'Yenibiris.com', provider: 'yenibiris', careers_url: 'https://yenibiris.com', auth_type: 'none', enabled: 0 },
      { name: 'Secretcv.com', provider: 'secretcv', careers_url: 'https://secretcv.com', auth_type: 'none', enabled: 0 },
      { name: 'İşin Olsun', provider: 'isinolsun', careers_url: 'https://isinolsun.com', auth_type: 'none', enabled: 0 },
      { name: 'RemoteYeah', provider: 'remoteyeah', careers_url: 'https://remoteyeah.com', auth_type: 'none', enabled: 1 },
    ];
    const now = new Date().toISOString();
    for (const p of seedPortals) {
      await pool.query(
        'INSERT INTO portals (name, provider, careers_url, auth_type, enabled, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [p.name, p.provider, p.careers_url, p.auth_type, p.enabled, now, now]
      );
    }
  }

  // Migration: add remoteyeah for existing installs that don't have it yet
  await pool.query(`
    INSERT INTO portals (name, provider, careers_url, auth_type, enabled, created_at, updated_at)
    SELECT 'RemoteYeah', 'remoteyeah', 'https://remoteyeah.com', 'none', 1, $1, $1
    WHERE NOT EXISTS (SELECT 1 FROM portals WHERE provider = 'remoteyeah')
  `, [new Date().toISOString()]);

  // Migration: populate search_config for known portals where it is not yet set
  const knownCatalog = [
    { provider: 'remotive', search_config: { method: 'json_api', url_template: 'https://remotive.com/api/remote-jobs?search={query}&limit=50', notes: 'JSON API. search param is URL-encoded role. Returns array at .jobs[].' } },
    { provider: 'remoteok', search_config: { method: 'json_api', url_template: 'https://remoteok.com/api?tags={tag}', notes: 'JSON API. tag = first word of role lowercased. Returns array; skip first element (meta).' } },
    { provider: 'weworkremotely', search_config: { method: 'rss_feed', url_template: 'https://weworkremotely.com/remote-jobs.rss?term={query}', notes: 'RSS feed with term search. Parse <item> with CDATA title/company/description.' } },
    { provider: 'himalayas', search_config: { method: 'json_api', url_template: 'https://himalayas.app/jobs/api?q={query}&limit=30', notes: 'JSON API. Returns .jobs[]. Each job has title, company.name, applicationUrl, description.' } },
    { provider: 'workingnomads', search_config: { method: 'json_api', url_template: 'https://www.workingnomads.com/api/exposed_jobs/?category={category}', notes: 'JSON API. category = first word of role lowercased. Returns array with title, company_name, url, description.' } },
    { provider: 'ai-jobs', search_config: { method: 'json_api', url_template: 'https://ai-jobs.net/jobs/api/?title={query}&format=json', notes: 'JSON API with Playwright fallback for HTML. Returns .jobs[].' } },
    { provider: 'ycjobs', search_config: { method: 'html_scrape', url_template: 'https://www.ycombinator.com/jobs?q={query}', notes: 'HTML scrape with cheerio. Job cards at .JobCard_jobCard__.' } },
    { provider: 'trueup', search_config: { method: 'html_scrape', url_template: 'https://trueup.io/jobs?q={query}&jobType=Full-Time', notes: 'HTML scrape with cheerio. Playwright may be needed for JS-rendered content.' } },
    { provider: 'remoterocketship', search_config: { method: 'html_scrape', url_template: 'https://remoterocketship.com/jobs?search={query}', notes: 'HTML scrape with cheerio.' } },
    { provider: 'remoteyeah', search_config: { method: 'rss_feed', url_template: 'https://remoteyeah.com/remote-{slug}-jobs.xml', notes: 'Category RSS feeds. slug derived from target_role via getRoleSlugRemoteYeah(). Default slug: software-engineer.' } },
    { provider: 'greenhouse', search_config: { method: 'ats', url_template: 'https://job-boards.greenhouse.io/{company}', notes: 'ATS provider. Scrapes specific company boards. Configured per portal entry with careers_url.' } },
    { provider: 'ashby', search_config: { method: 'ats', url_template: 'https://jobs.ashbyhq.com/{company}', notes: 'ATS provider. Scrapes specific company boards.' } },
    { provider: 'lever', search_config: { method: 'ats', url_template: 'https://jobs.lever.co/{company}', notes: 'ATS provider. Scrapes specific company boards.' } },
    { provider: 'workable', search_config: { method: 'ats', url_template: 'https://apply.workable.com/{company}', notes: 'ATS provider. Scrapes specific company boards.' } },
    { provider: 'linkedin', search_config: { method: 'playwright', url_template: 'https://www.linkedin.com/jobs/search/?keywords={query}', notes: 'Playwright session-based. Requires saved LinkedIn session cookies.' } },
  ];
  // Seed default schedules if not already configured
  const schedNow = new Date().toISOString();
  await pool.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ('scan_schedule', $1, $2) ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify({ enabled: true, mode: 'cron', value: '0 1 * * *' }), schedNow]
  );
  await pool.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ('portal_catalog_schedule', $1, $2) ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify({ enabled: true, mode: 'cron', value: '0 23 * * *' }), schedNow]
  );

  return pool;
}

