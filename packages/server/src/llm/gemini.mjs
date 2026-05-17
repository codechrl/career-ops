// @ts-check
/** @typedef {import('./_types.js').LlmProvider} LlmProvider */
/** @typedef {import('./_types.js').LlmMessage} LlmMessage */
/** @typedef {import('./_types.js').LlmOptions} LlmOptions */

const DEFAULT_MODEL = 'gemini-2.0-flash';

/** @type {(messages: LlmMessage[], opts: LlmOptions, apiKey: string) => Promise<string>} */
async function chatCompletion(messages, opts, apiKey) {
  const model = opts.model || process.env.LLM_MODEL || DEFAULT_MODEL;

  let systemInstruction = null;
  const contents = [];

  for (const m of messages) {
    if (m.role === 'system') {
      systemInstruction = { parts: [{ text: m.content }] };
    } else {
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      });
    }
  }

  const body = {
    contents,
    ...(systemInstruction ? { system_instruction: systemInstruction } : {}),
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxTokens ?? 8192,
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || 120_000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 500)}`);
    }

    const json = await res.json();
    const content = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('Gemini returned empty response');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/** @type {LlmProvider} */
export default {
  id: 'gemini',
  chat: (messages, opts = {}) => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY not set in environment');
    return chatCompletion(messages, opts, key);
  },
};
