"""
Scan job evaluation agent — batch LLM scoring for job listings.
Uses litellm directly (no CrewAI loop needed; this is a one-shot structured task).
"""

import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import litellm

litellm.telemetry = False
litellm.suppress_debug_info = True


# ── LLM kwargs factory ────────────────────────────────────────────────────────

def _model_kwargs(provider: str, model: str, api_key: str) -> dict:
    p = provider.lower()
    if p == "deepseek":
        return dict(
            model=f"deepseek/{model or 'deepseek-chat'}",
            api_key=api_key,
            api_base="https://api.deepseek.com/v1",
        )
    if p == "openrouter":
        return dict(model=f"openrouter/{model or 'anthropic/claude-3-5-sonnet-20241022'}", api_key=api_key)
    if p == "openai":
        return dict(model=model or "gpt-4o-mini", api_key=api_key)
    if p == "anthropic":
        return dict(model=f"anthropic/{model or 'claude-3-5-haiku-20241022'}", api_key=api_key)
    if p == "gemini":
        return dict(model=f"gemini/{model or 'gemini-1.5-flash'}", api_key=api_key)
    return dict(model=model, api_key=api_key)


# ── Prompt builder ────────────────────────────────────────────────────────────

def _build_system_prompt(target: dict) -> tuple[str, list[str]]:
    """Returns (system_prompt, pref_items)."""
    target_role = target.get("target_role", "")
    industries = target.get("industries", "") or ""
    location = target.get("target_location", "") or ""
    prefs = target.get("metrics", "") or ""
    has_industry = bool(industries)
    has_location = bool(location)
    pref_items = [p.strip() for p in re.split(r"[,;\n]+", prefs) if p.strip()] if prefs else []
    pref_schema = {p: 0 for p in pref_items}

    schema = {
        "role_score": 0,
        "industry_score": 0,
        "location_score": 0,
        "preference_score": 0,
        "preference_scores": pref_schema,
        "recommendation": "",
        "recommendation_reason": "",
        "next_action": "",
        "next_action_detail": "",
    }

    industry_rule = (
        f'Score 0-100. Required: "{industries}"\n  90-100: exact match | 60-89: adjacent industry | 0-29: unrelated'
        if has_industry else "Set to 0. No industry requirement specified."
    )
    location_rule = (
        f'Score 0-100. Required: "{location}"\n'
        "  Rules (be strict about geography):\n"
        "  - Regions are SPECIFIC: Asia ≠ Latin America ≠ Europe ≠ USA\n"
        "  - Wrong country on-site → 0-10 | Worldwide remote → 60-75"
        if has_location else "Set to 0. No location requirement specified."
    )
    pref_rule = (
        "Aggregate 0-100 for ALL preferences. Strict: 80+ only if clearly met."
        if pref_items else "Set to 0. No preferences specified."
    )
    pref_lines = (
        "\n".join(f'  - "{p}"' for p in pref_items)
        if pref_items else "  (none — return {})"
    )

    prompt = f"""You are a strict job-match scorer AND application advisor. Score 0-100 integers only. Be honest and critical.

Candidate criteria:
  Target Role: {target_role}
  Required Industries: {industries or '(none)'}
  Required Location: {location or '(none)'}
  Preferences: {prefs or '(none)'}

SCORING RULES:

role_score — ALWAYS score. How well does the job title/duties match the target role?
  90-100: near-identical | 60-89: significant overlap | 30-59: tangential | 0-29: unrelated

industry_score — {industry_rule}

location_score — {location_rule}

preference_score — {pref_rule}

preference_scores — Score each preference individually (0-100):
{pref_lines}
  90-100 = clearly met | 60-89 = partially | 0-29 = not met. Return {{}} if no preferences.

RECOMMENDATION:
recommendation — Choose ONE: "Strong Apply" | "Apply" | "Research more" | "Skip"
recommendation_reason — One sentence explaining the verdict.

NEXT ACTION:
next_action — Choose ONE: "Apply online" | "Email" | "LinkedIn DM" | "Company website" | "Reach out"
next_action_detail — The specific URL, email, or instruction extracted from the posting. Empty string if not found.

Return ONLY a valid JSON object — no explanation, no markdown. Schema:
{json.dumps(schema, indent=2)}"""

    return prompt, pref_items


# ── JSON parser ───────────────────────────────────────────────────────────────

def _parse_response(raw: str) -> dict | None:
    cleaned = re.sub(r"^\s*```(?:json)?\s*", "", raw).strip()
    cleaned = re.sub(r"\s*```\s*$", "", cleaned).strip()
    start = cleaned.find("{")
    if start != -1:
        try:
            obj, _ = json.JSONDecoder().raw_decode(cleaned, start)
            if isinstance(obj, dict) and "role_score" in obj:
                return obj
        except Exception:
            pass
    return None


# ── Single-job evaluator ──────────────────────────────────────────────────────

def evaluate_one(job: dict, system_prompt: str, mkwargs: dict) -> dict:
    snippet = (job.get("jd_text") or f"Title: {job['title']}\nCompany: {job.get('company', '')}")[:2000]
    tag = f"[scan:{job.get('title', '')[:35]}]"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Job posting:\nTitle: {job.get('title','')}\nCompany: {job.get('company','')}\n\n{snippet}"},
    ]

    for attempt in range(3):
        try:
            resp = litellm.completion(messages=messages, temperature=0.1, **mkwargs)
            raw = resp.choices[0].message.content or ""
            result = _parse_response(raw)
            if result:
                print(
                    f"{tag} scored: role={result.get('role_score')} "
                    f"rec={result.get('recommendation')}",
                    flush=True,
                )
                return result
            # Bad parse — ask LLM to retry
            if attempt < 2:
                messages.append({"role": "assistant", "content": raw})
                messages.append({"role": "user", "content": "Return ONLY a valid JSON object matching the schema above. No other text."})
        except Exception as e:
            print(f"{tag} attempt {attempt + 1} error: {e}", flush=True)
            if attempt == 2:
                break

    return {
        "role_score": 0, "industry_score": 0, "location_score": 0,
        "preference_score": 0, "preference_scores": {},
        "recommendation": "Research more", "recommendation_reason": "Evaluation failed.",
        "next_action": "Reach out", "next_action_detail": "",
    }


# ── Batch entry point ─────────────────────────────────────────────────────────

def run_batch_evaluate(
    jobs: list[dict],
    target: dict,
    llm_provider: str,
    llm_model: str,
    llm_api_key: str,
    concurrency: int = 3,
) -> list[dict]:
    mkwargs = _model_kwargs(llm_provider, llm_model, llm_api_key)
    system_prompt, pref_items = _build_system_prompt(target)
    has_industry = bool(target.get("industries"))
    has_location = bool(target.get("target_location"))

    print(
        f"[scan:evaluate] batch of {len(jobs)} jobs, target={target.get('target_role')}, "
        f"concurrency={concurrency}",
        flush=True,
    )

    results: list[Any] = [None] * len(jobs)

    def worker(idx_job: tuple[int, dict]) -> None:
        idx, job = idx_job
        try:
            scores = evaluate_one(job, system_prompt, mkwargs)
            # Compute overall score server-side (weighted average of active dimensions)
            dims = [{"v": scores.get("role_score", 0), "w": 35}]
            if has_industry:
                dims.append({"v": scores.get("industry_score", 0), "w": 25})
            if has_location:
                dims.append({"v": scores.get("location_score", 0), "w": 20})
            if pref_items:
                dims.append({"v": scores.get("preference_score", 0), "w": 20})
            w_total = sum(d["w"] for d in dims)
            scores["overall_score"] = round(sum(d["v"] * d["w"] / w_total for d in dims))
            if not has_industry:
                scores["industry_score"] = 0
            if not has_location:
                scores["location_score"] = 0
            results[idx] = {"url": job.get("url", ""), "scores": scores}
        except Exception as e:
            print(f"[scan:evaluate] job {idx} failed: {e}", flush=True)
            results[idx] = {
                "url": job.get("url", ""),
                "scores": {
                    "role_score": 0, "industry_score": 0, "location_score": 0,
                    "preference_score": 0, "overall_score": 0, "preference_scores": {},
                    "recommendation": "Research more", "recommendation_reason": "Evaluation failed.",
                    "next_action": "Reach out", "next_action_detail": "",
                },
            }

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = {executor.submit(worker, item): item[0] for item in enumerate(jobs)}
        for future in as_completed(futures):
            future.result()  # propagate unexpected exceptions to surface them

    return [r for r in results if r is not None]
