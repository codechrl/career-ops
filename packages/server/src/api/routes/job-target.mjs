import express from 'express';
import { dbAll, dbGet, dbRun, dbInsert } from '../../loaders/database.mjs';
import { requireAuth } from '../middleware/auth.mjs';

const router = express.Router();

// GET / — list all job targets
router.get('/', requireAuth, async (req, res) => {
  const rows = await dbAll('SELECT * FROM job_targets ORDER BY is_active DESC, updated_at DESC', []);
  res.json(rows.map(r => ({
    ...r,
    metrics: r.metrics ? JSON.parse(r.metrics) : [],
  })));
});

// GET /active — get all active targets (used by scan/rank features)
router.get('/active', requireAuth, async (req, res) => {
  const rows = await dbAll('SELECT * FROM job_targets WHERE is_active = 1 ORDER BY updated_at DESC', []);
  res.json(rows.map(r => ({ ...r, metrics: r.metrics ? JSON.parse(r.metrics) : [] })));
});

// POST / — create new target
router.post('/', requireAuth, async (req, res) => {
  const { targetRole, industries, targetLocation, metrics, setActive } = req.body;
  if (!targetRole) return res.status(400).json({ error: 'targetRole is required' });
  const now = new Date().toISOString();
  const isActive = setActive ? 1 : 0;
  const id = await dbInsert(
    'INSERT INTO job_targets (target_role, industries, target_location, metrics, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [targetRole, industries || '', targetLocation || '', JSON.stringify(metrics || []), isActive, now, now]
  );
  res.json({ id, saved: true });
});

// PUT /:id — update target
router.put('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { targetRole, industries, targetLocation, metrics, setActive } = req.body;
  if (!targetRole) return res.status(400).json({ error: 'targetRole is required' });
  const now = new Date().toISOString();
  const isActive = setActive ? 1 : 0;
  await dbRun(
    'UPDATE job_targets SET target_role = ?, industries = ?, target_location = ?, metrics = ?, is_active = ?, updated_at = ? WHERE id = ?',
    [targetRole, industries || '', targetLocation || '', JSON.stringify(metrics || []), isActive, now, id]
  );
  res.json({ saved: true });
});

// PATCH /:id/activate — toggle active state
router.patch('/:id/activate', requireAuth, async (req, res) => {
  const { id } = req.params;
  const now = new Date().toISOString();
  const row = await dbGet('SELECT is_active FROM job_targets WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const newState = row.is_active ? 0 : 1;
  await dbRun('UPDATE job_targets SET is_active = ?, updated_at = ? WHERE id = ?', [newState, now, id]);
  res.json({ saved: true, is_active: newState });
});

// DELETE /:id — delete target
router.delete('/:id', requireAuth, async (req, res) => {
  await dbRun('DELETE FROM job_targets WHERE id = ?', [req.params.id]);
  res.json({ deleted: true });
});

export default router;

