import os
import re
import time
from typing import Optional

import httpx
from dotenv import load_dotenv

from agent.node_logger import compute_input_hash, log_node_event
from agent.retry import with_retry
from graph.state import AgentState

load_dotenv()

_JIRA_URL: str = os.getenv("JIRA_URL", "").rstrip("/")
_JIRA_EMAIL: str = os.getenv("JIRA_EMAIL", "")
_JIRA_TOKEN: str = os.getenv("JIRA_API_TOKEN", "")


def _adf_to_text(node: Optional[dict | str]) -> str:
    """Recursively flatten Atlassian Document Format (ADF) to plain text."""
    if node is None:
        return ""
    if isinstance(node, str):
        return node
    if node.get("type") == "text":
        return node.get("text", "")
    parts = [_adf_to_text(child) for child in node.get("content", [])]
    sep = "\n" if node.get("type") in ("paragraph", "heading", "bulletList", "listItem", "doc") else " "
    return sep.join(p for p in parts if p)


def _extract_ac(fields: dict) -> str:
    """Check common custom field IDs for Acceptance Criteria, then fall back
    to scraping an 'Acceptance Criteria' section from the description."""
    for key in ("customfield_10016", "customfield_10014", "customfield_10500"):
        val = fields.get(key)
        if val:
            return _adf_to_text(val) if isinstance(val, dict) else str(val)
    description = _adf_to_text(fields.get("description"))
    m = re.search(r"(?i)acceptance[\s_]criteria[:\s]+(.*)", description, re.DOTALL)
    return m.group(1).strip() if m else ""


async def _fetch_inner(state: AgentState) -> AgentState:
    if not (_JIRA_URL and _JIRA_EMAIL and _JIRA_TOKEN):
        raise ValueError(
            "JIRA credentials not configured — set JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN in .env"
        )

    ticket_id = state["ticket_id"]
    url = f"{_JIRA_URL}/rest/api/3/issue/{ticket_id}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            url,
            auth=(_JIRA_EMAIL, _JIRA_TOKEN),
            headers={"Accept": "application/json"},
        )

    if resp.status_code == 404:
        # Not retry-worthy — return immediately with error flag
        return {**state, "error": f"Ticket {ticket_id} not found in JIRA"}

    resp.raise_for_status()  # 5xx → raises → with_retry retries
    fields = resp.json().get("fields", {})

    return {
        **state,
        "ticket_data": {
            "summary": fields.get("summary", ""),
            "description": _adf_to_text(fields.get("description")),
            "acceptance_criteria": _extract_ac(fields),
            "type": fields.get("issuetype", {}).get("name", ""),
            "priority": fields.get("priority", {}).get("name", ""),
        },
    }


async def fetch_ticket_node(state: AgentState) -> AgentState:
    t0 = time.monotonic()
    start_retries = state.get("req_retry_count", 0)
    input_hash = compute_input_hash({"ticket_id": state["ticket_id"]})

    result = await with_retry(_fetch_inner, state, retry_key="req_retry_count")

    latency_ms = int((time.monotonic() - t0) * 1000)
    await log_node_event(
        run_id=state["run_id"],
        node="fetch_ticket",
        attempt=result.get("req_retry_count", 0) - start_retries,
        provider="jira_mcp",
        input_hash=input_hash,
        output_json=result.get("ticket_data") or {},
        latency_ms=latency_ms,
        error=result.get("error"),
    )

    return result
