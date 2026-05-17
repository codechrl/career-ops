"""
Portal Discovery Agent — CrewAI implementation.
Single agent with tools: fetch_url, test_search, extract_links, google_search.
Returns structured DiscoveryResult.
"""

import json
import re
from typing import Optional, Type

import requests
from crewai import LLM, Agent, Crew, Process, Task
from crewai.tools import BaseTool
from pydantic import BaseModel, Field


# ── Constants ──────────────────────────────────────────────────────────────────

FETCH_TIMEOUT = 12
MAX_BODY_CHARS = 3000


# ── Output schema ──────────────────────────────────────────────────────────────

class DiscoveryResult(BaseModel):
    method: str = Field(description="One of: rss_feed, json_api, html_scrape, playwright, ats, unsupported, unknown")
    url_template: Optional[str] = Field(default=None, description="URL template with {query} placeholder, or null")
    notes: str = Field(description="Brief explanation of what was found")
    confidence: str = Field(description="One of: high, medium, low")


# ── Tool input schemas ─────────────────────────────────────────────────────────

class FetchUrlInput(BaseModel):
    url: str = Field(description="Full URL to fetch")
    method: str = Field(default="GET", description="HTTP method: GET or HEAD")


class TestSearchInput(BaseModel):
    url_template: str = Field(description="URL template with {query} placeholder to test")
    query: str = Field(default="software engineer", description="Sample query to fill into the template")


class ExtractLinksInput(BaseModel):
    url: str = Field(description="URL to extract job/api/rss-related links from")


class GoogleSearchInput(BaseModel):
    query: str = Field(description="Search query, e.g. 'site:portal.com api jobs'")


# ── Tool implementations ───────────────────────────────────────────────────────

class FetchUrlTool(BaseTool):
    name: str = "fetch_url"
    description: str = (
        "Fetch a URL and return HTTP status, content-type, and body preview (first 3000 chars). "
        "Use method='HEAD' to check reachability without downloading the body."
    )
    args_schema: Type[BaseModel] = FetchUrlInput

    def _run(self, url: str, method: str = "GET") -> str:
        try:
            resp = requests.request(
                method,
                url,
                timeout=FETCH_TIMEOUT,
                headers={
                    "User-Agent": "career-ops/portal-discovery",
                    "Accept": "text/html,application/json,application/xml,application/rss+xml,*/*;q=0.9",
                },
                allow_redirects=True,
            )
            body = "" if method == "HEAD" else resp.text[:MAX_BODY_CHARS]
            return json.dumps({
                "status": resp.status_code,
                "ok": resp.ok,
                "content_type": resp.headers.get("content-type", ""),
                "url": resp.url,
                "body": body,
            })
        except Exception as e:
            return json.dumps({"error": str(e), "url": url})


class TestSearchTool(BaseTool):
    name: str = "test_search"
    description: str = (
        "Fill a URL template with a sample query and check if the response looks like job listings. "
        "Use {query} as the placeholder in the template, e.g. https://api.example.com/jobs?q={query}"
    )
    args_schema: Type[BaseModel] = TestSearchInput

    def _run(self, url_template: str, query: str = "software engineer") -> str:
        filled = (
            url_template
            .replace("{query}", requests.utils.quote(query))
            .replace("{tag}", "software")
            .replace("{slug}", "software-engineer")
            .replace("{category}", "software")
            .replace("{company}", "test")
        )
        try:
            resp = requests.get(
                filled,
                timeout=FETCH_TIMEOUT,
                headers={"User-Agent": "career-ops/portal-discovery"},
                allow_redirects=True,
            )
            body = resp.text[:MAX_BODY_CHARS]
            is_json = body.lstrip().startswith(("{", "["))
            is_xml = bool(re.match(r"\s*(<\?xml|<rss|<feed|<channel)", body, re.I))
            has_job_kw = bool(re.search(r"\b(job|position|role|vacancy|opening|career|title|company)\b", body, re.I))
            item_count = (
                len(re.findall(r'"(?:title|job_title|name)"\s*:', body))
                if is_json
                else len(re.findall(r"<(?:item|entry|job)[\s>]", body, re.I))
            )
            return json.dumps({
                "status": resp.status_code,
                "ok": resp.ok,
                "content_type": resp.headers.get("content-type", ""),
                "url": resp.url,
                "body": body,
                "is_json": is_json,
                "is_xml": is_xml,
                "has_job_keyword": has_job_kw,
                "estimated_item_count": item_count,
                "looks_like_jobs": has_job_kw and (is_json or is_xml or item_count > 0),
            })
        except Exception as e:
            return json.dumps({"error": str(e), "url": filled})


class ExtractLinksTool(BaseTool):
    name: str = "extract_links"
    description: str = (
        "Fetch a page and extract all href links and inline paths that contain "
        "job/api/rss/feed/search/career keywords. Returns up to 40 links."
    )
    args_schema: Type[BaseModel] = ExtractLinksInput

    def _run(self, url: str) -> str:
        try:
            resp = requests.get(
                url,
                timeout=FETCH_TIMEOUT,
                headers={"User-Agent": "career-ops/portal-discovery"},
                allow_redirects=True,
            )
            body = resp.text[:MAX_BODY_CHARS]
            links = set()
            for m in re.finditer(r'href=["\']([^"\'#\s]+)["\']', body, re.I):
                href = m.group(1)
                if re.search(r"job|api|rss|feed|search|career|position|vacancy|opening", href, re.I):
                    try:
                        from urllib.parse import urljoin
                        links.add(urljoin(url, href))
                    except Exception:
                        links.add(href)
            for m in re.finditer(r'["\`](\/[^\s"\`<>]*(?:api|rss|feed|search|jobs)[^\s"\`<>]*)["\`]', body, re.I):
                try:
                    from urllib.parse import urljoin
                    links.add(urljoin(url, m.group(1)))
                except Exception:
                    links.add(m.group(1))
            link_list = list(links)[:40]
            return json.dumps({"links": link_list, "total_found": len(links)})
        except Exception as e:
            return json.dumps({"error": str(e), "url": url})


class GoogleSearchTool(BaseTool):
    name: str = "google_search"
    description: str = (
        "Search Google via SerpAPI. Use this to find API docs, RSS feeds, or developer guides "
        "for the portal when direct exploration is unclear. "
        "Example queries: 'site:lever.co api jobs', 'greenhouse.io jobs api RSS feed'"
    )
    args_schema: Type[BaseModel] = GoogleSearchInput
    serpapi_key: str = ""

    def _run(self, query: str) -> str:
        if not self.serpapi_key:
            return json.dumps({"error": "SerpAPI key not configured"})
        try:
            resp = requests.get(
                "https://serpapi.com/search.json",
                params={"engine": "google", "q": query, "num": 10, "api_key": self.serpapi_key},
                timeout=FETCH_TIMEOUT,
            )
            if not resp.ok:
                return json.dumps({"error": f"SerpAPI HTTP {resp.status_code}"})
            data = resp.json()
            results = [
                {"title": r.get("title"), "link": r.get("link"), "snippet": r.get("snippet")}
                for r in data.get("organic_results", [])
            ]
            return json.dumps({"results": results, "total": len(results)})
        except Exception as e:
            return json.dumps({"error": str(e)})


# ── LLM factory ───────────────────────────────────────────────────────────────

def build_llm(provider: str, model: str, api_key: str) -> LLM:
    provider = provider.lower()
    if provider == "deepseek":
        return LLM(
            model=f"deepseek/{model or 'deepseek-chat'}",
            api_key=api_key,
            base_url="https://api.deepseek.com/v1",
        )
    if provider == "openrouter":
        return LLM(
            model=f"openrouter/{model or 'anthropic/claude-3-5-sonnet-20241022'}",
            api_key=api_key,
        )
    if provider == "openai":
        return LLM(model=model or "gpt-4o-mini", api_key=api_key)
    if provider == "anthropic":
        return LLM(model=f"anthropic/{model or 'claude-3-5-haiku-20241022'}", api_key=api_key)
    if provider == "gemini":
        return LLM(model=f"gemini/{model or 'gemini-1.5-flash'}", api_key=api_key)
    # fallback: pass model string as-is (litellm will handle it)
    return LLM(model=model, api_key=api_key)


# ── Main entry point ──────────────────────────────────────────────────────────

def run_discovery_agent(
    portal_id: int,
    portal_name: str,
    portal_provider: str,
    careers_url: str,
    llm_provider: str,
    llm_model: str,
    llm_api_key: str,
    serpapi_key: Optional[str] = None,
) -> dict:
    llm = build_llm(llm_provider, llm_model, llm_api_key)
    tag = f"[{portal_name}]"

    step_num = [0]

    def on_step(step_output) -> None:
        step_num[0] += 1
        # Extract readable content from whatever CrewAI passes
        if hasattr(step_output, 'thought') and step_output.thought:
            print(f"{tag} step {step_num[0]} THINK: {str(step_output.thought)[:300]}", flush=True)
        if hasattr(step_output, 'tool') and step_output.tool:
            args = getattr(step_output, 'tool_input', '') or ''
            print(f"{tag} step {step_num[0]} TOOL: {step_output.tool}({str(args)[:200]})", flush=True)
        if hasattr(step_output, 'result') and step_output.result:
            print(f"{tag} step {step_num[0]} RESULT: {str(step_output.result)[:200]}", flush=True)
        if not any(hasattr(step_output, a) and getattr(step_output, a) for a in ('thought', 'tool', 'result')):
            print(f"{tag} step {step_num[0]}: {str(step_output)[:300]}", flush=True)

    tools = [FetchUrlTool(), TestSearchTool(), ExtractLinksTool()]
    if serpapi_key:
        tools.append(GoogleSearchTool(serpapi_key=serpapi_key))

    print(f"{tag} Starting discovery (provider={portal_provider}, url={careers_url})", flush=True)

    agent = Agent(
        role="Job Board Search Analyst",
        goal="Discover the best programmatic way to search for job listings on a given job portal",
        backstory=(
            "You are an expert at reverse-engineering job boards. You know how to find "
            "JSON APIs, RSS feeds, and search endpoints. You are methodical: you fetch pages, "
            "extract links, test templates, and confirm results before concluding."
        ),
        tools=tools,
        llm=llm,
        verbose=False,
        memory=False,
        max_iter=14,
        step_callback=on_step,
    )

    task = Task(
        description=f"""Discover how to programmatically search for jobs on this portal:

Name: {portal_name}
Provider: {portal_provider}
URL: {careers_url}

Methods to identify (pick the best one):
- rss_feed: Portal exposes an RSS/Atom feed
- json_api: Portal has a JSON API endpoint returning job listings  
- html_scrape: Portal returns parseable HTML (no JS required)
- playwright: Portal requires a real browser (JS-heavy SPA — last resort)
- ats: Per-company ATS (greenhouse.io, ashby, lever, workable) — search per company slug
- unsupported: Cannot be searched programmatically
- unknown: Could not determine

URL template variables you can use: {{query}}, {{tag}}, {{slug}}, {{category}}, {{company}}

Strategy:
1. Fetch the main page and/or /jobs path to understand the portal structure
2. Use extract_links to find API/RSS/search endpoints
3. Test promising URL templates with test_search
4. If structure is unclear, use google_search to find developer docs or API info
5. Prefer: JSON API > RSS feed > HTML scrape > Playwright
6. Confirm your best candidate actually returns job data before concluding

Return your final answer as a JSON object with exactly these keys:
- method: one of the methods listed above
- url_template: the URL template with {{query}} placeholder (or null if not applicable)
- notes: brief explanation of what you found
- confidence: "high", "medium", or "low"
""",
        expected_output=(
            'A JSON object with keys: method (string), url_template (string or null), '
            'notes (string), confidence ("high"/"medium"/"low")'
        ),
        agent=agent,
    )

    crew = Crew(
        agents=[agent],
        tasks=[task],
        process=Process.sequential,
        verbose=False,
        memory=False,
    )

    try:
        result = crew.kickoff()

        # Try pydantic output first
        if result.pydantic:
            return result.pydantic.model_dump()

        # Fall back to json_dict
        if result.json_dict:
            return result.json_dict

        # Fall back to parsing raw text
        raw = str(result.raw) if hasattr(result, "raw") else str(result)
        import logging
        print(f"[discovery] raw output ({len(raw)} chars): {raw[:600]!r}", flush=True)

        def _try_parse_json(text: str):
            """Try json.JSONDecoder().raw_decode at every '{' until we find a valid dict with 'method'."""
            for i, ch in enumerate(text):
                if ch == '{':
                    try:
                        parsed, _ = json.JSONDecoder().raw_decode(text, i)
                        if isinstance(parsed, dict) and "method" in parsed:
                            return parsed
                    except Exception:
                        continue
            return None

        # First priority: JSON inside a ```json ... ``` block
        fence_match = re.search(r"```(?:json)?\s*(\{.*?)\s*```", raw, re.DOTALL)
        if fence_match:
            result_dict = _try_parse_json(fence_match.group(1))
            if result_dict:
                print(f"[discovery] parsed OK (fence): {result_dict}", flush=True)
                return result_dict

        # Second priority: scan entire raw text for a JSON object with "method"
        result_dict = _try_parse_json(raw)
        if result_dict:
            print(f"[discovery] parsed OK (scan): {result_dict}", flush=True)
            return result_dict

        print(f"[discovery] no JSON found in raw output", flush=True)

        # Last resort
        return {
            "method": "unknown",
            "url_template": None,
            "notes": f"Agent returned unstructured output: {raw[:200]}",
            "confidence": "low",
        }
    except Exception as e:
        return {
            "method": "unknown",
            "url_template": None,
            "notes": f"Agent error: {str(e)}",
            "confidence": "low",
        }
