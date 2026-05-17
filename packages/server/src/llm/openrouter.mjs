// @ts-check
/** @typedef {import('./_types.js').LlmProvider} LlmProvider */
/** @typedef {import('./_types.js').LlmMessage} LlmMessage */
/** @typedef {import('./_types.js').LlmOptions} LlmOptions */

const DEFAULT_MODEL = 'deepseek/deepseek-chat';
const BASE = 'https://openrouter.ai/api/v1/chat/completions';

/** @type {(messages: LlmMessage[], opts: LlmOptions, apiKey: string) => Promise<string>} */
async function chatCompletion(messages, opts, apiKey) {
  const model = opts.model || process.env.LLM_MODEL || DEFAULT_MODEL;

  const body = {
    model,
    messages,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 8192,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || 120_000);

  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost:8080',
        'X-Title': 'career-ops',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenRouter HTTP ${res.status}: ${text.slice(0, 500)}`);
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenRouter returned empty response');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/** @type {LlmProvider} */
export default {
  id: 'openrouter',
  chat: (messages, opts = {}) => {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error('OPENROUTER_API_KEY not set in environment');
    return chatCompletion(messages, opts, key);
  },
};
