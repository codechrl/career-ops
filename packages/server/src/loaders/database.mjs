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
    ];
    const now = new Date().toISOString();
    for (const p of seedPortals) {
      await pool.query(
        'INSERT INTO portals (name, provider, careers_url, auth_type, enabled, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [p.name, p.provider, p.careers_url, p.auth_type, p.enabled, now, now]
      );
    }
  }

  return pool;
}

