import express from 'express';
import { generateSearchPlan, searchWithProvider } from '../../services/search-orchestrator.mjs';

const router = express.Router();

router.post('/', async (req, res) => {
  const { description } = req.body;
  if (!description) return res.status(400).json({ error: 'description is required' });
  try {
    const result = await searchWithProvider(description);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/plan', async (req, res) => {
  const { description } = req.body;
  if (!description) return res.status(400).json({ error: 'description is required' });
  try {
    const plan = await generateSearchPlan(description);
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
