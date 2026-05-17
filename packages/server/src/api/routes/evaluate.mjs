import express from 'express';
import { evaluateJob } from '../../services/evaluator.mjs';

const router = express.Router();

router.post('/', async (req, res) => {
  const { jdText, url, company, role } = req.body;
  if (!jdText) return res.status(400).json({ error: 'jdText is required' });
  try {
    const result = await evaluateJob({ jdText, url, company, role });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
