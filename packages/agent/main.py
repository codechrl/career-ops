from typing import Optional, List

import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel

from discovery_agent import run_discovery_agent
from scan_agent import run_batch_evaluate
from fetch_jobs_agent import run_fetch_jobs

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


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
