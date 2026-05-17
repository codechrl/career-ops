// @ts-check
/** @typedef {import('./_types.js').LlmProvider} LlmProvider */
/** @typedef {import('./_types.js').LlmMessage} LlmMessage */
/** @typedef {import('./_types.js').LlmOptions} LlmOptions */

const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_BASE = 'https://api.deepseek.com/v1';

/** @type {(messages: LlmMessage[], opts: LlmOptions, apiKey: string) => Promise<string>} */
async function chatCompletion(messages, opts, apiKey) {
  const model = opts.model || DEFAULT_MODEL;
  const url = `${DEFAULT_BASE}/chat/completions`;

  const body = {
    model,
    messages,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 8192,
    stream: false,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || 120_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`DeepSeek HTTP ${res.status}: ${text.slice(0, 500)}`);
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) throw new Error('DeepSeek returned empty response');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/** @type {LlmProvider} */
export default {
  id: 'deepseek',
  chat: (messages, opts = {}) => {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) throw new Error('DEEPSEEK_API_KEY not set in environment');
    return chatCompletion(messages, opts, key);
  },
};
