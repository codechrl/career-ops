// @ts-check
// LLM provider contract — mirrors providers/_types.js pattern.
// Each provider exports: { id, chat(messages, opts): Promise<string> }
//
// Both DeepSeek and OpenRouter speak OpenAI-compatible /v1/chat/completions,
// so the interface is unified.

/**
 * @typedef {object} LlmMessage
 * @property {'system'|'user'|'assistant'} role
 * @property {string} content
 */

/**
 * @typedef {object} LlmOptions
 * @property {string} [model] — override default model
 * @property {number} [temperature] — 0.0-2.0, default varies by provider
 * @property {number} [maxTokens] — max output tokens
 * @property {number} [timeoutMs] — request timeout, default 120000
 */

/**
 * @typedef {object} LlmProvider
 * @property {string} id
 * @property {function(LlmMessage[], LlmOptions=): Promise<string>} chat
 */

export default {};
