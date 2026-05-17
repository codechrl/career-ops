/**
 * Returns an AI SDK model instance for the given process key.
 * Reads provider + model from the settings table (llm_config_<key>),
 * falls back to LLM_PROVIDER / LLM_MODEL env vars.
 */
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export async function getAISdkModel(processKey) {
  let providerName = (process.env.LLM_PROVIDER || 'deepseek').toLowerCase();
  let modelId = process.env.LLM_MODEL || null;

  try {
    const { dbGet } = await import('../loaders/database.mjs');
    const row = await dbGet('SELECT value FROM settings WHERE key = ?', [`llm_config_${processKey}`]);
    if (row) {
      const cfg = JSON.parse(row.value);
      if (cfg.provider) providerName = cfg.provider.toLowerCase();
      if (cfg.model) modelId = cfg.model;
    }
  } catch { /* fall through */ }

  switch (providerName) {
    case 'deepseek': {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');
      const client = createOpenAI({ baseURL: 'https://api.deepseek.com/v1', apiKey });
      return client(modelId || 'deepseek-chat');
    }
    case 'openrouter': {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');
      const client = createOpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey });
      return client(modelId || 'anthropic/claude-3-5-sonnet');
    }
    case 'openai': {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY not set');
      const client = createOpenAI({ apiKey });
      return client(modelId || 'gpt-4o-mini');
    }
    case 'anthropic': {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
      const client = createAnthropic({ apiKey });
      return client(modelId || 'claude-3-5-haiku-20241022');
    }
    case 'gemini': {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY not set');
      const client = createGoogleGenerativeAI({ apiKey });
      return client(modelId || 'gemini-1.5-flash');
    }
    default:
      throw new Error(`Provider "${providerName}" is not supported by the AI SDK adapter`);
  }
}
