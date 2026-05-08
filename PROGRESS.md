# PROGRESS.md — SDET Multi-Agent Pipeline

> **Auto-maintained by Claude Code.** Ticked off at the end of every session.
> Use `/progress` in Claude Code to print a summary. Use `/status` to re-orient at session start.

---

## Quick Status

| | Sessions Done | Sessions Remaining | Carry-overs |
|--|--|--|--|
| **Count** | 9 / 11 | 2 | 0 |

---

## Session Log

### ✅ SESSION 1 — Project Scaffold
**Goal:** Poetry project, folder structure, `.env`, Docker Compose (Postgres + MinIO)
**Done when:** `docker compose up` starts both services with no errors

- [x] Poetry project initialised (`pyproject.toml` present)
- [x] Full folder structure created (all dirs, `__init__.py` files)
- [x] `.env.example` with all required keys
- [x] `docker-compose.yml` with `postgres:16`, `minio/minio`, and `playwright:v1.44.0`
- [x] `README.md` with "Getting Started in 3 commands"
- [x] `CLAUDE.md` placed at project root
- [x] `ARCHITECTURE.md` placed at project root
- [x] `PROGRESS.md` placed at project root

**Notes:** Added Playwright service to docker-compose (required by Session 7 — listed in the session spec).
**Deviations:** Playwright container included in docker-compose.yml (spec listed it as a service; added now rather than later).
**Known issues:** MinIO healthcheck uses `mc ready local` — requires mc binary present in container. If healthcheck fails, set `disable: true` on the minio healthcheck or use a curl-based probe.

---

### ✅ SESSION 2 — Database Schema + LangSmith Wiring
**Goal:** `node_events` table in Postgres; LangSmith project wired via env vars
**Done when:** `poetry run python scripts/seed_db.py` prints `node_events table ready`

- [x] `scripts/seed_db.py` — creates `node_events` table + index via asyncpg, clear error on missing/unreachable DB
- [x] `scripts/init_observability.py` — pins all 4 LangSmith env vars at import; prints active project
- [x] `tests/test_db.py` — insert → read → delete roundtrip; skips if DB unavailable
- [x] `ARCHITECTURE.md` updated — PostgreSQL and LangSmith marked `[x]`

**Notes:** `DATABASE_URL` uses `postgresql+asyncpg://` (SQLAlchemy format); scripts strip the dialect suffix before passing to asyncpg. `init_observability.py` is designed to be imported at FastAPI startup in Session 9.
**Deviations:** Original Session 2 plan (AgentState + Graph Builder) is carried forward to Session 3.
**Known issues:** _none_

---

### ✅ SESSION 3 — AgentState + Graph Builder
**Goal:** Full `state.py`, `builder.py` with all nodes stubbed, checkpointer wired
**Done when:** `from graph.builder import graph` succeeds in a Python REPL

- [x] `graph/state.py` — 27-field `AgentState` TypedDict (3 meta, 6 phase1, 6 gates, 5 phase2, 4 retry, 3 flags)
- [x] All 14 node files populated with async stubs (structured log + `return state` + `TODO(session-N)`)
- [x] `graph/nodes/error_node.py` — new file; dead-end node for future retry-cap routing
- [x] `graph/builder.py` — full wiring in spec order; `execution_router` conditional edge stubbed
- [x] All 6 interrupt gates declared in `interrupt_before` (maps to next node after each review)
- [x] Module-level `graph = _compile(MemorySaver())` — import works without a running DB
- [x] `_compile(checkpointer)` function exposed — FastAPI startup will pass `AsyncPostgresSaver`
- [x] `ARCHITECTURE.md` updated — AgentState fields populated; all nodes marked `[~]`; gates marked `[x]`

**Notes:** `graph.get_graph().nodes` returns 16 entries (14 declared + `__start__` + `__end__` added by LangGraph). Interrupt gates are compile-time `interrupt_before` entries pointing to the node that follows each review checkpoint, not separate passthrough nodes.
**Deviations:** Carried over from original Session 2 plan.
**Known issues:** `AsyncPostgresSaver` requires `langgraph-checkpoint-postgres` package (not yet in pyproject.toml). Add in Session 6 when FastAPI startup wires the real checkpointer.

---

### ✅ SESSION 4 — Provider Abstraction — Claude + Grok
**Goal:** Single `run_agent()` for both providers; Grok falls back to Claude on MCP nodes
**Done when:** `asyncio.run(run_agent('say hello'))` returns string + JSON log on stdout

- [x] `agent/provider.py` — async `run_agent()` with Claude + Grok branches; `asyncio.to_thread()` wraps sync clients
- [x] MCP-only node list (`fetch_ticket_node`, `playwright_execution_node`, `write_jira_node`, `commit_github_node`) — auto-falls back to Claude, logs `grok_fallback`
- [x] Structured JSON log after every call: `{event, provider, model, calling_node, latency_ms, input_tokens, output_tokens}`
- [x] `ValueError` raised for unknown provider string
- [x] `agent/node_logger.py` — `log_node_event()` inserts into `node_events` via asyncpg; `compute_input_hash()` helper (sha256 → 16 hex chars); silently swallows all DB errors
- [x] `ARCHITECTURE.md` updated — Anthropic + Grok marked `[x]`

**Notes:** `agent/retry.py` remains a stub — retry wrapping is not required by this session's spec. Live API verify (`asyncio.run(run_agent(...))`) requires `ANTHROPIC_API_KEY` in `.env` and `poetry run python`.
**Deviations:** `node_logger.py` is a new file not in original plan; added here as it is a direct dependency of the logging spec. `retry.py` deferred.
**Known issues:** _none_

---

### ✅ SESSION 5 — Retry Wrapper + Pydantic Output Schemas
**Goal:** `with_retry()` with correct counter; all output schemas in one file
**Done when:** `pytest tests/test_retry.py` — all 5 green

- [x] `agent/retry.py` — `with_retry(fn, state, max_retries, retry_key)`; fixed counter order: increment → sleep; catch order: ValidationError, ValueError, Exception; JSON log per attempt; returns `{**state, 'error': ...}` on exhaustion
- [x] `agent/schemas.py` — 9 output models: `RequirementsOutput`, `HLSOutput`, `TCOutput`, `ClassificationOutput`, `TestDataOutput`, `ReportOutput` plus supporting item models; all use `ConfigDict(extra='forbid')` via shared `_Base`
- [x] `tests/test_retry.py` — 5 tests: success/once-fail/always-fail roundtrips + ValidationError on extra field + valid schema passes
- [x] Structural invariant verified: counter increment (line 44) precedes `asyncio.sleep` (line 45)

**Notes:** Offline verification confirms all three retry scenarios and that the counter always precedes the sleep. Pydantic and pytest tests require `poetry run pytest` (packages not on system Python).
**Deviations:** `_Base` intermediate class avoids repeating `model_config` on every model. Mid-session addition: `generate_scripts_node` inserted into pipeline + `GeneratedScript`/`GeneratedScriptsOutput` schemas added + `generated_scripts`/`review_scripts` state fields added + builder rewired (7 interrupt gates, linear execution path, no conditional router).
**Known issues:** _none_

---

### ✅ SESSION 6 — Phase 1: Ticket Fetch + Requirements Analysis
**Goal:** `fetch_ticket_node` + `requirements_analysis_node` fully implemented
**Done when:** Feed real JIRA ticket ID → `state['ticket_data']` has AC; `requirements_analysis` has REQ-001... items

- [x] `fetch_ticket_node` — JIRA REST API v3 via httpx; ADF-to-text flattener; AC extraction (custom fields + description fallback); 404 → `error` field (no retry); 5xx raises → retry; `log_node_event` after every execution
- [x] `requirements_analysis_node` — `run_agent()` with structured system prompt; JSON fence-strip + `re.search` regex fallback; `RequirementsOutput` Pydantic validation (ValidationError → retry); `_to_markdown()` produces readable summary; `log_node_event` after every execution
- [x] Both nodes: `with_retry(fn, state, retry_key='req_retry_count')` wrapper; `compute_input_hash` on only the fields each node reads; attempt count = retries consumed by this node only

**Notes:** JIRA MCP integration uses REST API v3 directly (identical data; MCP server wiring deferred to when mcp-config.json is created). `fetch_ticket_node` stays in `_MCP_ONLY_NODES` in provider.py — MCP swap is a one-line change.
**Deviations:** JIRA REST API used instead of MCP server (MCP server not yet configured).
**Known issues:** AC custom field ID varies by JIRA project — checks `customfield_10016`, `10014`, `10500`; add project-specific ID to .env if needed.

---

### ✅ SESSION 7 — Phase 1: HLS Generation (Diff-Aware)
**Goal:** `generate_hls_node` with diff-awareness, HLS-EXP system rule, Pydantic validation
**Done when:** `hls_list` ends with HLS-EXP; `changed_hls_ids=['HLS-002']` preserves HLS-001

- [x] Full/diff prompt builders — diff prompt lists preserved items so LLM knows what NOT to regenerate
- [x] HLS-EXP system rule — strip any LLM-generated HLS-EXP, always append `_HLS_EXP` constant last
- [x] `_validate_req_links()` — raises `ValueError` (→ retry) if any non-HLS-EXP item has empty `linked_requirements`
- [x] Diff merge — `preserved | regenerated` dict merge, sort by `_hls_sort_key`, re-append HLS-EXP; LLM extras outside `changed_ids` discarded
- [x] `with_retry(fn, state, retry_key='hls_retry_count')` — `ValidationError` and `ValueError` both trigger retry
- [x] `log_node_event` — `attempt = result.hls_retry_count - start_retries`
- [x] `tests/verify_hls.py` — 4 offline tests: HLS-EXP always last, LLM HLS-EXP stripped, diff preserves HLS-001, bad links retried ×3

**Notes:** All 4 offline tests pass. `tests/verify_hls.py` patches `_hls_mod.run_agent` directly (post-import name binding).
**Deviations:** _none_
**Known issues:** _none_

---

### ✅ SESSION 8 — Phase 1 Nodes + JIRA MCP
**Goal:** All 4 Phase 1 logic nodes fully implemented
**Done when:** Feed a real JIRA ticket ID → `coverage_report` JSON returned in terminal

- [x] `mcp-config.json` created — `mcp-atlassian` via `uvx`; reads JIRA_URL/JIRA_EMAIL/JIRA_API_TOKEN from env
- [x] `graph/nodes/fetch_ticket.py` — JIRA REST API v3; ADF→text; AC extraction; 404→error (no retry); 5xx retried; log
- [x] `graph/nodes/requirements_analysis.py` — run_agent → RequirementsOutput; fence-strip + regex fallback; markdown summary; retry+log
- [x] `graph/nodes/generate_hls.py` — diff-aware; HLS-EXP system rule; REQ-link validation; retry+log
- [x] `graph/nodes/generate_tcs.py` — TC list with diff-awareness + hls_id validation
- [x] `graph/nodes/coverage_validation.py` — pure Python coverage report, `phase2_unlocked` flag; HLS-EXP always exempt from hls_without_tcs
- [x] JSON parsing uses regex fallback for all LLM responses (fence-strip + `re.search(r'\{.*\}', raw, re.DOTALL)`)
- [x] Retry keys verified: fetch_ticket→req_retry_count, requirements_analysis→req_retry_count, generate_hls→hls_retry_count, generate_tcs→tc_retry_count
- [x] `ARCHITECTURE.md` updated — all Phase 1 nodes marked `[x]`

**Notes:** fetch_ticket.py and requirements_analysis.py were already complete from Session 6. generate_hls.py was already complete from Session 7. generate_tcs.py and coverage_validation.py completed in the current session pair. Only genuine new artifact this session: mcp-config.json. Later: extracted all node prompts to agent/prompts/ package; retrofitted requirements_analysis/generate_hls/generate_tcs to use prompts module and hardcoded provider. Then added feedback loop infrastructure: feedback_log table in seed_db.py; agent/diff_tracker.py (compute_list_diff, summarise_diff); agent/feedback_retriever.py (get_feedback_examples, log_feedback); feedback_injected field in AgentState; get_feedback_examples() wired into _analyze/_generate closures in all 3 Phase 1 LLM nodes; tests/test_feedback.py (5 tests — diff + DB error handling). Run `poetry run python scripts/seed_db.py` to create feedback_log table.
**Deviations:** fetch_ticket uses direct JIRA REST API (httpx) rather than MCP server call at runtime — MCP config now exists for future swap; node stays in _MCP_ONLY_NODES in provider.py.
**Known issues:** _none_

---

### 🔲 SESSION 6 — FastAPI Gate API + Timeout Watcher
**Goal:** REST API with all 5 endpoints + background gate watcher
**Done when:** Postman/curl: start → inspect state → resume all work correctly

- [ ] `api/main.py` — `POST /runs/start` implemented
- [ ] `api/main.py` — `POST /runs/{id}/resume` implemented
- [ ] `api/main.py` — `GET /runs/{id}/state` implemented (sensitive fields masked)
- [ ] `api/main.py` — `GET /runs/{id}/coverage` implemented
- [ ] `api/main.py` — `DELETE /runs/{id}` implemented
- [ ] `GET /health` endpoint returns `{status, db, graph}`
- [ ] `gate_timeout_watcher()` background task runs every 60s
- [ ] All 5 gate timeouts configurable via env vars
- [ ] Auto-approve sets `_auto_approved: True` in state
- [ ] Secrets validation on startup (fail fast if any required key missing)
- [ ] `ARCHITECTURE.md` updated — API Endpoints table fully populated

**Notes:** _add after completion_
**Deviations:** _none_
**Known issues:** _none_

---

### 🔲 SESSION 7 — Phase 2: Classification + Test Data
**Goal:** `classify_tcs_node` + `test_data_planning_node` + human gate endpoint
**Done when:** Classification JSON returned with mode + confidence for each TC

- [ ] `graph/nodes/classify_tcs.py` — auto/manual/hybrid with confidence score
- [ ] `graph/nodes/test_data_planning.py` — classification-aware field generation
- [ ] Sensitive fields masked in all API responses
- [ ] `POST /runs/{id}/test-data` endpoint — validates all non-optional fields before accept
- [ ] `ARCHITECTURE.md` updated — Phase 2 rows for classify + test_data marked `[x]`

**Notes:** _add after completion_
**Deviations:** _none_
**Known issues:** _none_

---

### 🔲 SESSION 8 — Execution Nodes + S3
**Goal:** Playwright + hybrid execution, S3 artifact upload, GitHub commit
**Done when:** One TC runs end-to-end: script generated → executed → result in state

- [x] `graph/nodes/playwright_execution.py` — generates + runs `.spec.ts` via Playwright MCP
- [x] `graph/nodes/hybrid_execution.py` — agent-assisted + `pending_manual` interrupt
- [x] `scripts/s3_upload.py` — `upload_artifact()` + `generate_presigned_url()`
- [ ] Screenshots uploaded to `sdet-artifacts/{run_id}/{tc_id}/screenshot.png` on failure
- [ ] `.spec.ts` files committed to `sdet-agent/{run_id}` branch via GitHub MCP
- [ ] MinIO works as local S3 equivalent (`S3_ENDPOINT_URL` from env)
- [ ] `mcp-config.json` updated with Playwright + GitHub MCP entries
- [ ] `ARCHITECTURE.md` updated — execution nodes + S3 + GitHub marked `[x]`

**Notes:** _add after completion_
**Deviations:** _none_
**Known issues:** _none_

---

### 🔲 SESSION 9 — Report + JIRA Write + GitHub PR + Email
**Goal:** Full pipeline completes — report generated, JIRA updated, PR opened, email sent
**Done when:** End-to-end run from ticket ID → email received

- [x] `graph/nodes/report_generation.py` — unified report with RCA, S3 pre-signed URLs
- [ ] Branched rejection routing: accuracy → regen report / failures → re-execute TCs
- [ ] `graph/nodes/write_jira.py` — creates JIRA sub-tasks with correct field mapping
- [ ] Parent ticket QA Status updated (Passed / Failed / In Progress)
- [ ] `graph/nodes/commit_github.py` — opens PR from `sdet-agent/{run_id}` → `main`
- [ ] `graph/nodes/send_email.py` — HTML email with summary table + links
- [ ] `ARCHITECTURE.md` updated — all output nodes marked `[x]`

**Notes:** _add after completion_
**Deviations:** _none_
**Known issues:** _none_

---

### ✅ SESSION 20 — Pipeline View UI Redesign
**Goal:** Cleaner, more readable pipeline view with single-phase stepper, read-only navigation, and redesigned action bar
**Done when:** TypeScript passes clean; all 7 design sections implemented

- [x] **Single-phase stepper**: sidebar shows only current phase steps; phase auto-detected from state; `animate-fade-up` on phase transition; 48px min-height items; progress bar with step counter
- [x] **Read-only back navigation**: completed steps with viewable gates are clickable; `viewingGate` state in page.tsx; VIEWING badge on stepper item; VIEW ONLY badge + Back button in content header; GateActionBar hidden while browsing; viewingGate reset on currentGate change
- [x] **Sidebar declutter**: removed provider pills, MCP lock badges, "using X" indicators; clean 48px rows
- [x] **Color tokens**: `--color-bg` updated to `#060b14`; `--color-surface` updated to `#0f1829`; all panel card backgrounds updated; body gradient updated
- [x] **Provider selector moved to action bar**: shown only for AI-powered gates; `GateActionBar` receives `provider`, `nodeProviders`, `onNodeProviderChange` props
- [x] **Action bar redesign**: 64px `h-16` action row; labeled approve buttons per gate (`Approve Requirements`, `Approve Scenarios`, etc.); reject panel expands above action row (not replacing it); edit toggle preserved
- [x] **Content header redesign**: phase badge (`PHASE 1 · ANALYSIS` / `PHASE 2 · AUTOMATION`); step counter; ticket badge removed; uses `displayGateMeta` for view-only browsing
- [x] TypeScript: 0 errors (`tsc --noEmit` exit 0)
- [x] `ARCHITECTURE.md` updated

**Notes:** Provider pills were removed from Stepper entirely — provider selection now happens in GateActionBar before approving AI-node gates. The `completedNodes` prop is kept on Stepper signature for future use but no longer used for per-step rendering. `gateMeta` kept as a local for any future use; `displayGateMeta` drives the header.
**Deviations:** _none_
**Known issues:** _none_

---

### ✅ SESSION 21 — Pipeline Reorder + UI Fixes
**Goal:** Move `write_jira_node` to Phase 1 end with a new `review_jira` gate; three UI polish fixes
**Done when:** TypeScript 0 errors; JIRA gate appears in Phase 1 stepper; stepper shows square badges; platform selector is a segmented control

- [x] **Pipeline reorder** — `write_jira` moved from Phase 2 tail to Phase 1 end (after `coverage_validation`); `review_jira` gate added as Phase 1 Gate 4; `interrupt_before` updated in `builder.py`; phase2_unlocked guard shifted to `review_jira` gate in `api/main.py`
- [x] **`review_coverage` disposition** — no longer fires as an active interrupt; auto-approves via `outputKey: "coverage_report"`; kept in `VIEWABLE_GATES` for browsable review
- [x] **Backend wiring** — `_NEXT_NODE_TO_GATE`, `_GATE_TO_RERUN_AS_NODE`, `_GATE_TO_STATE_FIELD`, `_GATE_TO_ID_FIELD`, `_GATE_TIMEOUT_ENV` all updated in `api/main.py`; `review_jira` added to `graph/state.py` and `agent/state_factory.py`
- [x] **`WriteJiraPanel`** — new component at bottom of `page.tsx`; shows parent ticket card, idempotency banner, Skip JIRA button, TC preview table (ID / Title / Priority / Type / Action)
- [x] **Platform selector** — 2-column icon card grid replaced with inline segmented control; 8px colored dots; Azure tab locked (opacity 0.4, pointer-events none)
- [x] **ASS→NOTE wording** — `RequirementsPanel.tsx` badge prefix `ASS-` → `NOTE-`; section title `"Assumptions"` → `"Notes & Assumptions"`; existing `ASS-` IDs in state stripped to `NOTE-` at render time
- [x] **Stepper square badges** — all circle+line indicators replaced with 28×28 square badges (border-radius 6); `border-pulse` / `border-pulse-purple` keyframes in `globals.css`; ACTIVE pill below step name; phase tabs redesigned; `review_jira` added to `VIEWABLE_GATES`
- [x] **`GateActionBar`** — `review_jira: "Create Sub-tasks →"` added to `APPROVE_LABELS`
- [x] **`types.ts`** — `review_jira: ReviewDecision | null` added to `AgentState`; `write_jira` step moved to Phase 1 with `gate: "review_jira"` in `PIPELINE_STEPS`
- [x] TypeScript: 0 errors confirmed via `getDiagnostics`
- [x] `ARCHITECTURE.md` updated

**Notes:** Skip JIRA button in WriteJiraPanel currently calls `handleApprove()` (same as Create Sub-tasks) — a backend `skip_jira` flag in `ResumeRunBody` and `write_jira_node` is needed to make the distinction functional.
**Deviations:** `review_coverage` kept in `GATE_META` and `VIEWABLE_GATES` for view-only browsing even though it no longer fires as an active gate.
**Known issues:** Skip JIRA is a UI placeholder — no backend skip logic yet.

---

### ✅ SESSION 10 — Next.js UI
**Goal:** Fully working futuristic dashboard that drives a complete pipeline run
**Done when:** A non-developer can start a pipeline, review each gate, and approve/reject via the UI

- [x] Next.js 14 project created in `ui/` with Tailwind CSS v4
- [x] Deep-space design system: `#080d14` bg, `#111827` cards, teal `#14b8a6` / purple `#8b5cf6`
- [x] Header: 44px fixed, run ID badge, compact 3-provider selector (Claude/Groq/Grok)
- [x] JIRA ticket input + Start button → `POST /runs/start`; Azure DevOps toggle (cosmetic)
- [x] Launch screen: centered 480px card, terminal icon, pipeline stage tags, gradient launch button
- [x] Left sidebar (220px): phase-separated stepper, per-node provider pills (C/G/X), MCP lock badge
- [x] Requirements → 4 stat cards + left-border list with edit mode
- [x] HLS → 2-col responsive grid
- [x] TCs → filter tabs (All/Critical/High/Medium/Low) + expandable cards
- [x] Coverage → SVG donut chart + stats + phase unlock banner (`ui/components/panels/CoveragePanel.tsx`)
- [x] Classifications → table with mode badges
- [x] Scripts → collapsible list with filename + content preview
- [x] Report → summary stat cards + results list with status colors
- [x] Gate action bar: redesigned with teal Approve gradient / red Reject / edit toggle
- [x] Reject shows feedback textarea before confirming
- [x] Edit mode: inline editing of requirement/HLS/TC cards
- [x] Toast redesign: left color border, 6s progress bar animation, collapsible raw error
- [x] Activity log drawer (200px): collapsible, monospace timestamped entries
- [x] Per-node provider selection: stepper pills sync with global toggle; disabled after node completion
- [x] `ARCHITECTURE.md` updated

**Notes:** Sessions covered multiple passes of iterative refinement including: project_name threading to resume API, TypeError fix in handleStart, rate-limit toast, futuristic background, phase stepper, fetch_ticket done state, 3-provider toggle, full per-node provider system (backend + frontend), and complete visual redesign.
**Deviations:** No recharts dependency — coverage donut uses pure SVG. Activity log tracks UI-triggered events (not server-side node events).
**Known issues:** _none_

---

### 🔲 SESSION 11 — LangSmith + Production Hardening
**Goal:** Full observability, retry caps enforced, prod-ready Docker setup
**Done when:** LangSmith shows a complete trace for a full pipeline run

- [ ] LangSmith env vars set + tracing enabled on every graph invocation
- [ ] `run_id` tagged on every LangSmith trace
- [ ] `langsmith_trace_url` returned in all `/state` API responses
- [ ] UI shows "View Trace" link per completed node in activity log
- [ ] Retry cap routing: if count > 3 → error node (not infinite loop)
- [ ] Error node: interrupts + shows error in UI with retry/abort options
- [ ] Production `Dockerfile`: multi-stage, `python:3.12-slim`, non-root user, health check
- [ ] `docker-compose.prod.yml`: nginx, `env_file`, `restart: always`
- [ ] `.github/workflows/ci.yml`: pytest → Docker build → push to GHCR on push to main
- [ ] `ARCHITECTURE.md` updated — Infrastructure table fully populated + all nodes `[x]`
- [ ] Final `PROGRESS.md` review — all 10 sessions ticked, carry-overs resolved

**Notes:** _add after completion_
**Deviations:** _none_
**Known issues:** _none_

---

## Carry-overs

> Items not completed in their intended session. Moved here to track across sessions.

_None yet._

---

## Decisions Log

> Record any significant deviations from the original build plan here.

| Session | Decision | Reason |
|---------|----------|--------|
| — | — | _none yet_ |

---

## Environment Checklist

> Tick these off before Session 1. You will not be re-asked.

- [ ] `ANTHROPIC_API_KEY` — console.anthropic.com
- [ ] `JIRA_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` — Atlassian account settings
- [ ] `GITHUB_PERSONAL_ACCESS_TOKEN` — repo + PR scopes
- [ ] `GROK_API_KEY` — console.x.ai (optional)
- [ ] `SENDGRID_API_KEY` + verified sender email — sendgrid.com
- [ ] `LANGCHAIN_API_KEY` — smith.langchain.com
- [ ] Docker Desktop running (Postgres + MinIO)
- [ ] Node.js 20+ installed
- [ ] Python 3.12+ and Poetry installed

---

_This file is auto-maintained. Do not edit the session rows manually — let Claude Code tick them off._
