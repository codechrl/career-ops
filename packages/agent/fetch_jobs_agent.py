"""
Job fetching agent — fetches job listings from portals based on their search_config.
Supports: json_api, rss_feed, html_scrape.
Skips: playwright, ats, unsupported, unknown.
"""

import re
import urllib.parse
import xml.etree.ElementTree as ET
from typing import Optional

from lxml import etree as lxml_etree

import requests
from bs4 import BeautifulSoup

UA = "Mozilla/5.0 (career-ops/1.0; +https://github.com/career-ops)"
HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/json,application/xml,application/rss+xml,*/*;q=0.8",
}
TIMEOUT = 20
SKIP_METHODS = {"unknown", "unsupported", "playwright", "ats"}


# ── URL builder ───────────────────────────────────────────────────────────────

def _build_url(url_template: str, target_role: str) -> str:
    role = target_role.strip()
    query = urllib.parse.quote_plus(role)
    words = role.lower().split()
    tag = words[0] if words else "engineer"
    slug = re.sub(r"\s+", "-", role.lower())
    category = words[0] if words else "engineer"
    url = url_template
    url = url.replace("{query}", query)
    url = url.replace("{tag}", tag)
    url = url.replace("{slug}", slug)
    url = url.replace("{category}", category)
    return url


# ── HTTP helper ───────────────────────────────────────────────────────────────

def _safe_get(url: str) -> Optional[requests.Response]:
    try:
        res = requests.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
        if res.ok:
            return res
        print(f"[fetch-jobs] HTTP {res.status_code} for {url}", flush=True)
        return None
    except Exception as e:
        print(f"[fetch-jobs] GET {url} failed: {e}", flush=True)
        return None


# ── JSON API ──────────────────────────────────────────────────────────────────

def _extract_json_jobs(data, portal_name: str, careers_url: str) -> list[dict]:
    jobs_raw = []
    if isinstance(data, list):
        jobs_raw = data
    elif isinstance(data, dict):
        # Try top-level arrays
        for key in ("jobs", "results", "hits", "data", "items", "listings", "postings"):
            if isinstance(data.get(key), list):
                jobs_raw = data[key]
                break
        # Algolia: {hits: {hits: [...]}}
        if not jobs_raw:
            hits = data.get("hits")
            if isinstance(hits, dict):
                for k2 in ("hits", "results"):
                    if isinstance(hits.get(k2), list):
                        jobs_raw = hits[k2]
                        break

    result = []
    for j in jobs_raw[:50]:
        if not isinstance(j, dict):
            continue
        # Handle Algolia _source wrapper
        src = j.get("_source", j)

        title = (src.get("title") or src.get("position") or src.get("job_title") or
                 src.get("jobTitle") or src.get("name") or "")
        if not title:
            continue

        url = (src.get("url") or src.get("link") or src.get("absolute_url") or
               src.get("job_url") or src.get("jobUrl") or src.get("apply_url") or "")
        if not url:
            slug = src.get("slug") or src.get("id")
            if slug:
                url = f"{careers_url.rstrip('/')}/{slug}"

        company = (src.get("company") or src.get("company_name") or src.get("companyName") or
                   src.get("employer") or src.get("organization") or portal_name)
        if isinstance(company, dict):
            company = company.get("name") or portal_name

        desc = (src.get("description") or src.get("jd_text") or src.get("body") or
                src.get("content") or src.get("text") or src.get("summary") or "")
        if isinstance(desc, str) and desc.strip():
            desc = BeautifulSoup(desc, "html.parser").get_text(" ", strip=True)[:5000]
        else:
            desc = ""

        result.append({
            "title": str(title).strip(),
            "url": str(url).strip(),
            "company": str(company).strip() if company else portal_name,
            "jd_text": desc,
        })

    return [j for j in result if j["title"] and j["url"]]


def _fetch_json_api(url: str, portal_name: str, careers_url: str) -> list[dict]:
    res = _safe_get(url)
    if not res:
        return []
    try:
        return _extract_json_jobs(res.json(), portal_name, careers_url)
    except Exception as e:
        print(f"[fetch-jobs] json_api parse error {url}: {e}", flush=True)
        return []


# ── RSS feed ──────────────────────────────────────────────────────────────────

def _fetch_rss(url: str, portal_name: str) -> list[dict]:
    res = _safe_get(url)
    if not res:
        return []
    try:
        # Strip namespace declarations and prefixes so ET doesn't choke on unbound prefixes
        content = res.text
        content = re.sub(r' xmlns(?::\w+)?="[^"]*"', "", content)
        content = re.sub(r'<(/?)\w+:(\w[\w.-]*)', r'<\1\2', content)
        raw = content.encode("utf-8", errors="replace")
        try:
            root = ET.fromstring(raw)
        except ET.ParseError:
            # Further malformed XML (unescaped &, invalid tokens, etc.) — use lxml with recovery
            parser = lxml_etree.XMLParser(recover=True, ns_clean=True, encoding="utf-8")
            lroot = lxml_etree.fromstring(raw, parser=parser)
            root = ET.fromstring(lxml_etree.tostring(lroot))
        items = root.findall(".//item") or root.findall(".//entry")
        result = []
        for item in items[:50]:
            def txt(tag: str) -> str:
                el = item.find(tag)
                if el is None:
                    return ""
                return re.sub(r"<!\[CDATA\[|\]\]>", "", el.text or "").strip()

            title = txt("title")
            if not title:
                continue
            link = txt("link") or txt("url") or txt("guid")
            if not link:
                el = item.find("link")
                link = (el.get("href") or "") if el is not None else ""
            if not link:
                continue

            company = txt("author") or txt("company") or txt("source") or portal_name
            desc = txt("description") or txt("summary") or txt("content")
            if desc:
                desc = BeautifulSoup(desc, "html.parser").get_text(" ", strip=True)[:5000]
            result.append({"title": title, "url": link, "company": company, "jd_text": desc or ""})
        return [j for j in result if j["title"] and j["url"]]
    except Exception as e:
        print(f"[fetch-jobs] rss_feed parse error {url}: {e}", flush=True)
        return []


# ── HTML scrape ───────────────────────────────────────────────────────────────

JOB_PATTERN = re.compile(
    r"job|position|role|career|vacancy|opening|engineer|developer|manager|analyst|scientist",
    re.I,
)


def _fetch_html_scrape(url: str, portal_name: str) -> list[dict]:
    res = _safe_get(url)
    if not res:
        return []
    try:
        soup = BeautifulSoup(res.text, "lxml")
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()

        parsed_base = urllib.parse.urlparse(url)
        base = f"{parsed_base.scheme}://{parsed_base.netloc}"

        jobs = []
        seen: set[str] = set()

        for a in soup.find_all("a", href=True)[:300]:
            href = a["href"]
            text = a.get_text(" ", strip=True)
            if len(text) < 5 or len(text) > 200:
                continue
            if not JOB_PATTERN.search(text):
                continue
            if href.startswith("/"):
                href = base + href
            elif not href.startswith("http"):
                continue
            if href in seen:
                continue
            seen.add(href)

            company = portal_name
            parent = a.parent
            if parent:
                for el in parent.find_all(string=True, recursive=False):
                    s = el.strip()
                    if s and s != text and 3 < len(s) < 100:
                        company = s
                        break

            jobs.append({"title": text, "url": href, "company": company, "jd_text": ""})
            if len(jobs) >= 40:
                break

        return jobs
    except Exception as e:
        print(f"[fetch-jobs] html_scrape error {url}: {e}", flush=True)
        return []


# ── Entry point ───────────────────────────────────────────────────────────────

def run_fetch_jobs(
    portal_provider: str,
    portal_name: str,
    careers_url: str,
    search_config: dict,
    target_role: str,
    limit: int = 50,
) -> list[dict]:
    method = (search_config.get("method") or "html_scrape").lower()
    url_template = (search_config.get("url_template") or "").strip()

    print(f"[fetch-jobs] {portal_name} method={method}", flush=True)

    if method in SKIP_METHODS:
        print(f"[fetch-jobs] {portal_name} skipped (method={method})", flush=True)
        return []

    if not url_template:
        print(f"[fetch-jobs] {portal_name} skipped (no url_template)", flush=True)
        return []

    url = _build_url(url_template, target_role)
    print(f"[fetch-jobs] {portal_name} fetching {url}", flush=True)

    if method == "json_api":
        jobs = _fetch_json_api(url, portal_name, careers_url)
    elif method == "rss_feed":
        jobs = _fetch_rss(url, portal_name)
    else:
        jobs = _fetch_html_scrape(url, portal_name)

    print(f"[fetch-jobs] {portal_name} → {len(jobs)} jobs", flush=True)
    return jobs[:limit]
