import express from 'express';
import { setLLMKey, listLLMKeys, getLLMKey, deleteLLMKey } from '../../models/llm-key.mjs';
import { requireAuth } from '../middleware/auth.mjs';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  res.json(await listLLMKeys());
});

router.get('/:provider', requireAuth, async (req, res) => {
  const key = await getLLMKey(req.params.provider);
  if (!key) return res.status(404).json({ error: 'provider not found' });
  res.json(key);
});

router.put('/:provider', requireAuth, async (req, res) => {
  const { api_key } = req.body;
  if (!api_key) return res.status(400).json({ error: 'api_key required' });
  await setLLMKey(req.params.provider, api_key);
  const envKey = `${req.params.provider.toUpperCase()}_API_KEY`;
  process.env[envKey] = api_key;
  res.json({ saved: true, provider: req.params.provider });
});

router.delete('/:provider', requireAuth, async (req, res) => {
  await deleteLLMKey(req.params.provider);
  res.json({ deleted: true, provider: req.params.provider });
});

export default router;
