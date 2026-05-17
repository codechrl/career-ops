import express from 'express';
import { listPortals, addPortal, updatePortal, deletePortal } from '../../models/portal.mjs';
import { requireAuth } from '../middleware/auth.mjs';

const router = express.Router();

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

export default router;
