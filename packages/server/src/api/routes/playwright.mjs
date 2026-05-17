import express from 'express';
import { startLoginSession, saveSession, listSavedSessions, clearSession } from '../../services/playwright-session.mjs';

const router = express.Router();

router.post('/start', async (req, res) => {
  try {
    const portal = req.body.portal || 'linkedin';
    const result = await startLoginSession(portal);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/save', async (req, res) => {
  try {
    const portal = req.body.portal || 'linkedin';
    const result = await saveSession(portal);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', (req, res) => {
  res.json(listSavedSessions());
});

router.delete('/:portal', (req, res) => {
  try {
    const result = clearSession(req.params.portal);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
