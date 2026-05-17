import express from 'express';
import { dbGet, dbRun } from '../../loaders/database.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { setLLM } from '../../llm/index.mjs';

const router = express.Router();
const VALID_PROCESSES = ['cv', 'scan', 'portal-discovery'];
const VALID_PROVIDERS = ['deepseek', 'openrouter', 'openai', 'anthropic', 'gemini'];

async function readConfig(processKey) {
  const row = await dbGet('SELECT value FROM settings WHERE key = ?', [`llm_config_${processKey}`]);
  if (!row) return { provider: process.env.LLM_PROVIDER || 'deepseek', model: '' };
  try { return JSON.parse(row.value); } catch { return { provider: 'deepseek', model: '' }; }
}

async function writeConfig(processKey, provider, model) {
  const now = new Date().toISOString();
  const value = JSON.stringify({ provider, model: model || '' });
  const exists = await dbGet('SELECT key FROM settings WHERE key = ?', [`llm_config_${processKey}`]);
  if (exists) {
    await dbRun('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?', [value, now, `llm_config_${processKey}`]);
  } else {
    await dbRun('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [`llm_config_${processKey}`, value, now]);
  }
}

router.get('/', requireAuth, async (req, res) => {
  const [cv, scan, portalDiscovery] = await Promise.all([
    readConfig('cv'), readConfig('scan'), readConfig('portal-discovery')
  ]);
  res.json({ cv, scan, 'portal-discovery': portalDiscovery });
});

router.put('/:process', requireAuth, async (req, res) => {
  const proc = req.params.process;
  if (!VALID_PROCESSES.includes(proc)) return res.status(400).json({ error: 'process must be cv or scan' });
  const { provider, model } = req.body;
  if (!provider || !VALID_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: `provider must be one of: ${VALID_PROVIDERS.join(', ')}` });
  }
  await writeConfig(proc, provider, model);
  // If CV config changes, update global provider as the active default
  if (proc === 'cv') {
    process.env.LLM_PROVIDER = provider;
    if (model) process.env.LLM_MODEL = model;
    try { setLLM(provider); } catch {}
  }
  res.json({ saved: true, process: proc, provider, model: model || '' });
});

router.get('/models/:provider', requireAuth, async (req, res) => {
  const { provider } = req.params;
  if (!VALID_PROVIDERS.includes(provider)) return res.status(400).json({ models: [] });

  const keyRow = await dbGet('SELECT api_key FROM llm_keys WHERE provider = ?', [provider]);
  const apiKey = keyRow?.api_key || process.env[`${provider.toUpperCase()}_API_KEY`];

  try {
    let models = [];

    if (provider === 'deepseek') {
      if (!apiKey) return res.json({ models: [] });
      const r = await fetch('https://api.deepseek.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      const data = await r.json();
      models = (data.data || []).map(m => m.id).filter(Boolean).sort();

    } else if (provider === 'openrouter') {
      const r = await fetch('https://openrouter.ai/api/v1/models', {
        signal: AbortSignal.timeout(10000),
      });
      const data = await r.json();
      models = (data.data || [])
        .map(m => m.id)
        .filter(Boolean)
        .sort();

    } else if (provider === 'openai') {
      if (!apiKey) return res.json({ models: [] });
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      const data = await r.json();
      models = (data.data || [])
        .map(m => m.id)
        .filter(id => /^(gpt|o\d|chatgpt)/.test(id))
        .sort();

    } else if (provider === 'anthropic') {
      // Anthropic has no public models list endpoint — return known models
      models = [
        'claude-opus-4-5',
        'claude-sonnet-4-5',
        'claude-haiku-4-5',
        'claude-3-7-sonnet-20250219',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
        'claude-3-haiku-20240307',
      ];

    } else if (provider === 'gemini') {
      if (!apiKey) return res.json({ models: [] });
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`,
        { signal: AbortSignal.timeout(8000) }
      );
      const data = await r.json();
      models = (data.models || [])
        .map(m => m.name?.replace('models/', ''))
        .filter(id => id && id.startsWith('gemini'))
        .sort();
    }

    res.json({ models });
  } catch {
    res.json({ models: [] });
  }
});

export default router;

