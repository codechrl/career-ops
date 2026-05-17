import express from 'express';
import { dbGet, dbRun } from '../../loaders/database.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { updateScheduler } from '../../services/scan-scheduler.mjs';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const row = await dbGet("SELECT value FROM settings WHERE key = 'scan_schedule'");
    const cfg = row ? JSON.parse(row.value) : { enabled: false, mode: 'interval', value: '60m' };
    res.json(cfg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/', requireAuth, async (req, res) => {
  const { enabled, mode, value } = req.body;
  const cfg = { enabled: !!enabled, mode: mode || 'interval', value: value || '60m' };
  try {
    const now = new Date().toISOString();
    await dbRun(
      `INSERT INTO settings (key, value, updated_at) VALUES ('scan_schedule', $1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
      [JSON.stringify(cfg), now]);
    await updateScheduler(cfg);
    res.json({ ok: true, config: cfg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
