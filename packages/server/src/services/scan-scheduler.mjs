import cron from 'node-cron';
import { dbGet, dbRun, dbInsert } from '../loaders/database.mjs';
import { ScanWorkflow } from './scan-workflow.mjs';
import { refreshAllPortals } from './portal-catalog.mjs';

let activeTask = null;
let activeTimer = null;
let activeCatalogTask = null;
let activeCatalogTimer = null;

async function runScheduledScan() {
  const now = new Date().toISOString();
  let runId;
  try {
    runId = await dbInsert(
      'INSERT INTO scan_runs (status, trigger, target_ids, portal_ids, started_at) VALUES (?, ?, ?, ?, ?)',
      ['running', 'scheduled', '[]', '[]', now],
    );
    const workflow = new ScanWorkflow({
      targetIds: [],   // empty = use all active targets
      portalIds: [],   // empty = use all enabled portals
      scanRunId: runId,
    });
    await workflow.run();
    await dbRun('UPDATE scan_runs SET status = ?, finished_at = ? WHERE id = ?',
      ['done', new Date().toISOString(), runId]);
  } catch (err) {
    console.error('[scheduler] scan failed:', err.message);
    if (runId) {
      await dbRun('UPDATE scan_runs SET status = ?, finished_at = ? WHERE id = ?',
        ['failed', new Date().toISOString(), runId]).catch(() => {});
    }
  }
}

function parseIntervalMs(value) {
  const m = String(value).match(/^(\d+)(m|h|d)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit === 'm') return n * 60 * 1000;
  if (unit === 'h') return n * 60 * 60 * 1000;
  if (unit === 'd') return n * 24 * 60 * 60 * 1000;
  return null;
}

function clearSchedule() {
  if (activeTask) { activeTask.stop(); activeTask = null; }
  if (activeTimer) { clearInterval(activeTimer); activeTimer = null; }
}

export async function updateScheduler(cfg) {
  clearSchedule();
  if (!cfg?.enabled) return;

  if (cfg.mode === 'cron') {
    if (!cron.validate(cfg.value)) {
      console.warn('[scheduler] invalid cron expression:', cfg.value);
      return;
    }
    activeTask = cron.schedule(cfg.value, runScheduledScan);
    console.log('[scheduler] cron registered:', cfg.value);
  } else {
    const ms = parseIntervalMs(cfg.value);
    if (!ms) {
      console.warn('[scheduler] invalid interval value:', cfg.value);
      return;
    }
    activeTimer = setInterval(runScheduledScan, ms);
    console.log('[scheduler] interval registered:', cfg.value, `(${ms}ms)`);
  }
}

export async function initScheduler() {
  try {
    const row = await dbGet("SELECT value FROM settings WHERE key = 'scan_schedule'");
    if (!row) return;
    const cfg = JSON.parse(row.value);
    await updateScheduler(cfg);
  } catch (err) {
    console.error('[scheduler] init failed:', err.message);
  }
}

// ── Catalog refresh scheduler ─────────────────────────────────────────────────

async function runCatalogRefresh() {
  const now = new Date().toISOString();
  let runId;
  try {
    const { rows } = await dbRun(
      `INSERT INTO catalog_refresh_runs (status, trigger, started_at) VALUES ('running', 'scheduled', $1) RETURNING id`,
      [now]
    );
    runId = rows[0].id;
  } catch (err) {
    console.error('[catalog-scheduler] failed to create run record:', err.message);
  }

  console.log(`[catalog-scheduler] starting portal catalog refresh${runId ? ` #${runId}` : ''}…`);
  const lines = [];
  try {
    await refreshAllPortals((ev) => {
      if (ev.type === 'progress') {
        const icon = ev.status === 'ok' ? '✓' : '✗';
        const msg = `${icon} [${ev.provider || ev.id}] ${ev.status}`;
        lines.push(msg);
        console.log(`[catalog-scheduler] ${msg}`);
      } else if (ev.type === 'done') {
        const msg = `Done — ${ev.ok} ok, ${ev.failing} failing`;
        lines.push(msg);
        console.log(`[catalog-scheduler] ${msg}`);
      }
    });
    if (runId) {
      const lastDone = lines.find(l => l.startsWith('Done'));
      const ok = lastDone ? parseInt(lastDone.match(/(\d+) ok/)?.[1] || 0) : 0;
      const failing = lastDone ? parseInt(lastDone.match(/(\d+) failing/)?.[1] || 0) : 0;
      await dbRun(
        `UPDATE catalog_refresh_runs SET status='done', ok_count=$1, failing_count=$2, total_count=$3, log=$4, finished_at=$5 WHERE id=$6`,
        [ok, failing, ok + failing, lines.join('\n'), new Date().toISOString(), runId]
      ).catch(() => {});
    }
  } catch (err) {
    console.error('[catalog-scheduler] refresh failed:', err.message);
    if (runId) {
      await dbRun(
        `UPDATE catalog_refresh_runs SET status='failed', log=$1, finished_at=$2 WHERE id=$3`,
        [lines.concat(`Fatal: ${err.message}`).join('\n'), new Date().toISOString(), runId]
      ).catch(() => {});
    }
  }
}

function clearCatalogSchedule() {
  if (activeCatalogTask) { activeCatalogTask.stop(); activeCatalogTask = null; }
  if (activeCatalogTimer) { clearInterval(activeCatalogTimer); activeCatalogTimer = null; }
}

export async function updateCatalogScheduler(cfg) {
  clearCatalogSchedule();
  if (!cfg?.enabled) return;

  if (cfg.mode === 'cron') {
    if (!cron.validate(cfg.value)) {
      console.warn('[catalog-scheduler] invalid cron expression:', cfg.value);
      return;
    }
    activeCatalogTask = cron.schedule(cfg.value, runCatalogRefresh);
    console.log('[catalog-scheduler] cron registered:', cfg.value);
  } else {
    const ms = parseIntervalMs(cfg.value);
    if (!ms) {
      console.warn('[catalog-scheduler] invalid interval value:', cfg.value);
      return;
    }
    activeCatalogTimer = setInterval(runCatalogRefresh, ms);
    console.log('[catalog-scheduler] interval registered:', cfg.value, `(${ms}ms)`);
  }
}

export async function initCatalogScheduler() {
  try {
    const row = await dbGet("SELECT value FROM settings WHERE key = 'portal_catalog_schedule'");
    if (!row) return;
    const cfg = JSON.parse(row.value);
    await updateCatalogScheduler(cfg);
  } catch (err) {
    console.error('[catalog-scheduler] init failed:', err.message);
  }
}
