import express from 'express';
import { listSessions, deleteSession } from '../../models/session.mjs';

const router = express.Router();

router.get('/', async (req, res) => {
  res.json(await listSessions());
});

router.delete('/:portal', async (req, res) => {
  await deleteSession(req.params.portal);
  res.json({ deleted: true, portal: req.params.portal });
});

export default router;
