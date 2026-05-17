import express from 'express';
import { listSessions, deleteSession } from '../../models/session.mjs';

const router = express.Router();

router.get('/', (req, res) => {
  res.json(listSessions());
});

router.delete('/:portal', (req, res) => {
  const result = deleteSession(req.params.portal);
  res.json({ deleted: true, portal: req.params.portal });
});

export default router;
