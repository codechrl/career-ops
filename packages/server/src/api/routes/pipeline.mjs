import express from 'express';
import { dbRun, dbInsert } from '../../loaders/database.mjs';
import { requireAuth } from '../middleware/auth.mjs';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows: pending }   = await dbRun("SELECT * FROM pipeline_items WHERE status = 'pending'   ORDER BY created_at DESC");
    const { rows: processed } = await dbRun("SELECT * FROM pipeline_items WHERE status = 'processed' ORDER BY created_at DESC");
    res.json({ pending, processed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { url, company = '', title = '' } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  try {
    const now = new Date().toISOString();
    const id = await dbInsert(
      'INSERT INTO pipeline_items (url, company, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [url, company, title, 'pending', now, now],
    );
    res.json({ added: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  const { status, company, title } = req.body;
  const allowed = { status, company, title };
  const updates = Object.entries(allowed).filter(([, v]) => v !== undefined);
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  try {
    const now = new Date().toISOString();
    const sets = updates.map(([k], i) => `${k} = $${i + 1}`).join(', ');
    await dbRun(
      `UPDATE pipeline_items SET ${sets}, updated_at = $${updates.length + 1} WHERE id = $${updates.length + 2}`,
      [...updates.map(([, v]) => v), now, req.params.id],
    );
    res.json({ updated: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await dbRun('DELETE FROM pipeline_items WHERE id = ?', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;


