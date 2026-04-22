# SDET Multi-Agent Pipeline

An AI-powered pipeline that takes a JIRA ticket from requirements analysis through test case generation, classification, automated execution, and reporting — with human-in-the-loop review gates at each phase.

## Architecture

```
JIRA Ticket → Requirements Analysis → HLS → Test Cases → Coverage Check
                                                                ↓
                                              Classification → Test Data
                                                                ↓
                                         Playwright Execution / Hybrid
                                                                ↓
                                           Report → JIRA + GitHub + Email
```

## Getting Started in 3 Commands

```bash
cp .env.example .env   # fill in your keys
docker compose up -d
poetry install && poetry run python scripts/seed_db.py
```

## Prerequisites

- Python 3.12+
- Poetry (`pip install poetry`)
- Docker Desktop (running)
- Node.js 20+ (for the UI in Session 9)

## Services

| Service | Port | Purpose |
|---------|------|---------|
| FastAPI | 8000 | REST API for pipeline control |
| PostgreSQL | 5432 | State persistence (LangGraph checkpointer) |
| MinIO | 9000 / 9001 | S3-compatible artifact storage |
| Playwright | 9323 | Browser automation MCP server |
| Next.js UI | 3000 | Dashboard (added Session 9) |

## Environment Variables

Copy `.env.example` to `.env` and fill in:

- `ANTHROPIC_API_KEY` — [console.anthropic.com](https://console.anthropic.com)
- `JIRA_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` — Atlassian account settings
- `GITHUB_PERSONAL_ACCESS_TOKEN` — repo + PR scopes
- `SENDGRID_API_KEY` — sendgrid.com (verified sender required)
- `LANGCHAIN_API_KEY` — [smith.langchain.com](https://smith.langchain.com)

## Development

```bash
# Run API server
poetry run uvicorn api.main:app --reload --port 8000

# Run tests
poetry run pytest tests/

# View MinIO console
open http://localhost:9001   # user: minioadmin / pass: minioadmin
```
