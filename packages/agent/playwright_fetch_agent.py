"""
Playwright / browser-use fetch agent — DISABLED.

Browser-use and Playwright have been replaced by JobSpy and Bright Data.
This module is kept as a stub so existing imports do not break.
Use method='jobspy' or method='brightdata_linkedin' in search_config instead.
"""

from typing import Optional


def run_playwright_fetch(
    portal_id: int,
    portal_name: str,
    jobs_url: str,
    login_url: Optional[str],
    username: Optional[str],
    password: Optional[str],
    totp_secret: Optional[str],
    session_state_json: Optional[str],
    llm_provider: str,
    llm_model: str,
    llm_api_key: str,
    target_role: str,
    limit: int = 50,
) -> dict:
    """Disabled stub — browser-use/Playwright has been removed.

    Returns an empty result. Update the portal's search_config to use
    method='jobspy' or method='brightdata_linkedin' instead.
    """
    print(
        f"[playwright-agent] DISABLED — {portal_name} returned 0 jobs. "
        "Set search_config.method to 'jobspy' or 'brightdata_linkedin'.",
        flush=True,
    )
    return {"jobs": [], "session_state": ""}
