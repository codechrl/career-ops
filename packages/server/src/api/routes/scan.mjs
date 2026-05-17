import express from 'express';
import { dbRun, dbInsert } from '../../loaders/database.mjs';
import { ScanWorkflow } from '../../services/scan-workflow.mjs';
import { requireAuth } from '../middleware/auth.mjs';

const router = express.Router();

// In-memory registry: runId → { events[], listeners: Set<fn>, abortCtrl, done }
const activeScans = new Map();

// POST /api/scan — start scan in background, return { runId } immediately
router.post('/', requireAuth, async (req, res) => {
  const { targetIds = [], portalIds = [], useBrowser = false } = req.body;

  let runId;
  try {
    runId = await dbInsert(
      'INSERT INTO scan_runs (status, trigger, target_ids, portal_ids, started_at) VALUES (?, ?, ?, ?, ?)',
      ['running', 'manual', JSON.stringify(targetIds), JSON.stringify(portalIds), new Date().toISOString()],
    );
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create scan run: ' + err.message });
  }

  const abortCtrl = new AbortController();
  const ctx = { events: [], listeners: new Set(), abortCtrl, done: false };
  activeScans.set(runId, ctx);

  const emit = (obj) => {
    console.log(`[scan #${runId}] ${obj.type} — ${obj.message || ''}`);
    ctx.events.push(obj);
    ctx.listeners.forEach(fn => { try { fn(obj); } catch {} });
  };

  // Fire-and-forget background execution
  (async () => {
    emit({ type: 'start', runId, agent: 'scan', message: `Scan #${runId} started` });
    try {
      const workflow = new ScanWorkflow({
        targetIds, portalIds, scanRunId: runId,
        signal: abortCtrl.signal,
        useBrowser,
        onEvent: emit,
      });
      await workflow.run();
      await dbRun('UPDATE scan_runs SET status = ?, finished_at = ? WHERE id = ?',
        ['done', new Date().toISOString(), runId]);
      emit({ type: 'done', runId, agent: 'scan', message: 'Scan completed' });
    } catch (err) {
      const status = err.name === 'AbortError' ? 'cancelled' : 'failed';
      await dbRun('UPDATE scan_runs SET status = ?, finished_at = ? WHERE id = ?',
        [status, new Date().toISOString(), runId]).catch(() => {});
      emit({ type: err.name === 'AbortError' ? 'cancelled' : 'error', agent: 'scan', message: err.message });
    } finally {
      ctx.done = true;
      setTimeout(() => activeScans.delete(runId), 30_000); // keep 30s for late subscribers
    }
  })();

  res.json({ runId });
});

// GET /api/scan/runs/:id/stream — SSE stream for a specific background run
router.get('/runs/:id/stream', requireAuth, (req, res) => {
  const runId = +req.params.id;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const write = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  const ctx = activeScans.get(runId);

  if (!ctx) {
    write({ type: 'info', agent: 'scan', message: 'Scan not active — check Scan Runs for results.' });
    res.write('event: end\ndata: {}\n\n');
    return res.end();
  }

  // Replay buffered events then stream live
  ctx.events.forEach(write);
  if (ctx.done) {
    res.write('event: end\ndata: {}\n\n');
    return res.end();
  }

  ctx.listeners.add(write);
  const cleanup = () => ctx.listeners.delete(write);
  req.on('close', cleanup);

  // Auto-close SSE when scan finishes
  const poll = setInterval(() => {
    if (ctx.done) {
      res.write('event: end\ndata: {}\n\n');
      res.end();
      clearInterval(poll);
      cleanup();
    }
  }, 1000);
});

// GET /api/scan/runs
router.get('/runs', requireAuth, async (req, res) => {
  try {
    const { rows } = await dbRun('SELECT * FROM scan_runs ORDER BY id DESC LIMIT 100');
    // Annotate with active status from memory
    const result = rows.map(r => ({
      ...r,
      is_active: activeScans.has(r.id) && !activeScans.get(r.id).done,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/scan/runs/:id — abort running scan
router.delete('/runs/:id', requireAuth, async (req, res) => {
  const runId = +req.params.id;
  const ctx = activeScans.get(runId);
  if (ctx && !ctx.done) ctx.abortCtrl.abort();

  try {
    await dbRun(
      "UPDATE scan_runs SET status = 'cancelled', finished_at = ? WHERE id = ? AND status = 'running'",
      [new Date().toISOString(), runId],
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
