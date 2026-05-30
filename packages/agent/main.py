from typing import Optional, List

import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel

from discovery_agent import run_discovery_agent
from scan_agent import run_batch_evaluate
from fetch_jobs_agent import run_fetch_jobs
from playwright_fetch_agent import run_playwright_fetch

app = FastAPI(title="career-ops agent service")


class LLMConfig(BaseModel):
    provider: str
    model: str
    api_key: str


class DiscoverRequest(BaseModel):
    portal_id: int
    portal_name: str
    portal_provider: str
    careers_url: str
    llm: LLMConfig
    serpapi_key: Optional[str] = None


# ── Scan evaluate models ─────────────────────────────────────────────────────

class EvaluateJob(BaseModel):
    title: str
    company: str = ""
    url: str = ""
    jd_text: str = ""


class EvaluateTarget(BaseModel):
    target_role: str
    industries: str = ""
    target_location: str = ""
    metrics: str = ""


class EvaluateBatchRequest(BaseModel):
    jobs: List[EvaluateJob]
    target: EvaluateTarget
    llm: LLMConfig
    concurrency: int = 3


# ── Fetch jobs models ─────────────────────────────────────────────────────────

class FetchJobsRequest(BaseModel):
    portal_provider: str
    portal_name: str
    careers_url: str
    search_config: dict
    target_role: str
    limit: int = 50


# ── Playwright fetch models ───────────────────────────────────────────────────

class PlaywrightCredentials(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    totp_secret: Optional[str] = None
    login_url: Optional[str] = None


class PlaywrightFetchRequest(BaseModel):
    portal_id: int
    portal_name: str
    jobs_url: str
    login_url: Optional[str] = None
    credentials: PlaywrightCredentials = PlaywrightCredentials()
    session_state: Optional[str] = None
    target_role: str
    limit: int = 50
    llm: LLMConfig


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"ok": True}


@app.post("/discover")
def discover(req: DiscoverRequest):
    result = run_discovery_agent(
        portal_id=req.portal_id,
        portal_name=req.portal_name,
        portal_provider=req.portal_provider,
        careers_url=req.careers_url,
        llm_provider=req.llm.provider,
        llm_model=req.llm.model,
        llm_api_key=req.llm.api_key,
        serpapi_key=req.serpapi_key,
    )
    return result


@app.post("/evaluate")
def evaluate(req: EvaluateBatchRequest):
    results = run_batch_evaluate(
        jobs=[j.model_dump() for j in req.jobs],
        target=req.target.model_dump(),
        llm_provider=req.llm.provider,
        llm_model=req.llm.model,
        llm_api_key=req.llm.api_key,
        concurrency=req.concurrency,
    )
    return {"results": results}


@app.post("/fetch-jobs")
def fetch_jobs(req: FetchJobsRequest):
    jobs = run_fetch_jobs(
        portal_provider=req.portal_provider,
        portal_name=req.portal_name,
        careers_url=req.careers_url,
        search_config=req.search_config,
        target_role=req.target_role,
        limit=req.limit,
    )
    return {"jobs": jobs}


@app.post("/fetch-jobs-browser")
def fetch_jobs_browser(req: PlaywrightFetchRequest):
    """Disabled — browser-use/Playwright has been removed.

    Returns an empty job list. Update the portal's search_config.method to
    'jobspy' or 'brightdata_linkedin' and use /fetch-jobs instead.
    """
    print(
        f"[main] /fetch-jobs-browser called for {req.portal_name} — "
        "Playwright is DISABLED. Returning empty result.",
        flush=True,
    )
    return {"jobs": [], "session_state": ""}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
