// @ts-check
/** @typedef {import('./_types.js').LlmProvider} LlmProvider */
/** @typedef {import('./_types.js').LlmMessage} LlmMessage */
/** @typedef {import('./_types.js').LlmOptions} LlmOptions */

const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';

/** @type {(messages: LlmMessage[], opts: LlmOptions, apiKey: string) => Promise<string>} */
async function chatCompletion(messages, opts, apiKey) {
  const model = opts.model || process.env.LLM_MODEL || DEFAULT_MODEL;

  const systemMsg = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
  const userMessages = messages.filter(m => m.role !== 'system');

  const body = {
    model,
    messages: userMessages,
    ...(systemMsg ? { system: systemMsg } : {}),
    max_tokens: opts.maxTokens ?? 8192,
    temperature: opts.temperature ?? 0.4,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || 120_000);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Anthropic HTTP ${res.status}: ${text.slice(0, 500)}`);
    }

    const json = await res.json();
    const content = json?.content?.[0]?.text;
    if (!content) throw new Error('Anthropic returned empty response');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/** @type {LlmProvider} */
export default {
  id: 'anthropic',
  chat: (messages, opts = {}) => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY not set in environment');
    return chatCompletion(messages, opts, key);
  },
};
