# ARCHITECTURE.md — SDET Multi-Agent Pipeline

> **Auto-maintained by Claude Code.** Updated automatically after every session.
> Last updated: 2026-05-05
> Current session: Session 21 — Pipeline Reorder + UI Fixes: write_jira moved to Phase 1 end with review_jira gate; WriteJiraPanel; platform selector segmented control; ASS→NOTE wording; stepper square badge redesign

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
| `fetch_ticket` | `graph/nodes/fetch_ticket.py` | `[x]` | JIRA REST API v3; ADF→text; AC extraction; retry+log |
| `requirements_analysis` | `graph/nodes/requirements_analysis.py` | `[x]` | provider=claude; prompts.SYSTEM/USER_TEMPLATE; RequirementsOutput; retry+log |
| ⏸ `review_requirements` | `interrupt_before=["generate_hls"]` | `[x]` | Gate 1 |
| `generate_hls` | `graph/nodes/generate_hls.py` | `[x]` | provider=grok; prompts.SYSTEM/USER_TEMPLATE; diff-aware; HLS-EXP system rule; retry+log |
| ⏸ `review_hls` | `interrupt_before=["generate_tcs"]` | `[x]` | Gate 2 |
| `generate_tcs` | `graph/nodes/generate_tcs.py` | `[x]` | provider=grok; prompts.SYSTEM/USER_TEMPLATE; diff-aware; hls_id validation; retry+log |
| ⏸ `review_tcs` | `interrupt_before=["coverage_validation"]` | `[x]` | Gate 3 |
| `coverage_validation` | `graph/nodes/coverage_validation.py` | `[x]` | pure Python; all 10 coverage fields; phase2_unlocked gate; HLS-EXP exempt; log |
| _(view-only)_ `review_coverage` | auto-approved via `outputKey="coverage_report"` | `[x]` | No active interrupt — coverage step auto-marks done; still browsable via VIEWABLE_GATES |
| ⏸ `review_jira` | `interrupt_before=["classify_tcs"]` via `write_jira` | `[x]` | Gate 4 (Phase 1 end) — JIRA sub-tasks preview; blocks Phase 2 if phase2_unlocked is false |
| `write_jira` | `graph/nodes/write_jira.py` | `[x]` | Phase 1 end; idempotent; ADF table; search/create/update subtask; link REQs; parent QA Status; log |

### Phase 2 — Execution & Reporting

| Node | File | Status | Notes |
|------|------|--------|-------|
| `classify_tcs` | `graph/nodes/classify_tcs.py` | `[x]` | provider=state.provider; ClassificationOutput; model_router; feedback; retry+log |
| ⏸ `review_classifications` | `interrupt_before=["test_data_planning"]` | `[x]` | Gate 5 |
| `test_data_planning` | `graph/nodes/test_data_planning.py` | `[x]` | provider=state.provider; TestDataOutput; sensitive enforcement; model_router; feedback; retry+log |
| `generate_scripts` | `graph/nodes/generate_scripts_node.py` | `[~]` | LLM + GitHub MCP; .spec.ts per TC |
| ⏸ `review_scripts` | `interrupt_before=["generate_scripts"]` | `[x]` | Gate 6 |
| `playwright_execution` | `graph/nodes/playwright_execution.py` | `[x]` | Workflow A: Claude LLM → .spec.ts + GitHub commit; Workflow B: Playwright WS execution + S3 artifact upload |
| `hybrid_execution` | `graph/nodes/hybrid_execution.py` | `[x]` | LLM confidence pass; single interrupt() for all pending_manual TCs; merges into execution_results |
| `report_generation` | `graph/nodes/report_generation.py` | `[x]` | provider=state.provider; ReportOutput; RCA per failed TC; presigned S3 URLs; retry_key=report_retry_count max=2; log |
| ⏸ `review_report` | `interrupt_before=["commit_github"]` | `[x]` | Gate 7 — branched reject |
| `commit_github` | `graph/nodes/commit_github.py` | `[x]` | open PR or update body only; markdown TC table + coverage %; stores pr_url in report; log |
| `send_email` | `graph/nodes/send_email.py` | `[x]` | SendGrid REST; HTML template; NOTIFICATION_EMAILS; no LLM; log |

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
    review_jira:            Optional[dict]
    review_classifications: Optional[dict]
    review_scripts:         Optional[dict]
    review_report:          Optional[dict]
    # Phase 2 outputs
    test_data_requirements: Optional[List[dict]]
    tc_classifications:     Optional[List[dict]]
    generated_scripts:      Optional[List[dict]]
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
    feedback_injected:      Optional[Dict[str, str]]
    node_providers:         Optional[Dict[str, str]]
    skip_steps:             Optional[List[str]]
```

---

## API Endpoints

> Updated automatically when `api/main.py` changes.

| Method | Path | Purpose | Status |
|--------|------|---------|--------|
| `POST` | `/runs/start` | Start pipeline; stream until first interrupt | `[x]` |
| `POST` | `/runs/{id}/resume` | Approve or reject a gate; resume graph | `[x]` |
| `GET`  | `/runs/{id}/state` | Full AgentState snapshot (sensitive masked) | `[x]` |
| `GET`  | `/runs/{id}/coverage` | Return `coverage_report` only | `[x]` |
| `GET`  | `/health` | asyncpg SELECT 1 + graph loaded check | `[x]` |
| `DELETE` | `/runs/{id}` | Cancel run; remove from PENDING_GATES | `[x]` |
| `GET`  | `/feedback/patterns` | Aggregate approval rate, rejection reasons, field counts | `[x]` |
| `GET`  | `/feedback/runs/{id}` | All feedback rows for a run, grouped by node | `[x]` |
| `GET`  | `/runs/{id}/pending-gates` | Gate name + seconds_remaining for a waiting run | `[x]` |
| `POST` | `/runs/{id}/test-data` | Submit manual field values; validates non-empty; masks sensitive in response | `[x]` |

---

## External Integrations

| Service | How | Config | Status |
|---------|-----|--------|--------|
| JIRA | JIRA MCP Server (`mcp-atlassian` via `uvx`) | `mcp-config.json` | `[x]` |
| Playwright | Playwright MCP | `mcp-config.json` | `[ ]` |
| GitHub | GitHub MCP | `mcp-config.json` | `[ ]` |
| Anthropic | `anthropic` SDK | `ANTHROPIC_API_KEY` | `[x]` |
| Grok (xAI) | `openai` SDK (compat) | `GROK_API_KEY` | `[x]` |
| SendGrid | REST API | `SENDGRID_API_KEY` | `[ ]` |
| LangSmith | env vars | `LANGCHAIN_API_KEY` | `[x]` |
| PostgreSQL | `asyncpg` + LangGraph checkpointer | `DATABASE_URL` | `[x]` |
| Feedback DB | `feedback_log` table via `asyncpg` | `DATABASE_URL` | `[x]` |
| S3 / MinIO | `boto3` via `scripts/s3_upload.py` | `S3_ENDPOINT_URL` + keys | `[x]` |

---

## Infrastructure

| Component | Tool | Config File | Status |
|-----------|------|-------------|--------|
| Local DB | PostgreSQL 16 (Docker) | `docker-compose.yml` | `[x]` |
| Local blob store | MinIO (Docker) | `docker-compose.yml` | `[x]` |
| Browser automation | Playwright v1.44 (Docker) | `docker-compose.yml` | `[x]` |
| Next.js UI | Next.js 16 + Tailwind v4 + React 19 | `ui/` | `[x]` |
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
| Per-node provider selection | `get_node_provider()` priority chain: `node_providers[node]` → `state.provider` → `"groq"`. Stored in `AgentState.node_providers`; safe-merged on resume to skip completed nodes |
| UI design system — deep space | `#060b14` base, `#0f1829` cards, `rgba(255,255,255,0.06)` borders, teal `#14b8a6` / purple `#8b5cf6`; fixed 44px header, 220px sidebar, activity log drawer |
| Single-phase stepper | Sidebar shows only the current phase (1 or 2); phase derived from state; animates on transition; 48px items; progress bar; completed steps clickable for read-only browse |
| Read-only gate navigation | `viewingGate` state in page.tsx; clicking a completed step sets viewingGate; VIEW ONLY badge + Back button in header; GateActionBar hidden while browsing |
| Provider selector in action bar | Moved from per-step sidebar pills to GateActionBar; shown only for AI-powered gates; per-node provider selection preserved |
| Gate action bar — expand-above reject | Reject panel renders above (not replacing) the 64px action row; labeled approve buttons per gate type |
| write_jira at Phase 1 end | Moved from Phase 2 tail to immediately after coverage_validation; review_jira gate shows JIRA sub-tasks preview before Phase 2 unlocks; phase2_unlocked guard shifted from review_coverage to review_jira |
| Platform selector — segmented control | Replaced 2-column icon card grid with inline flex segmented tabs; colored 8px dots (Jira #2684FF / Azure #0078D4); Azure tab opacity 0.4 + pointer-events none (not yet connected) |
| Stepper square badge system | All circular step indicators replaced with 28×28 square badges (border-radius 6); border-pulse / border-pulse-purple CSS animations on ACTIVE steps; phase tabs with independent locked/unlocked state |

---

_This file is auto-maintained. Do not edit manually — run `/architecture` in Claude Code to regenerate._
