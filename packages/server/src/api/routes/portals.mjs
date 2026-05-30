import express from 'express';
import {
  listPortals, addPortal, updatePortal, deletePortal, getPortal,
  getPortalCredentials, setPortalCredentials, clearPortalCredentials,
  getPortalSession, clearPortalSession,
} from '../../models/portal.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { dbRun, dbGet, dbAll } from '../../loaders/database.mjs';
import { verifyPortal, refreshAllPortals, discoverPortalConfig } from '../../services/portal-catalog.mjs';
import { updateCatalogScheduler } from '../../services/scan-scheduler.mjs';

const router = express.Router();

// Track running catalog refreshes so they can be cancelled
const activeRefreshes = new Map(); // runId → AbortController

router.get('/', requireAuth, async (req, res) => {
  res.json(await listPortals());
});

router.post('/', requireAuth, async (req, res) => {
  const { name, provider, careers_url, auth_type, enabled } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const portal = await addPortal({ name, provider, careers_url, auth_type, enabled });
  res.json(portal);
});

router.put('/:id', requireAuth, async (req, res) => {
  const { name, provider, careers_url, auth_type, enabled } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const portal = await updatePortal(req.params.id, { name, provider, careers_url, auth_type, enabled });
  if (!portal) return res.status(404).json({ error: 'not found' });
  res.json(portal);
});

router.delete('/:id', requireAuth, async (req, res) => {
  await deletePortal(req.params.id);
  res.json({ deleted: true });
});

// ── Catalog endpoints ─────────────────────────────────────────────────────────

// GET /api/portals/:id/catalog — get search_config for a portal
router.get('/:id/catalog', requireAuth, async (req, res) => {
  const portal = await getPortal(req.params.id);
  if (!portal) return res.status(404).json({ error: 'not found' });
  res.json({
    id: portal.id,
    provider: portal.provider,
    search_config: portal.search_config || null,
    catalog_status: portal.catalog_status || 'unknown',
    last_catalog_refresh: portal.last_catalog_refresh || null,
  });
});

// PUT /api/portals/:id/catalog — manually set search_config
router.put('/:id/catalog', requireAuth, async (req, res) => {
  const portal = await getPortal(req.params.id);
  if (!portal) return res.status(404).json({ error: 'not found' });
  const cfg = req.body.search_config;
  if (!cfg || typeof cfg !== 'object') return res.status(400).json({ error: 'search_config object required' });
  const now = new Date().toISOString();
  await dbRun(
    'UPDATE portals SET search_config = ?, catalog_status = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(cfg), 'pending', now, req.params.id]
  );
  res.json({ ok: true, search_config: cfg });
});

// POST /api/portals/:id/verify — test portal reachability, update catalog_status
router.post('/:id/verify', requireAuth, async (req, res) => {
  try {
    const result = await verifyPortal(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/portals/:id/discover — LLM auto-detect search config
router.post('/:id/discover', requireAuth, async (req, res) => {
  try {
    const result = await discoverPortalConfig(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/portals/catalog/refresh — start background verify-all, persists run record
router.post('/catalog/refresh', requireAuth, async (req, res) => {
  const trigger = req.body?.trigger || 'manual';
  const now = new Date().toISOString();
  let runId;
  try {
    const { rows } = await dbRun(
      `INSERT INTO catalog_refresh_runs (status, trigger, started_at) VALUES ('running', $1, $2) RETURNING id`,
      [trigger, now]
    );
    runId = rows[0].id;
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  res.json({ ok: true, runId, message: 'Catalog refresh started — check server logs or pipeline page.' });

  const ac = new AbortController();
  activeRefreshes.set(runId, ac);

  (async () => {
    const lines = [];
    let okSoFar = 0, failSoFar = 0;
    console.log(`[catalog-refresh #${runId}] Starting…`);
    try {
      await refreshAllPortals((ev) => {
        if (ac.signal.aborted) return;
        if (ev.type === 'log') {
          console.log(`[catalog-refresh #${runId}]   ${ev.message}`);
        } else if (ev.type === 'progress') {
          const msg = `[${ev.provider}] ${ev.status}${ev.message ? ' — ' + ev.message : ''}`;
          lines.push(msg);
          console.log(`[catalog-refresh #${runId}] ${msg}`);
          // Count and flush to DB after each portal finishes (not 'discovering' in-progress)
          if (ev.status !== 'discovering') {
            if (ev.status?.startsWith('error') || ev.status === 'error') failSoFar++;
            else okSoFar++;
            dbRun(
              `UPDATE catalog_refresh_runs SET ok_count=$1, failing_count=$2, total_count=$3, log=$4 WHERE id=$5`,
              [okSoFar, failSoFar, okSoFar + failSoFar, lines.join('\n'), runId]
            ).catch(() => {});
          }
        } else if (ev.type === 'done') {
          const msg = `Done — ${ev.ok} ok, ${ev.failing} failing${ev.cancelled ? ' (cancelled)' : ''}`;
          lines.push(msg);
          console.log(`[catalog-refresh #${runId}] ${msg}`);
        } else if (ev.type === 'error') {
          lines.push(`Error: ${ev.message}`);
          console.error(`[catalog-refresh #${runId}] Error: ${ev.message}`);
        }
      }, ac.signal);
      const cancelled = ac.signal.aborted;
      activeRefreshes.delete(runId);
      await dbRun(
        `UPDATE catalog_refresh_runs SET status=$1, ok_count=$2, failing_count=$3, total_count=$4, log=$5, finished_at=$6 WHERE id=$7`,
        [cancelled ? 'cancelled' : 'done', okSoFar, failSoFar, okSoFar + failSoFar, lines.join('\n'), new Date().toISOString(), runId]
      );
    } catch (err) {
      activeRefreshes.delete(runId);
      console.error(`[catalog-refresh #${runId}] Fatal:`, err.message);
      await dbRun(
        `UPDATE catalog_refresh_runs SET status='failed', log=$1, finished_at=$2 WHERE id=$3`,
        [lines.concat(`Fatal: ${err.message}`).join('\n'), new Date().toISOString(), runId]
      ).catch(() => {});
    }
  })();
});

// POST /api/portals/catalog/runs/:id/cancel — abort a running catalog refresh
router.post('/catalog/runs/:id/cancel', requireAuth, async (req, res) => {
  const runId = parseInt(req.params.id);
  const ac = activeRefreshes.get(runId);
  if (ac) ac.abort();
  // Always mark as cancelled in DB regardless of in-memory state
  await dbRun(
    `UPDATE catalog_refresh_runs SET status='cancelled', finished_at=$1 WHERE id=$2 AND status='running'`,
    [new Date().toISOString(), runId]
  ).catch(() => {});
  console.log(`[catalog-refresh #${runId}] Cancelled by user`);
  res.json({ ok: true });
});

// GET /api/portals/catalog/runs — list recent catalog refresh runs
router.get('/catalog/runs', requireAuth, async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM catalog_refresh_runs ORDER BY id DESC LIMIT 50');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portals/catalog/schedule — get catalog refresh schedule
router.get('/catalog/schedule', requireAuth, async (req, res) => {
  const row = await dbGet("SELECT value FROM settings WHERE key = 'portal_catalog_schedule'");
  res.json(row ? JSON.parse(row.value) : { enabled: false, mode: 'cron', value: '0 3 * * 0' });
});

// PUT /api/portals/catalog/schedule — update catalog refresh schedule
router.put('/catalog/schedule', requireAuth, async (req, res) => {
  const cfg = req.body;
  if (!cfg || typeof cfg !== 'object') return res.status(400).json({ error: 'body required' });
  const now = new Date().toISOString();
  await dbRun(
    `INSERT INTO settings (key, value, updated_at) VALUES ('portal_catalog_schedule', ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [JSON.stringify(cfg), now]
  );
  await updateCatalogScheduler(cfg);
  res.json({ ok: true });
});

// ── Playwright credentials ─────────────────────────────────────────────────────

// GET /api/portals/:id/credentials — return credentials with password masked
router.get('/:id/credentials', requireAuth, async (req, res) => {
  const creds = await getPortalCredentials(req.params.id);
  if (!creds) return res.json({ username: '', has_password: false, has_totp: false, login_url: '' });
  res.json({
    username:     creds.username  || '',
    has_password: !!creds.password,
    has_totp:     !!creds.totp_secret,
    login_url:    creds.login_url || '',
  });
});

// PUT /api/portals/:id/credentials — save/update credentials
router.put('/:id/credentials', requireAuth, async (req, res) => {
  const portal = await getPortal(req.params.id);
  if (!portal) return res.status(404).json({ error: 'not found' });
  const { username, password, totp_secret, login_url } = req.body;
  const existing = await getPortalCredentials(req.params.id) || {};
  const merged = {
    username:    username    ?? existing.username    ?? '',
    password:    password    ?? existing.password    ?? '',
    totp_secret: totp_secret ?? existing.totp_secret ?? '',
    login_url:   login_url   ?? existing.login_url   ?? '',
  };
  // Remove empty strings to keep JSON clean
  Object.keys(merged).forEach(k => { if (merged[k] === '') delete merged[k]; });
  await setPortalCredentials(req.params.id, merged);
  res.json({ ok: true, username: merged.username || '', has_password: !!merged.password, has_totp: !!merged.totp_secret });
});

// DELETE /api/portals/:id/credentials — wipe stored credentials
router.delete('/:id/credentials', requireAuth, async (req, res) => {
  await clearPortalCredentials(req.params.id);
  res.json({ ok: true });
});

// DELETE /api/portals/:id/session — clear saved Playwright session
router.delete('/:id/session', requireAuth, async (req, res) => {
  await clearPortalSession(req.params.id);
  res.json({ ok: true });
});

export default router;
