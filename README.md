# Career-Ops (Web Fork)

> Forked from [santifer/career-ops](https://github.com/santifer/career-ops) — the original CLI-based AI job search pipeline.
> This fork replaces the CLI-first workflow with a self-hosted web GUI backed by Python AI agents, PostgreSQL, and a cron-driven scan pipeline.

<p align="center">
  <img src="https://img.shields.io/badge/Bun-000?style=flat&logo=bun&logoColor=white" alt="Bun">
  <img src="https://img.shields.io/badge/Python-3776AB?style=flat&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT">
</p>

---

## What Is This

Career-Ops is an AI-powered job search pipeline that runs as a self-hosted web application. You open a browser, configure your job targets and portal catalog, and let the system scan portals on a schedule — scoring every listing against your CV automatically.

- **Web GUI** — browser-based control panel, no CLI required
- **Python AI agents** — portal discovery, job fetching, and LLM evaluation all run in a dedicated FastAPI microservice (CrewAI + LiteLLM)
- **Automated portal catalog** — an AI agent inspects each portal's careers page and determines the best API method (JSON API, RSS, HTML scrape) to use for job fetching
- **Cron-scheduled scans** — configure a scan interval in the UI; the server fetches new listings and scores them automatically in the background
- **PostgreSQL persistence** — all portals, scan runs, listings, evaluations, and targets stored in a real database
- **Human-in-the-loop** — AI scores and filters, you decide what to pursue. The system never submits an application

> This is NOT a spray-and-pray tool. It's a filter. The goal is to surface the few listings worth your attention out of hundreds.

## What Changed from Upstream

The original career-ops is a CLI system built around Claude Code / Gemini CLI slash commands, with data stored in markdown tables and TSV files, and a Go TUI dashboard. This fork takes a different approach:

| Aspect | Upstream (santifer/career-ops) | This fork |
|--------|-------------------------------|-----------|
| Interface | Claude Code / Gemini CLI slash commands | Web GUI at `localhost:8080` |
| AI agents | Claude Code reads mode files, uses Playwright | Python FastAPI microservice (CrewAI + LiteLLM) |
| Portal fetching | Playwright browser automation + manual config | Python agent auto-discovers fetch method per portal |
| Job evaluation | LLM called inline by CLI agent | Dedicated `scan_agent.py` via HTTP |
| Data storage | Markdown tables + TSV files | PostgreSQL |
| Scheduler | Manual (`/career-ops scan`) | Cron-based, configurable from the UI |
| Deployment | Local Node.js install | Docker Compose (4 services) |
| Dashboard | Go TUI (`packages/dashboard`) | Web dashboard with sortable columns, pagination |

## Architecture

```
Browser (Vite SPA, port 8080)
        │  HTTP
        ▼
Bun/Express API server (port 3000)
        │                    │
        │  HTTP               │  node-cron
        ▼                    ▼
Python FastAPI agent     Scan scheduler
  (port 8000)             (scan-scheduler.mjs)
  ├── /discover            │
  │   discovery_agent.py   │  ScanWorkflow
  ├── /fetch-jobs          │  ├── Stage 1: fetchPortalJobs → Python /fetch-jobs
  │   fetch_jobs_agent.py  │  ├── Stage 2: fetch JD HTML per listing
  └── /evaluate            │  ├── Stage 3: evaluateBatch → Python /evaluate
      scan_agent.py        │  └── Stage 4: save listings + evaluations to DB
                           ▼
                      PostgreSQL
```

**Portal discovery flow** — when you run "Discover" on a portal, the Python discovery agent inspects the portal's careers page using CrewAI and determines:
- `method`: `json_api` / `rss_feed` / `html_scrape` / `playwright` / `ats` / `unsupported`
- `url_template`: the URL pattern with `{query}` / `{slug}` / `{tag}` placeholders
- `confidence`: how reliable the method is

Portals with a known method are automatically fetched by the Python `fetch_jobs_agent` on every scan run. Portals with `playwright`, `ats`, or `unsupported` methods are skipped.

## Quick Start

```bash
git clone <your-fork>
cd career-ops
cp config/profile.example.yml config/profile.yml   # edit with your details
docker compose up --build -d
```

Open http://localhost:8080.

On first run:
1. Go to Settings → LLM Keys and add your LLM provider API key (DeepSeek, OpenAI, Anthropic, etc.)
2. Go to Job Targeting → create a target role with your desired title and keywords
3. Go to Job Targeting → Portals tab → run Discovery on portals to populate their `search_config`
4. Go to Scan Schedule → set an interval (e.g. `6h`) to enable automatic scans
5. Or trigger a manual scan from the Dashboard

## Web UI Pages

| Page | What it does |
|------|--------------|
| Dashboard | Live listings feed — sortable, filterable table of all evaluated jobs with scores |
| Job Targeting | Manage job targets (role + keywords) and the portal catalog (CRUD + discovery) |
| Pipeline | URL inbox — paste a job URL to queue it, view pending and processed items. Also shows scan run history |
| Settings | LLM key management, CV upload, profile YAML, scan schedule |

## Scan Flow

Each scan run goes through four stages:

1. **Fetch** — for each enabled portal with a valid `search_config`, calls `POST /fetch-jobs` on the Python agent. The agent uses the portal's `method` (JSON API, RSS, or HTML scrape) to retrieve raw job listings.
2. **Scrape JD** — for each fetched listing, fetches the job detail page and extracts the job description text.
3. **Evaluate** — sends batches of `{jd, role, company}` to `POST /evaluate` on the Python agent, which uses LiteLLM to score fit against the stored CV summary and job target.
4. **Persist** — saves listings and evaluations to PostgreSQL. Duplicates (same URL) are skipped.

## Project Structure

```
career-ops/
├── docker-compose.yml            # 4 services: postgres, agent, server, web
├── Dockerfile.server             # Bun/Express API server
├── Dockerfile.web                # Vite SPA + Nginx
├── packages/
│   ├── agent/                    # Python AI microservice
│   │   ├── main.py               # FastAPI app — /health /discover /fetch-jobs /evaluate
│   │   ├── discovery_agent.py    # CrewAI portal discovery agent
│   │   ├── fetch_jobs_agent.py   # HTTP/RSS/HTML job fetching
│   │   ├── scan_agent.py         # LiteLLM job evaluation
│   │   └── requirements.txt
│   ├── server/                   # Bun/Express REST API
│   │   └── src/
│   │       ├── api/routes/       # auth, cv, portals, scan, listings, job-target, pipeline, ...
│   │       ├── services/         # scan-workflow, scan-scheduler, portal-catalog, portal-discovery-client, ...
│   │       ├── models/           # db models (llm-key, session, ...)
│   │       ├── llm/              # LLM provider abstraction
│   │       └── loaders/          # DB init, express setup, auth, scheduler boot
│   ├── web/                      # Vite vanilla-JS SPA
│   │   └── src/
│   │       ├── pages/            # dashboard, job (targeting + listings tab), pipeline, settings, login
│   │       ├── paginate.js       # shared pagination helper
│   │       └── api.js            # fetch wrapper with JWT auth
│   └── dashboard/                # Go TUI (retained from upstream, optional)
├── config/
│   └── profile.example.yml       # profile template
├── templates/
│   ├── cv-template.html          # ATS CV template
│   ├── portals.example.yml       # portal catalog template
│   └── states.yml                # canonical application statuses
├── modes/                        # upstream CLI mode files (retained for reference)
├── batch/                        # upstream batch runner (retained for reference)
├── docs/                         # architecture, setup, contributing docs
└── examples/                     # sample CV, report, proof points
```

## Tech Stack

- **Web** — Vite + vanilla JS SPA, served by Nginx
- **API server** — Bun runtime + Express.js, JWT auth, PostgreSQL via `pg`
- **AI agents** — Python 3, FastAPI, uvicorn, CrewAI 1.14, LiteLLM, requests, BeautifulSoup4
- **Scheduler** — node-cron inside the server process; configurable interval stored in DB
- **Database** — PostgreSQL 16
- **Deployment** — Docker Compose

## Supported Portal Fetch Methods

The Python `fetch_jobs_agent` supports three methods discovered automatically per portal:

| Method | How it works |
|--------|-------------|
| `json_api` | GET the portal's JSON jobs endpoint (Remotive, Himalayas, RemoteOK, AI-Jobs, etc.) |
| `rss_feed` | Parse RSS/Atom feed (Indeed, WeWorkRemotely, RemoteYeah, JobFluent, etc.) |
| `html_scrape` | BeautifulSoup link extraction from careers pages (RemoteRocketship, YC Jobs, etc.) |
| `playwright` / `ats` / `unsupported` | Skipped — require interactive browser or login |

URL templates support placeholders: `{query}` (URL-encoded role), `{slug}` (hyphenated), `{tag}` (first word), `{category}` (first word).

## Disclaimer

**career-ops is a self-hosted, open-source tool.** By using this software, you acknowledge:

1. **You control your data.** Your CV, contact info, and personal data stay on your infrastructure and are sent directly to the AI provider you configure. No data is collected externally.
2. **You control the AI.** The system never submits applications. AI evaluations are recommendations — always review before acting.
3. **You comply with third-party ToS.** Use this tool in accordance with the Terms of Service of the job portals you interact with. Do not use it to spam employers or overwhelm ATS systems.
4. **No guarantees.** AI models may hallucinate. Evaluations are not truth. The authors are not liable for employment outcomes or any other consequences.

See [docs/LEGAL_DISCLAIMER.md](docs/LEGAL_DISCLAIMER.md) for full details. Licensed under [MIT](LICENSE).

## Upstream Credits

This project is a fork of [santifer/career-ops](https://github.com/santifer/career-ops) by Santiago Fernández de Valderrama. The original modes, batch runner, templates, CV generation pipeline, and evaluation framework come from that project. See [docs/CONTRIBUTORS.md](docs/CONTRIBUTORS.md) for the full upstream contributor list.
