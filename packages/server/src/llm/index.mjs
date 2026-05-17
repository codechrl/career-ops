// @ts-check
/** @typedef {import('./_types.js').LlmProvider} LlmProvider */

import deepseek from './deepseek.mjs';
import openrouter from './openrouter.mjs';
import openai from './openai.mjs';
import anthropic from './anthropic.mjs';
import gemini from './gemini.mjs';

const providers = new Map([
  ['deepseek', deepseek],
  ['openrouter', openrouter],
  ['openai', openai],
  ['anthropic', anthropic],
  ['gemini', gemini],
]);

let _provider = null;

/** @returns {LlmProvider} */
export function getLLM() {
  if (_provider) return _provider;
  const name = (process.env.LLM_PROVIDER || 'deepseek').toLowerCase();
  const p = providers.get(name);
  if (!p) throw new Error(`Unknown LLM_PROVIDER: ${name}`);
  _provider = p;
  return _provider;
}

/** @param {string} name @returns {LlmProvider|null} */
export function getLLMByName(name) {
  if (!name) return null;
  return providers.get(name.toLowerCase()) || null;
}

/** @param {string} name */
export function setLLM(name) {
  const p = providers.get(name.toLowerCase());
  if (!p) throw new Error(`Unknown LLM_PROVIDER: ${name}`);
  _provider = p;
}

export { providers };
