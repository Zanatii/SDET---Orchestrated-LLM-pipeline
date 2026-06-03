"""FastAPI application for the SDET multi-agent pipeline."""

import asyncio
import json
import logging
import os
import uuid
from asyncio import Queue
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

import asyncpg
import httpx
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import scripts.init_observability  # noqa — activates LangSmith tracing

from agent.diff_tracker import compute_list_diff
from agent.feedback_retriever import log_feedback
from agent.jira_auth import get_jira_headers
from agent.state_factory import create_initial_state
from graph.builder import _compile

logger = logging.getLogger(__name__)

# ── Gate mappings ──────────────────────────────────────────────────────────────

# interrupt_before node → human-facing gate name
_NEXT_NODE_TO_GATE: dict[str, str] = {
    "generate_hls":        "review_requirements",
    "generate_tcs":        "review_hls",
    "coverage_validation": "review_tcs",
    "write_jira":          "review_jira",
    "test_data_planning":  "review_classifications",
    "generate_scripts":    "review_scripts",
    "commit_github":       "review_report",
}

# gate name → as_node arg for aupdate_state when re-running on rejection.
# Setting as_node=X tells LangGraph "node X just ran", so next will be X's successor.
_GATE_TO_RERUN_AS_NODE: dict[str, str] = {
    "review_requirements":    "fetch_ticket",          # re-runs requirements_analysis
    "review_hls":             "requirements_analysis", # re-runs generate_hls
    "review_tcs":             "generate_hls",          # re-runs generate_tcs
    "review_jira":            "coverage_validation",   # re-runs write_jira (re-previews)
    "review_classifications": "write_jira",            # re-runs classify_tcs
    "review_scripts":         "classify_tcs",          # re-runs test_data_planning
    "review_report":          "hybrid_execution",      # re-runs report_generation
}

# gate name → AgentState retry counter field
_GATE_TO_RETRY_KEY: dict[str, str] = {
    "review_requirements": "req_retry_count",
    "review_hls":          "hls_retry_count",
    "review_tcs":          "tc_retry_count",
    "review_report":       "report_retry_count",
}

# gate name → primary AgentState field holding the agent's list output
_GATE_TO_STATE_FIELD: dict[str, str] = {
    "review_requirements":    "requirements_analysis",
    "review_hls":             "hls_list",
    "review_tcs":             "tc_list",
    "review_coverage":        "coverage_report",
    "review_jira":            "tc_list",
    "review_classifications": "tc_classifications",
    "review_scripts":         "test_data_requirements",
    "review_report":          "report",
}

# id_field passed to compute_list_diff for each gate
_GATE_TO_ID_FIELD: dict[str, str] = {
    "review_requirements":    "id",
    "review_hls":             "id",
    "review_tcs":             "id",
    "review_coverage":        "id",
    "review_jira":            "id",
    "review_classifications": "tc_id",
    "review_scripts":         "tc_id",
    "review_report":          "id",
}

# gate name → env var key that holds the timeout in seconds
_GATE_TIMEOUT_ENV: dict[str, str] = {
    "review_requirements":    "GATE_TIMEOUT_REQUIREMENTS",
    "review_hls":             "GATE_TIMEOUT_HLS",
    "review_tcs":             "GATE_TIMEOUT_TCS",
    "review_coverage":        "GATE_TIMEOUT_COVERAGE",
    "review_jira":            "GATE_TIMEOUT_COVERAGE",
    "review_classifications": "GATE_TIMEOUT_COVERAGE",
    "review_scripts":         "GATE_TIMEOUT_COVERAGE",
    "review_report":          "GATE_TIMEOUT_REPORT",
}

_GATE_TIMEOUT_DEFAULTS: dict[str, int] = {
    "GATE_TIMEOUT_REQUIREMENTS": 172800,
    "GATE_TIMEOUT_HLS":          172800,
    "GATE_TIMEOUT_TCS":          259200,
    "GATE_TIMEOUT_COVERAGE":     86400,
    "GATE_TIMEOUT_REPORT":       86400,
}

_REQUIRED_SECRETS = [
    "ANTHROPIC_API_KEY",
    "JIRA_URL",
    "JIRA_EMAIL",
    "JIRA_API_TOKEN",
    "GITHUB_PERSONAL_ACCESS_TOKEN",
    "DATABASE_URL",
]

# In-memory registry of runs waiting at a human gate.
# {run_id: {ticket_id, gate_node, started_at, timeout_seconds}}
PENDING_GATES: dict[str, dict] = {}

# WebSocket connections keyed by run_id.
websocket_connections: dict[str, list[WebSocket]] = {}

# Queue for node completion + gate events from graph nodes to WebSocket sender.
notification_queue: Queue = Queue()


# ── Helpers ────────────────────────────────────────────────────────────────────

def _db_url() -> str:
    return os.getenv("DATABASE_URL", "").replace("postgresql+asyncpg://", "postgresql://")


def _gate_timeout(gate_node: str) -> int:
    env_key = _GATE_TIMEOUT_ENV.get(gate_node, "GATE_TIMEOUT_COVERAGE")
    default = _GATE_TIMEOUT_DEFAULTS.get(env_key, 86400)
    return int(os.getenv(env_key, str(default)))


def _pending_gate_entry(ticket_id: str, gate: str) -> dict:
    return {
        "ticket_id": ticket_id,
        "gate_node": gate,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "timeout_seconds": _gate_timeout(gate),
    }


async def _stream_until_interrupt(
    graph, initial_state_or_none, config: dict
) -> tuple[Optional[str], dict]:
    """Drive the graph until an interrupt_before gate or END.
    Returns (gate_name | None, full state snapshot dict)."""
    async for _ in graph.astream(initial_state_or_none, config, stream_mode="updates"):
        pass
    snapshot = await graph.aget_state(config)
    next_nodes = list(snapshot.next) if snapshot.next else []
    gate = _NEXT_NODE_TO_GATE.get(next_nodes[0]) if next_nodes else None
    return gate, dict(snapshot.values)


def _mask_sensitive(state: dict) -> dict:
    """Return a shallow copy of state with TDField values masked where sensitive=True."""
    masked = {**state}
    tdr = masked.get("test_data_requirements")
    if isinstance(tdr, list):
        masked["test_data_requirements"] = [
            {
                **item,
                "fields": [
                    {**f, "value": "***"} if f.get("sensitive") else f
                    for f in item.get("fields", [])
                ],
            }
            for item in tdr
        ]
    return masked


def _agent_list_for_gate(state: dict, gate_node: str) -> list:
    """Extract the agent's current output list for a gate."""
    val = state.get(_GATE_TO_STATE_FIELD.get(gate_node, ""))
    if gate_node == "review_requirements" and isinstance(val, dict):
        return val.get("requirements", [])
    return val if isinstance(val, list) else []


def _human_list_from_edits(edits: dict, gate_node: str) -> list:
    """Extract the human's replacement list from the edits payload."""
    if gate_node == "review_requirements":
        return (
            edits.get("requirements")
            or edits.get("requirements_analysis", {}).get("requirements", [])
        )
    return edits.get(_GATE_TO_STATE_FIELD.get(gate_node, ""), [])


def _changed_hls_ids_from_diff(diff: dict, gate_node: str, tc_list: list) -> list[str]:
    """Derive changed_hls_ids from a TC-level or HLS-level diff."""
    if gate_node == "review_hls":
        return [m["id"] for m in diff.get("modified", [])] + list(diff.get("deleted", []))

    # review_tcs: collect hls_ids from modified, added, and deleted TCs
    hls_ids: set[str] = set()
    for item in diff.get("modified", []):
        hid = (item.get("after") or item.get("before") or {}).get("hls_id")
        if hid:
            hls_ids.add(hid)
    for item in diff.get("added", []):
        hid = item.get("hls_id")
        if hid:
            hls_ids.add(hid)
    tc_lookup = {tc["id"]: tc for tc in tc_list if "id" in tc}
    for del_id in diff.get("deleted", []):
        hid = tc_lookup.get(str(del_id), {}).get("hls_id")
        if hid:
            hls_ids.add(hid)
    return list(hls_ids)


async def _log_diff_feedback(
    *,
    run_id: str,
    gate_node: str,
    ticket_id: str,
    ticket_type: Optional[str],
    agent_list: list,
    diff: dict,
    feedback: Optional[str],
    id_field: str,
) -> None:
    """Log one feedback row per modified / added / deleted item."""
    agent_by_id = {item.get(id_field): item for item in agent_list}

    for item in diff.get("modified", []):
        await log_feedback(
            run_id=run_id, node=gate_node, ticket_id=ticket_id,
            ticket_type=ticket_type, item_id=item.get("id"),
            edit_type="modified",
            agent_output=item.get("before"), human_edit=item.get("after"),
            diff={"modified": [item]}, feedback_text=feedback,
        )
    for item in diff.get("added", []):
        item_id = item.get("id") or item.get("tc_id")
        await log_feedback(
            run_id=run_id, node=gate_node, ticket_id=ticket_id,
            ticket_type=ticket_type, item_id=item_id,
            edit_type="added",
            agent_output=None, human_edit=item,
            diff={"added": [item]}, feedback_text=feedback,
        )
    for del_id in diff.get("deleted", []):
        await log_feedback(
            run_id=run_id, node=gate_node, ticket_id=ticket_id,
            ticket_type=ticket_type, item_id=str(del_id),
            edit_type="deleted",
            agent_output=agent_by_id.get(del_id), human_edit=None,
            diff={"deleted": [del_id]}, feedback_text=feedback,
        )


# ── Gate timeout watcher ───────────────────────────────────────────────────────

async def _send_timeout_alert(
    *,
    run_id: str,
    ticket_id: str,
    gate_node: str,
    elapsed_seconds: int,
    auto_approved: bool,
) -> None:
    """Send a SendGrid alert email when a gate timeout fires."""
    api_key = os.getenv("SENDGRID_API_KEY", "")
    recipients_raw = os.getenv("NOTIFICATION_EMAILS", "")
    if not api_key or not recipients_raw:
        logger.warning(
            "Timeout alert skipped — SENDGRID_API_KEY or NOTIFICATION_EMAILS not set "
            "(run_id=%s gate=%s)", run_id, gate_node
        )
        return

    recipients = [r.strip() for r in recipients_raw.split(",") if r.strip()]
    from_email = os.getenv("NOTIFICATION_FROM_EMAIL", "noreply@sdet-agent.local")
    base_url = os.getenv("BASE_URL", "http://localhost:8000")
    status_text = (
        "Auto-approved — pipeline has resumed"
        if auto_approved
        else "Still awaiting human review"
    )
    subject = f"[SDET Agent] Gate timed out: {gate_node} for {ticket_id}"
    html_content = f"""
<h2>SDET Agent &mdash; Gate Timeout Alert</h2>
<table cellpadding="6">
  <tr><td><strong>Run ID</strong></td><td>{run_id}</td></tr>
  <tr><td><strong>Ticket ID</strong></td><td>{ticket_id}</td></tr>
  <tr><td><strong>Gate</strong></td><td>{gate_node}</td></tr>
  <tr><td><strong>Elapsed</strong></td><td>{elapsed_seconds}s</td></tr>
  <tr><td><strong>Status</strong></td><td>{status_text}</td></tr>
</table>
<p><a href="{base_url}/runs/{run_id}/state">View run state &rarr;</a></p>
"""

    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail

        message = Mail(
            from_email=from_email,
            to_emails=recipients,
            subject=subject,
            html_content=html_content,
        )
        await asyncio.to_thread(SendGridAPIClient(api_key).send, message)
    except Exception as exc:
        logger.exception("SendGrid alert failed for run %s gate %s: %s", run_id, gate_node, exc)


async def _auto_approve_gate(
    graph, run_id: str, gate_node: str, ticket_id: str, elapsed_seconds: int
) -> None:
    """Auto-approve a timed-out gate and resume the graph."""
    reason = (
        f"Gate '{gate_node}' auto-approved after {elapsed_seconds}s for run {run_id}"
    )
    config = {"configurable": {"thread_id": run_id}}
    try:
        snapshot = await graph.aget_state(config)
        if not snapshot or not snapshot.next:
            PENDING_GATES.pop(run_id, None)
            return

        ticket_type = (dict(snapshot.values).get("ticket_data") or {}).get("type")

        await log_feedback(
            run_id=run_id, node=gate_node, ticket_id=ticket_id,
            ticket_type=ticket_type, item_id=None, edit_type="approved",
            agent_output=None, human_edit=None,
            diff={"added": [], "deleted": [], "modified": [], "unchanged_count": 0},
            feedback_text=reason,
        )

        await graph.aupdate_state(
            config,
            {gate_node: {"approved": True}, "_auto_approved_reason": reason},
        )
        new_gate, _ = await _stream_until_interrupt(graph, None, config)

        PENDING_GATES.pop(run_id, None)
        if new_gate:
            PENDING_GATES[run_id] = _pending_gate_entry(ticket_id, new_gate)

        logger.info("Auto-approved gate %s for run %s — next gate: %s", gate_node, run_id, new_gate)
    except Exception:
        logger.exception("Auto-approve failed for run %s gate %s", run_id, gate_node)


async def _timeout_watcher(graph) -> None:
    """Background task: poll PENDING_GATES every 60s and fire on expired gates."""
    while True:
        await asyncio.sleep(60)
        now = datetime.now(timezone.utc)

        for run_id, info in list(PENDING_GATES.items()):
            try:
                started_at = datetime.fromisoformat(info["started_at"])
                elapsed = (now - started_at).total_seconds()
                if elapsed <= info["timeout_seconds"]:
                    continue

                gate_node = info["gate_node"]
                ticket_id = info["ticket_id"]
                auto_approve = os.getenv("GATE_AUTO_APPROVE", "").lower() == "true"

                if auto_approve:
                    await _auto_approve_gate(graph, run_id, gate_node, ticket_id, int(elapsed))

                await _send_timeout_alert(
                    run_id=run_id,
                    ticket_id=ticket_id,
                    gate_node=gate_node,
                    elapsed_seconds=int(elapsed),
                    auto_approved=auto_approve,
                )
            except Exception:
                logger.exception("Timeout watcher error for run %s", run_id)


async def _rebuild_pending_gates(graph) -> None:
    """Re-populate PENDING_GATES from the Postgres checkpoint store after a restart."""
    try:
        conn = await asyncpg.connect(_db_url())
        try:
            rows = await conn.fetch("SELECT DISTINCT thread_id FROM checkpoints")
        finally:
            await conn.close()
    except Exception as exc:
        logger.warning("Could not query checkpoint store for restart resilience: %s", exc)
        return

    restored = 0
    for row in rows:
        tid = str(row["thread_id"])
        try:
            config = {"configurable": {"thread_id": tid}}
            snapshot = await graph.aget_state(config)
            if not snapshot or not snapshot.next:
                continue
            gate = _NEXT_NODE_TO_GATE.get(list(snapshot.next)[0])
            if not gate:
                continue
            state = dict(snapshot.values)
            PENDING_GATES[tid] = _pending_gate_entry(state.get("ticket_id", tid), gate)
            restored += 1
        except Exception as exc:
            logger.warning("Could not restore pending gate for run %s: %s", tid, exc)

    if restored:
        logger.info("Restart resilience: restored %d pending gate(s) from checkpoint store", restored)


# ── WebSocket helpers ──────────────────────────────────────────────────────────

async def notify_client(run_id: str, data: dict) -> None:
    """Send a JSON message to all WebSocket clients subscribed to run_id."""
    connections = websocket_connections.get(run_id, [])
    dead = []
    for ws in connections:
        try:
            await ws.send_json(data)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in connections:
            connections.remove(ws)


# ── Lifespan ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    missing = [k for k in _REQUIRED_SECRETS if not os.getenv(k)]
    if missing:
        raise RuntimeError(
            f"Missing required environment variables: {', '.join(missing)}"
        )

    conn_str = _db_url()
    pg_cm = None
    try:
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
        pg_cm = AsyncPostgresSaver.from_conn_string(conn_str)
        checkpointer = await pg_cm.__aenter__()
    except ImportError:
        from langgraph.checkpoint.memory import MemorySaver
        checkpointer = MemorySaver()

    app.state.graph = _compile(checkpointer)
    await _rebuild_pending_gates(app.state.graph)
    watcher = asyncio.create_task(_timeout_watcher(app.state.graph))

    async def _notification_worker() -> None:
        while True:
            try:
                rid, message = await notification_queue.get()
                await notify_client(rid, message)
            except Exception:
                pass

    asyncio.create_task(_notification_worker())

    try:
        yield
    finally:
        watcher.cancel()
        try:
            await watcher
        except asyncio.CancelledError:
            pass
        if pg_cm is not None:
            await pg_cm.__aexit__(None, None, None)


app = FastAPI(title="SDET Agent API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request bodies ─────────────────────────────────────────────────────────────

class StartRunBody(BaseModel):
    ticket_id: str
    provider: str = "claude"
    node_providers: Optional[dict] = None
    skip_steps: Optional[list] = None
    jira_tc_project_key: Optional[str] = None
    jira_functional_area: Optional[str] = None


class ResumeRunBody(BaseModel):
    gate_node: str
    approved: bool
    feedback: Optional[str] = None
    edits: Optional[dict] = None
    project_name: Optional[str] = None
    node_providers: Optional[dict] = None
    jira_selected_tc_ids: Optional[list] = None


class TestDataFieldInput(BaseModel):
    tc_id: str
    field: str
    value: str


class TestDataBody(BaseModel):
    fields: list[TestDataFieldInput]


# ── Endpoints ──────────────────────────────────────────────────────────────────

# Start a new pipeline run for a JIRA ticket.
@app.post("/runs/start")
async def start_run(body: StartRunBody):
    from graph.nodes.fetch_ticket import fetch_ticket_node as _fetch_ticket

    run_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": run_id}}

    initial_state = create_initial_state(ticket_id=body.ticket_id, run_id=run_id)
    initial_state["provider"] = body.provider  # type: ignore[index]
    initial_state["node_providers"] = body.node_providers or {}  # type: ignore[index]
    initial_state["skip_steps"] = body.skip_steps or []  # type: ignore[index]
    initial_state["jira_tc_project_key"] = body.jira_tc_project_key or ""  # type: ignore[index]
    initial_state["jira_functional_area"] = body.jira_functional_area or "Dubai Justice Platform"  # type: ignore[index]

    print(f"[START] skip_steps received: {body.skip_steps}")
    print(f"[START] skip_steps in state: {initial_state['skip_steps']}")

    # Phase 1: Run fetch_ticket directly so we can return ticket data to the UI immediately.
    after_fetch = await _fetch_ticket(initial_state)

    if after_fetch.get("error"):
        return {
            "run_id": run_id,
            "interrupted_at": None,
            "state_snapshot": _mask_sensitive(dict(after_fetch)),
        }

    # Seed the LangGraph checkpoint at the fetch_ticket boundary.
    # as_node="fetch_ticket" tells LangGraph "fetch_ticket just completed",
    # so the next continuation will run requirements_analysis.
    await app.state.graph.aupdate_state(config, dict(after_fetch), as_node="fetch_ticket")

    # Phase 2: Run requirements analysis + rest of pipeline in background.
    # The UI will show FetchTicketPanel with a loading indicator until the
    # WebSocket gate_reached event arrives.
    async def _run_background() -> None:
        try:
            gate, snapshot = await _stream_until_interrupt(app.state.graph, None, config)
            if gate:
                PENDING_GATES[run_id] = _pending_gate_entry(body.ticket_id, gate)
            await notify_client(run_id, {
                "type": "gate_reached",
                "interrupted_at": gate,
                "state_snapshot": _mask_sensitive(snapshot),
            })
        except Exception:
            logger.exception("Background pipeline failed for run %s", run_id)
            await notify_client(run_id, {"type": "error", "message": "Pipeline failed after fetch"})

    asyncio.create_task(_run_background())

    # Return immediately with ticket data — requirements analysis runs in background.
    return {
        "run_id": run_id,
        "interrupted_at": None,
        "state_snapshot": _mask_sensitive(dict(after_fetch)),
    }


# Resume a paused run after a human review decision.
@app.post("/runs/{run_id}/resume")
async def resume_run(run_id: str, body: ResumeRunBody):
    config = {"configurable": {"thread_id": run_id}}
    snapshot = await app.state.graph.aget_state(config)
    if snapshot is None or not snapshot.values:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")

    current_state = dict(snapshot.values)
    gate_node = body.gate_node
    ticket_id = current_state.get("ticket_id", "")
    ticket_type = (current_state.get("ticket_data") or {}).get("type")
    id_field = _GATE_TO_ID_FIELD.get(gate_node, "id")

    # ── Safe node_providers merge (skip already-completed nodes) ─────────────
    if body.node_providers:
        completed_nodes: list[str] = []
        if current_state.get("requirements_analysis"):
            completed_nodes.append("requirements_analysis_node")
        if current_state.get("hls_list"):
            completed_nodes.append("generate_hls_node")
        if current_state.get("tc_list"):
            completed_nodes.append("generate_tcs_node")
        if current_state.get("tc_classifications"):
            completed_nodes.append("classify_tcs_node")
        if current_state.get("test_data_requirements"):
            completed_nodes.append("test_data_planning_node")
        if current_state.get("scripts_written"):
            completed_nodes.append("playwright_execution_node")
        if current_state.get("execution_results"):
            completed_nodes.append("hybrid_execution_node")
        if current_state.get("report"):
            completed_nodes.append("report_generation_node")

        safe_updates = {
            k: v for k, v in body.node_providers.items()
            if k not in completed_nodes
        }
        merged_node_providers = {
            **(current_state.get("node_providers") or {}),
            **safe_updates,
        }
        await app.state.graph.aupdate_state(
            config, {"node_providers": merged_node_providers}
        )
        current_state["node_providers"] = merged_node_providers

    if body.approved:
        state_updates: dict = {gate_node: {"approved": True}}

        if gate_node == "review_scripts":
            state_updates["project_name"] = body.project_name or "default"

        if gate_node == "review_jira" and body.jira_selected_tc_ids is not None:
            state_updates["jira_selected_tc_ids"] = body.jira_selected_tc_ids

        if body.edits:
            agent_list = _agent_list_for_gate(current_state, gate_node)
            human_list = _human_list_from_edits(body.edits, gate_node)
            diff = compute_list_diff(agent_list, human_list, id_field=id_field)

            await _log_diff_feedback(
                run_id=run_id, gate_node=gate_node,
                ticket_id=ticket_id, ticket_type=ticket_type,
                agent_list=agent_list, diff=diff,
                feedback=body.feedback, id_field=id_field,
            )

            # Apply the human's edits to state
            state_field = _GATE_TO_STATE_FIELD.get(gate_node, "")
            if gate_node == "review_requirements" and isinstance(
                current_state.get("requirements_analysis"), dict
            ):
                state_updates["requirements_analysis"] = {
                    **current_state["requirements_analysis"],
                    "requirements": human_list,
                }
            elif state_field:
                state_updates[state_field] = human_list

            # Populate changed_hls_ids for diff-aware regeneration
            if gate_node in ("review_hls", "review_tcs"):
                changed = _changed_hls_ids_from_diff(
                    diff, gate_node, current_state.get("tc_list") or []
                )
                if changed:
                    state_updates["changed_hls_ids"] = changed
        else:
            # Clean approval — log a single approved row
            await log_feedback(
                run_id=run_id, node=gate_node, ticket_id=ticket_id,
                ticket_type=ticket_type, item_id=None, edit_type="approved",
                agent_output=None, human_edit=None,
                diff={"added": [], "deleted": [], "modified": [], "unchanged_count": 0},
                feedback_text=None,
            )

        await app.state.graph.aupdate_state(config, state_updates)

    else:
        # ── Rejected path ────────────────────────────────────────────────
        await log_feedback(
            run_id=run_id, node=gate_node, ticket_id=ticket_id,
            ticket_type=ticket_type, item_id=None, edit_type="rejected",
            agent_output=None, human_edit=None,
            diff={"added": [], "deleted": [], "modified": [], "unchanged_count": 0},
            feedback_text=body.feedback,
        )

        state_updates = {gate_node: {"approved": False, "feedback": body.feedback}}

        retry_key = _GATE_TO_RETRY_KEY.get(gate_node)
        if retry_key:
            state_updates[retry_key] = current_state.get(retry_key, 0) + 1

        # Derive changed_hls_ids from edits (diff-aware regen on rejection)
        if body.edits and gate_node in ("review_hls", "review_tcs"):
            agent_list = _agent_list_for_gate(current_state, gate_node)
            human_list = _human_list_from_edits(body.edits, gate_node)
            diff = compute_list_diff(agent_list, human_list, id_field=id_field)
            changed = _changed_hls_ids_from_diff(
                diff, gate_node, current_state.get("tc_list") or []
            )
            if changed:
                state_updates["changed_hls_ids"] = changed

        rerun_as_node = _GATE_TO_RERUN_AS_NODE.get(gate_node)
        await app.state.graph.aupdate_state(config, state_updates, as_node=rerun_as_node)

    async def _run_stream() -> None:
        try:
            gate, snapshot_after = await _stream_until_interrupt(app.state.graph, None, config)
            PENDING_GATES.pop(run_id, None)
            if gate:
                PENDING_GATES[run_id] = _pending_gate_entry(ticket_id, gate)
            await notify_client(run_id, {
                "type": "gate_reached",
                "interrupted_at": gate,
                "state_snapshot": _mask_sensitive(snapshot_after),
            })
        except Exception:
            logger.exception("Graph stream failed after resume for run %s", run_id)
            await notify_client(run_id, {
                "type": "error",
                "message": "Graph stream failed",
            })

    asyncio.create_task(_run_stream())

    return JSONResponse(
        status_code=202,
        content={"run_id": run_id, "status": "resuming"},
    )


# Return the full AgentState for a run, with sensitive fields masked.
@app.get("/runs/{run_id}/state")
async def get_run_state(run_id: str):
    config = {"configurable": {"thread_id": run_id}}
    snapshot = await app.state.graph.aget_state(config)
    if snapshot is None or not snapshot.values:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return _mask_sensitive(dict(snapshot.values))


# Accept human-provided values for manual/sensitive test data fields.
@app.post("/runs/{run_id}/test-data")
async def submit_test_data(run_id: str, body: TestDataBody):
    blank = [f"{f.tc_id}:{f.field}" for f in body.fields if not f.value.strip()]
    if blank:
        raise HTTPException(
            status_code=400,
            detail=f"Missing values for: {', '.join(blank)}",
        )

    config = {"configurable": {"thread_id": run_id}}
    snapshot = await app.state.graph.aget_state(config)
    if snapshot is None or not snapshot.values:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")

    tdr = list(dict(snapshot.values).get("test_data_requirements") or [])

    # Build lookup: (tc_id, field_name) → new value
    value_map: dict[tuple[str, str], str] = {
        (f.tc_id, f.field): f.value for f in body.fields
    }

    updated_tdr = []
    for item in tdr:
        tc_id = item.get("tc_id", "")
        new_fields = [
            {**fd, "value": value_map[(tc_id, fd["field"])]}
            if (tc_id, fd.get("field", "")) in value_map
            else fd
            for fd in item.get("fields", [])
        ]
        updated_tdr.append({**item, "fields": new_fields})

    await app.state.graph.aupdate_state(config, {"test_data_requirements": updated_tdr})
    return _mask_sensitive({"test_data_requirements": updated_tdr})


# Return only the coverage_report for a run.
@app.get("/runs/{run_id}/coverage")
async def get_run_coverage(run_id: str):
    config = {"configurable": {"thread_id": run_id}}
    snapshot = await app.state.graph.aget_state(config)
    if snapshot is None or not snapshot.values:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return snapshot.values.get("coverage_report")


# Return pending gate info and seconds remaining for a run.
@app.get("/runs/{run_id}/pending-gates")
async def get_pending_gates(run_id: str):
    info = PENDING_GATES.get(run_id)
    if not info:
        return []
    started_at = datetime.fromisoformat(info["started_at"])
    elapsed = (datetime.now(timezone.utc) - started_at).total_seconds()
    return [
        {
            "gate_node": info["gate_node"],
            "seconds_remaining": max(0, info["timeout_seconds"] - int(elapsed)),
        }
    ]


# Liveness + readiness probe.
@app.get("/health")
async def health():
    db_status = "error"
    try:
        conn = await asyncpg.connect(_db_url())
        await conn.fetchval("SELECT 1")
        await conn.close()
        db_status = "connected"
    except Exception:
        pass
    return {
        "status": "ok",
        "db": db_status,
        "graph": "loaded" if hasattr(app.state, "graph") else "not loaded",
    }


# Return existing project names from scripts/generated/ for UI autocomplete.
@app.get("/projects")
async def list_projects():
    base = "scripts/generated"
    if not os.path.isdir(base):
        return {"projects": []}
    projects = sorted(
        entry for entry in os.listdir(base)
        if os.path.isdir(os.path.join(base, entry))
    )
    return {"projects": projects}


# Remove a run from PENDING_GATES and mark it cancelled.
@app.delete("/runs/{run_id}")
async def cancel_run(run_id: str):
    PENDING_GATES.pop(run_id, None)
    return {"run_id": run_id, "status": "cancelled"}


# Debug endpoint — inspect skip_steps, node_providers, and current interrupt for a run.
@app.get("/runs/{run_id}/debug")
async def debug_run(run_id: str):
    config = {"configurable": {"thread_id": run_id}}
    snapshot = await app.state.graph.aget_state(config)
    if snapshot is None or not snapshot.values:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    state = dict(snapshot.values)
    return {
        "skip_steps": state.get("skip_steps"),
        "node_providers": state.get("node_providers"),
        "current_interrupted_at": list(snapshot.next) if snapshot.next else None,
    }


# Smoke-test endpoint — connect and receive a single confirmation message.
@app.websocket("/ws/test")
async def websocket_test(websocket: WebSocket):
    await websocket.accept()
    await websocket.send_json({"type": "connected", "message": "WebSocket working"})
    await websocket.close()


# Real-time WebSocket stream for a run — delivers node_completed and gate_reached events.
@app.websocket("/ws/{run_id}")
async def websocket_endpoint(websocket: WebSocket, run_id: str):
    await websocket.accept()
    websocket_connections.setdefault(run_id, []).append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        conns = websocket_connections.get(run_id, [])
        if websocket in conns:
            conns.remove(websocket)


# Aggregate feedback patterns filtered by node, ticket_type, and time window.
@app.get("/feedback/patterns")
async def feedback_patterns(
    node: Optional[str] = None,
    ticket_type: Optional[str] = None,
    days: int = 30,
):
    try:
        conn = await asyncpg.connect(_db_url())
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"DB unavailable: {exc}")

    try:
        _where = """
            WHERE ($1::text IS NULL OR node = $1)
              AND ($2::text IS NULL OR ticket_type = $2)
              AND created_at > NOW() - ($3 || ' days')::interval
        """
        params = [node, ticket_type, str(days)]

        totals = await conn.fetchrow(
            f"""
            SELECT
                COUNT(*) AS total,
                COUNT(CASE WHEN edit_type = 'approved' THEN 1 END) AS approvals
            FROM feedback_log {_where}
            """,
            *params,
        )
        total = totals["total"] or 0
        approvals = totals["approvals"] or 0
        approval_rate = round(approvals / total, 4) if total > 0 else 0.0

        rejection_rows = await conn.fetch(
            f"""
            SELECT feedback_text, COUNT(*) AS cnt
            FROM feedback_log {_where}
              AND edit_type = 'rejected'
              AND feedback_text IS NOT NULL
            GROUP BY feedback_text
            ORDER BY cnt DESC
            LIMIT 10
            """,
            *params,
        )
        rejection_reasons = [
            {"reason_text": r["feedback_text"], "count": r["cnt"]}
            for r in rejection_rows
        ]

        # Parse diff JSON in Python to accumulate per-field modification counts
        modified_rows = await conn.fetch(
            f"""
            SELECT diff FROM feedback_log {_where}
              AND edit_type = 'modified' AND diff IS NOT NULL
            """,
            *params,
        )
        field_counts: dict[str, int] = defaultdict(int)
        for row in modified_rows:
            try:
                d = json.loads(row["diff"])
                for item in d.get("modified", []):
                    for field in item.get("changed_fields", {}).keys():
                        field_counts[field] += 1
            except Exception:
                pass

        count_rows = await conn.fetch(
            f"""
            SELECT edit_type, COUNT(*) AS cnt
            FROM feedback_log {_where}
              AND edit_type IN ('added', 'deleted')
            GROUP BY edit_type
            """,
            *params,
        )
        most_deleted = most_added = 0
        for row in count_rows:
            if row["edit_type"] == "deleted":
                most_deleted = row["cnt"]
            elif row["edit_type"] == "added":
                most_added = row["cnt"]

    finally:
        await conn.close()

    return {
        "node": node,
        "ticket_type": ticket_type,
        "period_days": days,
        "total_reviews": total,
        "approval_rate": approval_rate,
        "rejection_reasons": rejection_reasons,
        "most_modified_fields": [
            {"field": f, "count": c}
            for f, c in sorted(field_counts.items(), key=lambda x: -x[1])
        ][:10],
        "most_deleted_count": most_deleted,
        "most_added_count": most_added,
    }


# ── Jira discovery helpers ─────────────────────────────────────────────────────

def _jira_base_url() -> str:
    return os.getenv("JIRA_URL", "").rstrip("/")


# Discover all Jira fields, split into custom and system fields.
@app.get("/jira/fields")
async def jira_fields():
    url = f"{_jira_base_url()}/rest/api/2/field"
    async with httpx.AsyncClient(follow_redirects=False) as client:
        resp = await client.get(url, headers=get_jira_headers())
    if resp.status_code == 302:
        raise HTTPException(status_code=401, detail="Jira auth failed — check JIRA_API_TOKEN and JIRA_AUTH_TYPE=bearer in .env")
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    fields = resp.json()
    return {
        "custom_fields": [
            {"id": f["id"], "name": f["name"], "schema": f.get("schema")}
            for f in fields if f["id"].startswith("customfield_")
        ],
        "system_fields": [
            {"id": f["id"], "name": f["name"]}
            for f in fields if not f["id"].startswith("customfield_")
        ],
    }


# Discover all Jira issue types.
@app.get("/jira/issue-types")
async def jira_issue_types():
    url = f"{_jira_base_url()}/rest/api/2/issuetype"
    async with httpx.AsyncClient(follow_redirects=False) as client:
        resp = await client.get(url, headers=get_jira_headers())
    if resp.status_code == 302:
        raise HTTPException(status_code=401, detail="Jira auth failed — check JIRA_API_TOKEN and JIRA_AUTH_TYPE=bearer in .env")
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return [
        {"id": t["id"], "name": t["name"], "subtask": t.get("subtask", False)}
        for t in resp.json()
    ]


# Discover all Jira issue link types.
@app.get("/jira/link-types")
async def jira_link_types():
    url = f"{_jira_base_url()}/rest/api/2/issueLinkType"
    async with httpx.AsyncClient(follow_redirects=False) as client:
        resp = await client.get(url, headers=get_jira_headers())
    if resp.status_code == 302:
        raise HTTPException(status_code=401, detail="Jira auth failed — check JIRA_API_TOKEN and JIRA_AUTH_TYPE=bearer in .env")
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return [
        {"name": lt["name"], "inward": lt.get("inward", ""), "outward": lt.get("outward", "")}
        for lt in resp.json().get("issueLinkTypes", [])
    ]


# Temporary: return raw createmeta for TRKDJP sub-task field discovery.
@app.get("/jira/createmeta")
async def jira_createmeta():
    url = f"{_jira_base_url()}/rest/api/2/issue/createmeta"
    params = {
        "projectKeys": "TRKDJP",
        "issuetypeIds": "11517",
        "expand": "projects.issuetypes.fields",
    }
    print(f"[CREATEMETA] Calling: {url} with params {params}")
    async with httpx.AsyncClient(follow_redirects=False) as client:
        resp = await client.get(url, headers=get_jira_headers(), params=params)
    if resp.status_code == 302:
        raise HTTPException(status_code=401, detail="Jira auth failed — check JIRA_API_TOKEN and JIRA_AUTH_TYPE=bearer in .env")
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


# Return all feedback_log rows for a run, grouped by node.
@app.get("/feedback/runs/{run_id}")
async def feedback_for_run(run_id: str):
    try:
        conn = await asyncpg.connect(_db_url())
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"DB unavailable: {exc}")

    try:
        rows = await conn.fetch(
            """
            SELECT node, edit_type, item_id, feedback_text,
                   created_at, diff, agent_output, human_edit
            FROM feedback_log
            WHERE run_id = $1
            ORDER BY created_at
            """,
            run_id,
        )
    finally:
        await conn.close()

    grouped: dict[str, list] = defaultdict(list)
    for row in rows:
        grouped[row["node"]].append({
            "edit_type":     row["edit_type"],
            "item_id":       row["item_id"],
            "feedback_text": row["feedback_text"],
            "created_at":    row["created_at"].isoformat() if row["created_at"] else None,
            "diff":          json.loads(row["diff"]) if row["diff"] else None,
            "agent_output":  json.loads(row["agent_output"]) if row["agent_output"] else None,
            "human_edit":    json.loads(row["human_edit"]) if row["human_edit"] else None,
        })

    return dict(grouped)
