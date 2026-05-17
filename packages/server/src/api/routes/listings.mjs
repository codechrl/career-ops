import express from 'express';
import { dbAll, dbGet, dbRun, dbInsert } from '../../loaders/database.mjs';
import { requireAuth } from '../middleware/auth.mjs';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await dbRun('SELECT * FROM listings ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { company, role, score = '0', status = 'Evaluada', pdf = '', report = '', apply_method = 'portal' } = req.body;
  if (!company || !role) return res.status(400).json({ error: 'company and role are required' });
  try {
    const now = new Date().toISOString();
    const id = await dbInsert(
      'INSERT INTO listings (company, role, score, status, pdf, report, apply_method, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [company, role, score, status, pdf, report, apply_method, now, now],
    );
    res.json({ added: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  const allowed = ['company', 'role', 'score', 'status', 'pdf', 'report', 'apply_method'];
  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });
  try {
    const now = new Date().toISOString();
    const sets = updates.map(([k], i) => `${k} = $${i + 1}`).join(', ');
    const vals = [...updates.map(([, v]) => v), now, req.params.id];
    await dbRun(
      `UPDATE listings SET ${sets}, updated_at = $${updates.length + 1} WHERE id = $${updates.length + 2}`,
      vals,
    );
    res.json({ updated: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/all', requireAuth, async (req, res) => {
  try {
    await dbRun('DELETE FROM cv_evaluations');
    await dbRun('DELETE FROM listings');
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await dbRun('DELETE FROM cv_evaluations WHERE listing_id = $1', [req.params.id]);
    await dbRun('DELETE FROM listings WHERE id = $1', [req.params.id]);
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;


