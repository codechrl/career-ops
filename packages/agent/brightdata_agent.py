"""
Bright Data LinkedIn Scraper agent.

Uses the Bright Data Datasets v3 API to scrape LinkedIn job listings.
Handles both:
  - Direct job URLs  (dataset_id=gd_lpfll7v5hcqtkxl6l, collect by URL)
  - Search/discovery URLs  (same dataset, LinkedIn jobs/search URL)

Docs: https://docs.brightdata.com/datasets/scrapers/linkedin/introduction

search_config fields for method=brightdata_linkedin:
  search_url  : LinkedIn jobs search URL
                e.g. "https://www.linkedin.com/jobs/search/?keywords=engineer&location=London"
                If omitted, auto-built from target_role + location.
  job_urls    : list of direct LinkedIn job view URLs (alternative to search_url)
                e.g. ["https://www.linkedin.com/jobs/view/3986111804"]
  location    : location string used when auto-building search_url
  api_key     : Bright Data API key (overrides BRIGHTDATA_API_KEY env var)
  async_mode  : bool — use async /trigger endpoint for >20 URLs (default: false)
  timeout     : request timeout in seconds (default: 90)
"""

import os
import time
import urllib.parse
from typing import Optional

import requests

BRIGHTDATA_API_BASE = "https://api.brightdata.com/datasets/v3"
JOBS_DATASET_ID = "gd_lpfll7v5hcqtkxl6l"

# Poll interval and max wait for async snapshots (seconds)
_ASYNC_POLL_INTERVAL = 10
_ASYNC_MAX_WAIT = 300


def _get_api_key(search_config: dict) -> str:
    key = (
        search_config.get("api_key")
        or os.environ.get("BRIGHTDATA_API_KEY", "")
    )
    return key.strip()


def _build_search_url(target_role: str, location: str) -> str:
    params: dict[str, str] = {"keywords": target_role}
    if location:
        params["location"] = location
    qs = urllib.parse.urlencode(params)
    return f"https://www.linkedin.com/jobs/search/?{qs}"


def _parse_job(item: dict) -> Optional[dict]:
    if not isinstance(item, dict):
        return None
    title = str(
        item.get("title") or item.get("job_title") or item.get("position") or ""
    ).strip()
    url = str(
        item.get("url") or item.get("job_url") or item.get("link") or ""
    ).strip()
    if not title or not url:
        return None
    company = str(
        item.get("company") or item.get("company_name") or item.get("organization") or ""
    ).strip()
    if isinstance(item.get("company"), dict):
        company = item["company"].get("name", company)
    desc = str(
        item.get("description") or item.get("job_description") or item.get("summary") or ""
    ).strip()[:5000]
    return {"title": title, "url": url, "company": company, "jd_text": desc}


def _sync_scrape(urls: list[str], api_key: str, timeout: int) -> list[dict]:
    """POST up to 20 URLs to the synchronous /scrape endpoint."""
    payload = [{"url": u} for u in urls[:20]]
    endpoint = f"{BRIGHTDATA_API_BASE}/scrape?dataset_id={JOBS_DATASET_ID}&format=json"
    resp = requests.post(
        endpoint,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=timeout,
    )
    resp.raise_for_status()
    data = resp.json()
    if isinstance(data, dict):
        # May return {"snapshot_id": "..."} on timeout → fall through to empty
        if "snapshot_id" in data:
            print(
                f"[brightdata-agent] sync request timed out, snapshot_id={data['snapshot_id']}. "
                "Consider using async_mode=true for large batches.",
                flush=True,
            )
            return []
        data = data.get("results") or data.get("jobs") or data.get("data") or []
    if not isinstance(data, list):
        return []
    return data


def _async_scrape(urls: list[str], api_key: str, timeout: int) -> list[dict]:
    """POST URLs to the async /trigger endpoint, then poll for results."""
    payload = [{"url": u} for u in urls]
    trigger_url = f"{BRIGHTDATA_API_BASE}/trigger?dataset_id={JOBS_DATASET_ID}&format=json"
    resp = requests.post(
        trigger_url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=30,
    )
    resp.raise_for_status()
    snapshot_id = resp.json().get("snapshot_id")
    if not snapshot_id:
        print("[brightdata-agent] async trigger did not return snapshot_id", flush=True)
        return []

    print(f"[brightdata-agent] async snapshot_id={snapshot_id}, polling…", flush=True)
    deadline = time.time() + _ASYNC_MAX_WAIT
    while time.time() < deadline:
        time.sleep(_ASYNC_POLL_INTERVAL)
        status_resp = requests.get(
            f"{BRIGHTDATA_API_BASE}/snapshot/{snapshot_id}?format=json",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=30,
        )
        if status_resp.status_code == 200:
            data = status_resp.json()
            if isinstance(data, list):
                return data
            if isinstance(data, dict) and data.get("status") in ("ready", "complete"):
                inner = data.get("data") or data.get("results") or []
                return inner if isinstance(inner, list) else []
        elif status_resp.status_code == 202:
            continue  # still processing
        else:
            print(f"[brightdata-agent] poll returned {status_resp.status_code}", flush=True)
            break

    print("[brightdata-agent] async polling timed out or failed", flush=True)
    return []


def run_brightdata_linkedin_fetch(
    search_config: dict,
    target_role: str,
    limit: int = 50,
) -> list[dict]:
    api_key = _get_api_key(search_config)
    if not api_key:
        print(
            "[brightdata-agent] No API key — set BRIGHTDATA_API_KEY env var "
            "or search_config.api_key",
            flush=True,
        )
        return []

    location = search_config.get("location") or ""
    job_urls: list[str] = search_config.get("job_urls") or []
    search_url: str = search_config.get("search_url") or ""
    use_async: bool = bool(search_config.get("async_mode", False))
    req_timeout: int = int(search_config.get("timeout", 90))

    if not job_urls and not search_url:
        search_url = _build_search_url(target_role, location)

    urls = job_urls if job_urls else [search_url]
    print(
        f"[brightdata-agent] scraping {len(urls)} URL(s) for '{target_role}' "
        f"({'async' if use_async else 'sync'})",
        flush=True,
    )

    try:
        raw = (
            _async_scrape(urls, api_key, req_timeout)
            if use_async
            else _sync_scrape(urls, api_key, req_timeout)
        )
    except requests.HTTPError as e:
        print(f"[brightdata-agent] HTTP error: {e}", flush=True)
        return []
    except Exception as e:
        print(f"[brightdata-agent] Request failed: {e}", flush=True)
        return []

    jobs: list[dict] = []
    for item in raw:
        parsed = _parse_job(item)
        if parsed:
            jobs.append(parsed)
        if len(jobs) >= limit:
            break

    print(f"[brightdata-agent] → {len(jobs)} jobs", flush=True)
    return jobs
