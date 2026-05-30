"""
JobSpy fetch agent — scrapes jobs from LinkedIn, Indeed, Glassdoor, ZipRecruiter, Google.

search_config fields for method=jobspy:
  sites          : list of site names to scrape (default: ["indeed", "linkedin"])
                   options: linkedin, indeed, glassdoor, zip_recruiter, google, bayt, naukri
  location       : location string (e.g. "San Francisco, CA")
  country_indeed : country for Indeed/Glassdoor (default: "USA")
  hours_old      : only return jobs posted within N hours
  job_type       : fulltime, parttime, internship, contract
  is_remote      : bool — filter for remote jobs
  proxies        : list of proxy strings (e.g. ["user:pass@host:port"])
  google_search_term : full Google Jobs search string (overrides auto-built term)
"""

import os
from typing import Optional

try:
    from jobspy import scrape_jobs
    HAS_JOBSPY = True
except ImportError:
    HAS_JOBSPY = False
    print("[jobspy-agent] python-jobspy not installed — install with: pip install python-jobspy", flush=True)


def run_jobspy_fetch(
    search_config: dict,
    target_role: str,
    limit: int = 50,
) -> list[dict]:
    if not HAS_JOBSPY:
        print("[jobspy-agent] Skipped — python-jobspy not installed.", flush=True)
        return []

    sites = search_config.get("sites") or ["indeed", "linkedin"]
    location = search_config.get("location") or ""
    country_indeed = search_config.get("country_indeed") or "USA"
    hours_old = search_config.get("hours_old")
    job_type = search_config.get("job_type")
    is_remote = search_config.get("is_remote")
    proxies = search_config.get("proxies") or []
    google_search_term = search_config.get("google_search_term")

    kwargs: dict = dict(
        site_name=sites,
        search_term=target_role,
        results_wanted=min(limit, 50),
        verbose=0,
        description_format="markdown",
    )

    if location:
        kwargs["location"] = location
    if country_indeed:
        kwargs["country_indeed"] = country_indeed
    if hours_old is not None:
        kwargs["hours_old"] = int(hours_old)
    if job_type:
        kwargs["job_type"] = job_type
    if is_remote is not None:
        kwargs["is_remote"] = bool(is_remote)
    if proxies:
        kwargs["proxies"] = proxies
    if google_search_term:
        kwargs["google_search_term"] = google_search_term

    print(f"[jobspy-agent] scraping {sites} for '{target_role}' @ '{location}'", flush=True)

    try:
        df = scrape_jobs(**kwargs)
    except Exception as e:
        print(f"[jobspy-agent] scrape_jobs failed: {e}", flush=True)
        return []

    if df is None or df.empty:
        print("[jobspy-agent] No results returned.", flush=True)
        return []

    jobs: list[dict] = []
    for _, row in df.iterrows():
        title = str(row.get("title") or "").strip()
        url = str(row.get("job_url") or "").strip()
        if not title or not url:
            continue
        company = str(row.get("company") or "").strip()
        desc = str(row.get("description") or "").strip()[:5000]
        jobs.append({
            "title": title,
            "url": url,
            "company": company,
            "jd_text": desc,
        })

    print(f"[jobspy-agent] → {len(jobs)} jobs", flush=True)
    return jobs[:limit]
