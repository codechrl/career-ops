/**
 * Lightweight structured output helper — DSPy-inspired.
 * Wraps any LLM `.chat()` call and enforces valid JSON output
 * matching a given schema, with up to 3 attempts on parse failure.
 *
 * @param {object} llm     - LLM instance with .chat(messages, opts) method
 * @param {object} schema  - Plain object describing expected keys + example values
 * @param {Array}  messages - Conversation messages array
 * @param {object} [opts]  - Extra options passed to llm.chat (model, maxTokens, etc.)
 * @returns {Promise<object>} Parsed JSON object
 */
export async function structuredChat(llm, schema, messages, opts = {}) {
  const schemaJson = JSON.stringify(schema, null, 2);
  const msgs = messages.map(m => ({ ...m }));

  // Append schema requirement to the last user message
  const lastUserIdx = msgs.reduce((acc, m, i) => m.role === 'user' ? i : acc, -1);
  if (lastUserIdx >= 0) {
    msgs[lastUserIdx] = {
      ...msgs[lastUserIdx],
      content: msgs[lastUserIdx].content +
        `\n\nReturn ONLY a valid JSON object — no explanation, no markdown. Schema:\n${schemaJson}`,
    };
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    let raw = '';
    try {
      raw = await llm.chat(msgs, { temperature: 0.1, ...opts });
      // Strip markdown code fences if present
      const cleaned = raw
        .replace(/^\s*```(?:json)?\s*/m, '')
        .replace(/\s*```\s*$/m, '')
        .trim();
      const obj = JSON.parse(cleaned);
      // Validate all schema keys present
      for (const key of Object.keys(schema)) {
        if (!(key in obj)) throw new Error(`Missing key: ${key}`);
      }
      return obj;
    } catch (err) {
      if (attempt < 2) {
        msgs.push({ role: 'assistant', content: raw || '{}' });
        msgs.push({
          role: 'user',
          content: `Your response was not valid JSON matching the schema. ` +
            `Respond with ONLY the JSON object. No other text.`,
        });
      } else {
        throw new Error(`structuredChat failed after 3 attempts: ${err.message}`);
      }
    }
  }
}
