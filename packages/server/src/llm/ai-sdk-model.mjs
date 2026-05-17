/**
 * Returns an AI SDK model instance for the given process key.
 * Reads provider + model from the settings table (llm_config_<key>),
 * falls back to LLM_PROVIDER / LLM_MODEL env vars.
 */
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

async function getApiKey(provider, envVar) {
  const envKey = process.env[envVar];
  if (envKey) return envKey;
  try {
    const { getLLMKey } = await import('../models/llm-key.mjs');
    const row = await getLLMKey(provider);
    if (row?.api_key) return row.api_key;
  } catch { /* fall through */ }
  return null;
}

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
      const apiKey = await getApiKey('deepseek', 'DEEPSEEK_API_KEY');
      if (!apiKey) throw new Error('DeepSeek API key not configured');
      const client = createOpenAI({ baseURL: 'https://api.deepseek.com/v1', apiKey });
      return client.chat(modelId || 'deepseek-chat');
    }
    case 'openrouter': {
      const apiKey = await getApiKey('openrouter', 'OPENROUTER_API_KEY');
      if (!apiKey) throw new Error('OpenRouter API key not configured');
      const client = createOpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey });
      return client.chat(modelId || 'anthropic/claude-3-5-sonnet-20241022');
    }
    case 'openai': {
      const apiKey = await getApiKey('openai', 'OPENAI_API_KEY');
      if (!apiKey) throw new Error('OpenAI API key not configured');
      const client = createOpenAI({ apiKey });
      return client.chat(modelId || 'gpt-4o-mini');
    }
    case 'anthropic': {
      const apiKey = await getApiKey('anthropic', 'ANTHROPIC_API_KEY');
      if (!apiKey) throw new Error('Anthropic API key not configured');
      const client = createAnthropic({ apiKey });
      return client(modelId || 'claude-3-5-haiku-20241022');
    }
    case 'gemini': {
      const apiKey = await getApiKey('gemini', 'GEMINI_API_KEY');
      if (!apiKey) throw new Error('Gemini API key not configured');
      const client = createGoogleGenerativeAI({ apiKey });
      return client(modelId || 'gemini-1.5-flash');
    }
    default:
      throw new Error(`Provider "${providerName}" is not supported by the AI SDK adapter`);
  }
}
