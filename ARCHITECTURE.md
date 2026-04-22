# ARCHITECTURE.md — SDET Multi-Agent Pipeline

> **Auto-maintained by Claude Code.** Updated automatically after every session.
> Last updated: 2026-04-22
> Current session: Session 3 — AgentState + Graph Builder (complete)

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Next.js 14 UI                           │
│   Input · Vertical Stepper · Gate Actions · Activity Log        │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTP (fetch → /api proxy → :8000)
┌────────────────────▼────────────────────────────────────────────┐
│                       FastAPI  :8000                            │
│   /runs/start  /runs/{id}/resume  /runs/{id}/state              │
└────────────────────┬────────────────────────────────────────────┘
                     │ ainvoke / get_state / update_state
┌────────────────────▼────────────────────────────────────────────┐
│                     LangGraph StateGraph                        │
│                  (compiled with PostgresSaver)                  │
└──┬──────────┬──────────┬──────────┬──────────┬─────────────────┘
   │          │          │          │          │
   ▼          ▼          ▼          ▼          ▼
JIRA MCP  Playwright  GitHub    SendGrid   Anthropic /
          MCP         MCP       API        xAI (Grok)
```

---

## Graph Nodes

> Status key: `[ ]` not built · `[~]` stubbed · `[x]` complete

### Phase 1 — Requirements → Test Design

| Node | File | Status | Notes |
|------|------|--------|-------|
| `fetch_ticket` | `graph/nodes/fetch_ticket.py` | `[~]` | JIRA MCP read |
| `requirements_analysis` | `graph/nodes/requirements_analysis.py` | `[~]` | LLM → REQ-001… |
| ⏸ `review_requirements` | `interrupt_before=["generate_hls"]` | `[x]` | Gate 1 |
| `generate_hls` | `graph/nodes/generate_hls.py` | `[~]` | diff-aware |
| ⏸ `review_hls` | `interrupt_before=["generate_tcs"]` | `[x]` | Gate 2 |
| `generate_tcs` | `graph/nodes/generate_tcs.py` | `[~]` | diff-aware |
| ⏸ `review_tcs` | `interrupt_before=["coverage_validation"]` | `[x]` | Gate 3 |
| `coverage_validation` | `graph/nodes/coverage_validation.py` | `[~]` | pure Python, no LLM |
| ⏸ `review_coverage` | `interrupt_before=["classify_tcs"]` | `[x]` | Gate 4 — blocks Phase 2 if < 90% |

### Phase 2 — Execution & Reporting

| Node | File | Status | Notes |
|------|------|--------|-------|
| `classify_tcs` | `graph/nodes/classify_tcs.py` | `[~]` | auto/manual/hybrid |
| ⏸ `review_classifications` | `interrupt_before=["test_data_planning"]` | `[x]` | Gate 5 |
| `test_data_planning` | `graph/nodes/test_data_planning.py` | `[~]` | classification-aware |
| `execution_router` | `graph/builder.py` (conditional edge fn) | `[~]` | stub: always returns "playwright" |
| `playwright_execution` | `graph/nodes/playwright_execution.py` | `[~]` | Playwright MCP + S3 |
| `hybrid_execution` | `graph/nodes/hybrid_execution.py` | `[~]` | agent + manual fallback |
| `report_generation` | `graph/nodes/report_generation.py` | `[~]` | RCA + traceability |
| ⏸ `review_report` | `interrupt_before=["write_jira"]` | `[x]` | Gate 6 — branched reject |
| `write_jira` | `graph/nodes/write_jira.py` | `[~]` | JIRA MCP write |
| `commit_github` | `graph/nodes/commit_github.py` | `[~]` | GitHub MCP + PR |
| `send_email` | `graph/nodes/send_email.py` | `[~]` | SendGrid |

---

## AgentState Fields

> Updated automatically when `graph/state.py` changes.

```python
class AgentState(TypedDict):
    # Meta
    ticket_id:              str
    provider:               Literal["claude", "grok"]
    run_id:                 str
    # Phase 1 outputs
    ticket_data:            Optional[dict]
    requirements_analysis:  Optional[dict]
    requirements:           Optional[str]
    hls_list:               Optional[List[dict]]
    tc_list:                Optional[List[dict]]
    coverage_report:        Optional[dict]
    # Human gate decisions
    review_requirements:    Optional[dict]
    review_hls:             Optional[dict]
    review_tcs:             Optional[dict]
    review_coverage:        Optional[dict]
    review_classifications: Optional[dict]
    review_report:          Optional[dict]
    # Phase 2 outputs
    test_data_requirements: Optional[List[dict]]
    tc_classifications:     Optional[List[dict]]
    scripts_written:        Optional[List[dict]]
    execution_results:      Optional[List[dict]]
    report:                 Optional[dict]
    # Retry counters (start at 0)
    req_retry_count:        int
    hls_retry_count:        int
    tc_retry_count:         int
    report_retry_count:     int
    # Internal flags
    changed_hls_ids:        Optional[List[str]]
    _auto_approved_reason:  Optional[str]
    error:                  Optional[str]
```

---

## API Endpoints

> Updated automatically when `api/main.py` changes.

| Method | Path | Purpose | Status |
|--------|------|---------|--------|
| — | — | _not yet implemented_ | `[ ]` |

---

## External Integrations

| Service | How | Config | Status |
|---------|-----|--------|--------|
| JIRA | JIRA MCP Server | `mcp-config.json` | `[ ]` |
| Playwright | Playwright MCP | `mcp-config.json` | `[ ]` |
| GitHub | GitHub MCP | `mcp-config.json` | `[ ]` |
| Anthropic | `anthropic` SDK | `ANTHROPIC_API_KEY` | `[ ]` |
| Grok (xAI) | `openai` SDK (compat) | `GROK_API_KEY` | `[ ]` |
| SendGrid | REST API | `SENDGRID_API_KEY` | `[ ]` |
| LangSmith | env vars | `LANGCHAIN_API_KEY` | `[x]` |
| PostgreSQL | `asyncpg` + LangGraph checkpointer | `DATABASE_URL` | `[x]` |
| S3 / MinIO | `boto3` | `S3_ENDPOINT_URL` + keys | `[ ]` |

---

## Infrastructure

| Component | Tool | Config File | Status |
|-----------|------|-------------|--------|
| Local DB | PostgreSQL 16 (Docker) | `docker-compose.yml` | `[x]` |
| Local blob store | MinIO (Docker) | `docker-compose.yml` | `[x]` |
| Browser automation | Playwright v1.44 (Docker) | `docker-compose.yml` | `[x]` |
| Reverse proxy (prod) | nginx | `docker-compose.prod.yml` | `[ ]` |
| CI | GitHub Actions | `.github/workflows/ci.yml` | `[ ]` |

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Classification before test data | Data fields must be mode-aware (env_var for auto, instruction for manual) |
| Diff-aware HLS/TC regeneration | Preserve human-approved content when only part of the graph changes |
| Provider abstraction layer | `run_agent(prompt, provider)` — both Claude and Grok return identical JSON shapes |
| MCP nodes always use Claude | Playwright/JIRA/GitHub MCP servers require Anthropic client — Grok has no MCP support |
| PostgreSQL checkpointer | Survives server restarts and browser refreshes — required for multi-day review cycles |
| HLS-EXP reserved ID | Exploratory TCs without a natural HLS link use this; exempt from coverage orphan rules |
| Branched report rejection | Reject report accuracy → regenerate report. Reject test failures → re-execute specific TCs |

---

_This file is auto-maintained. Do not edit manually — run `/architecture` in Claude Code to regenerate._
