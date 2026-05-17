import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

let config;

export function loadConfig() {
  if (config) return config;

  const root = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..', '..');
  dotenv.config({ path: path.resolve(root, '.env') });

  config = {
    port: parseInt(process.env.PORT || '3000', 10),
    jwtSecret: process.env.JWT_SECRET || 'career-ops-dev-secret',
    llmProvider: process.env.LLM_PROVIDER || 'deepseek',
    searchApiProvider: process.env.SEARCH_API_PROVIDER || 'serpapi',
    searchApiKey: process.env.SEARCH_API_KEY || '',
    root,
  };

  return config;
}
