// @ts-check
/** @typedef {import('./_types.js').LlmProvider} LlmProvider */

import deepseek from './deepseek.mjs';
import openrouter from './openrouter.mjs';

const providers = new Map([
  ['deepseek', deepseek],
  ['openrouter', openrouter],
]);

let _provider = null;

/** @returns {LlmProvider} */
export function getLLM() {
  if (_provider) return _provider;
  const name = (process.env.LLM_PROVIDER || 'deepseek').toLowerCase();
  const p = providers.get(name);
  if (!p) throw new Error(`Unknown LLM_PROVIDER: ${name}. Use 'deepseek' or 'openrouter'.`);
  _provider = p;
  return _provider;
}

/** @param {string} name */
export function setLLM(name) {
  const p = providers.get(name.toLowerCase());
  if (!p) throw new Error(`Unknown LLM_PROVIDER: ${name}`);
  _provider = p;
}

export { providers };
