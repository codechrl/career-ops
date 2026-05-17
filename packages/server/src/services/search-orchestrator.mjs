import { getLLM } from '../llm/index.mjs';

const DEFAULT_PROVIDER = 'serpapi';

const SEARCH_PROVIDER_URLS = {
  serpapi: 'https://serpapi.com/search.json',
};

async function callSearchApi(provider, apiKey, query) {
  if (!SEARCH_PROVIDER_URLS[provider]) {
    throw new Error(`Unsupported search provider: ${provider}`);
  }
  const url = new URL(SEARCH_PROVIDER_URLS[provider]);
  url.searchParams.set('q', query);
  url.searchParams.set('engine', 'google');
  url.searchParams.set('api_key', apiKey);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${provider} error: ${res.status} ${text}`);
  }
  return await res.json();
}

function parseSerpApiResults(json) {
  if (!Array.isArray(json.organic_results)) return [];
  return json.organic_results.slice(0, 15).map(item => ({
    title: item.title || '',
    url: item.link || item.displayed_link || '',
    snippet: item.snippet || item.description || '',
    source: item.source || 'search',
  }));
}

export async function generateSearchPlan(description) {
  const llm = getLLM();
  const messages = [
    {
      role: 'system',
      content: 'You are a job-search assistant that translates a candidate job description into search keywords and portal-specific queries.'
    },
    {
      role: 'user',
      content: `The user describes the job they want as follows:\n${description}\n\nReply with a JSON object containing:\n{\n  "keywords": ["..."],\n  "queries": ["..."],\n  "notes": "..."\n}`
    }
  ];
  const response = await llm.chat(messages, { temperature: 0.2, maxTokens: 800 });
  try {
    const json = JSON.parse(response);
    return json;
  } catch {
    return { keywords: [], queries: [description], notes: response.trim() };
  }
}

export async function searchWithProvider(description) {
  const plan = await generateSearchPlan(description);
  const provider = (process.env.SEARCH_API_PROVIDER || DEFAULT_PROVIDER).toLowerCase();
  const apiKey = process.env.SEARCH_API_KEY;
  const results = [];
  if (apiKey) {
    for (const query of plan.queries.slice(0, 4)) {
      try {
        const json = await callSearchApi(provider, apiKey, query);
        results.push(...parseSerpApiResults(json));
      } catch (error) {
        console.warn('Search provider error', error.message);
      }
    }
  }
  return { plan, results };
}
