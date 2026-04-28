"""write_jira_node — idempotent JIRA sub-task writer.

Idempotency key: ticket_id + tc_id (NOT run_id).
Search → update existing OR create new sub-task for each TC.
After all TCs: update parent ticket QA Status.
"""

import os
import time
from typing import Optional

import httpx

from agent.node_logger import compute_input_hash, log_node_event
from graph.state import AgentState

_JIRA_URL: str = os.getenv("JIRA_URL", "").rstrip("/")
_JIRA_EMAIL: str = os.getenv("JIRA_EMAIL", "")
_JIRA_TOKEN: str = os.getenv("JIRA_API_TOKEN", "")


def _auth() -> tuple[str, str]:
    return (_JIRA_EMAIL, _JIRA_TOKEN)


def _headers() -> dict[str, str]:
    return {"Accept": "application/json", "Content-Type": "application/json"}


# ── ADF helpers ───────────────────────────────────────────────────────────────

def _adf_text(text: str) -> dict:
    return {"type": "text", "text": text or " "}


def _adf_para(text: str) -> dict:
    return {"type": "paragraph", "content": [_adf_text(text)]}


def _adf_cell(text: str, is_header: bool = False) -> dict:
    cell_type = "tableHeader" if is_header else "tableCell"
    return {"type": cell_type, "content": [_adf_para(text)]}


def _adf_row(cells: list[str], is_header: bool = False) -> dict:
    return {"type": "tableRow", "content": [_adf_cell(c, is_header) for c in cells]}


def _build_description(tc: dict, result: Optional[dict], screenshot_url: Optional[str]) -> dict:
    """Build ADF document: steps table + optional screenshot link."""
    steps = tc.get("steps", [])
    status = (result or {}).get("status", "not_run")

    rows: list[dict] = [_adf_row(["Action", "Expected", "Status"], is_header=True)]
    for i, step in enumerate(steps):
        row_status = status if i == len(steps) - 1 else "—"
        rows.append(_adf_row([step.get("action", ""), step.get("expected", ""), row_status]))

    content: list[dict] = [
        {"type": "table", "attrs": {"isNumberColumnEnabled": True}, "content": rows}
    ]

    if screenshot_url and status == "failed":
        content.append(_adf_para(f"Screenshot: {screenshot_url}"))

    return {"version": 1, "type": "doc", "content": content}


# ── JIRA REST helpers ─────────────────────────────────────────────────────────

async def _search_subtask(
    client: httpx.AsyncClient, ticket_id: str, tc_id: str
) -> Optional[str]:
    """Return the JIRA issue key of an existing sub-task, or None."""
    jql = f'parent = "{ticket_id}" AND labels = "sdet-agent" AND summary ~ "{tc_id}"'
    resp = await client.get(
        f"{_JIRA_URL}/rest/api/3/issue/search",
        auth=_auth(),
        headers={"Accept": "application/json"},
        params={"jql": jql, "maxResults": 10, "fields": "summary"},
    )
    resp.raise_for_status()
    prefix = f"[SDET] {tc_id}"
    for issue in resp.json().get("issues", []):
        if issue.get("fields", {}).get("summary", "").startswith(prefix):
            return issue["key"]
    return None


def _issue_fields(
    ticket_id: str,
    tc: dict,
    result: Optional[dict],
    screenshot_url: Optional[str],
    qa_status_field: Optional[str],
    *,
    include_project: bool,
) -> dict:
    status = (result or {}).get("status", "not_run")
    labels = ["sdet-agent"]
    hls_id = tc.get("hls_id", "")
    if hls_id:
        labels.append(hls_id)

    fields: dict = {
        "summary": f"[SDET] {tc.get('id', '')} — {tc.get('title', '')}",
        "description": _build_description(tc, result, screenshot_url),
        "priority": {"name": tc.get("priority", "Medium")},
        "labels": labels,
    }
    if include_project:
        project_key = ticket_id.split("-")[0]
        subtask_type = os.getenv("JIRA_SUBTASK_TYPE", "Sub-task")
        fields["project"] = {"key": project_key}
        fields["parent"] = {"key": ticket_id}
        fields["issuetype"] = {"name": subtask_type}
    if qa_status_field and status:
        fields[qa_status_field] = {"value": status}

    return fields


async def _create_subtask(
    client: httpx.AsyncClient,
    ticket_id: str,
    tc: dict,
    result: Optional[dict],
    screenshot_url: Optional[str],
    qa_status_field: Optional[str],
) -> str:
    fields = _issue_fields(ticket_id, tc, result, screenshot_url, qa_status_field, include_project=True)
    resp = await client.post(
        f"{_JIRA_URL}/rest/api/3/issue",
        auth=_auth(),
        headers=_headers(),
        json={"fields": fields},
    )
    resp.raise_for_status()
    return resp.json()["key"]


async def _update_subtask(
    client: httpx.AsyncClient,
    issue_key: str,
    ticket_id: str,
    tc: dict,
    result: Optional[dict],
    screenshot_url: Optional[str],
    qa_status_field: Optional[str],
) -> None:
    fields = _issue_fields(ticket_id, tc, result, screenshot_url, qa_status_field, include_project=False)
    resp = await client.put(
        f"{_JIRA_URL}/rest/api/3/issue/{issue_key}",
        auth=_auth(),
        headers=_headers(),
        json={"fields": fields},
    )
    resp.raise_for_status()


async def _link_requirements(
    client: httpx.AsyncClient, issue_key: str, req_ids: list[str]
) -> None:
    for req_id in req_ids:
        try:
            await client.post(
                f"{_JIRA_URL}/rest/api/3/issueLink",
                auth=_auth(),
                headers=_headers(),
                json={
                    "type": {"name": "Relates"},
                    "inwardIssue": {"key": issue_key},
                    "outwardIssue": {"key": req_id},
                },
            )
        except Exception:
            pass  # REQ IDs may not exist as JIRA issues — non-fatal


async def _update_parent_status(
    client: httpx.AsyncClient,
    ticket_id: str,
    statuses: list[str],
    qa_status_field: Optional[str],
) -> None:
    if not qa_status_field:
        return
    if all(s == "passed" for s in statuses):
        qa_value = "QA Passed"
    elif any(s == "failed" for s in statuses):
        qa_value = "QA Failed"
    else:
        qa_value = "QA In Progress"

    resp = await client.put(
        f"{_JIRA_URL}/rest/api/3/issue/{ticket_id}",
        auth=_auth(),
        headers=_headers(),
        json={"fields": {qa_status_field: {"value": qa_value}}},
    )
    resp.raise_for_status()


# ── Node ──────────────────────────────────────────────────────────────────────

async def write_jira_node(state: AgentState) -> AgentState:
    t0 = time.monotonic()
    ticket_id = state["ticket_id"]
    tc_list = state.get("tc_list") or []
    execution_results = state.get("execution_results") or []
    input_hash = compute_input_hash({"ticket_id": ticket_id, "tc_count": len(tc_list)})
    qa_status_field: Optional[str] = os.getenv("JIRA_QA_STATUS_FIELD") or None

    if not (_JIRA_URL and _JIRA_EMAIL and _JIRA_TOKEN):
        error_msg = "JIRA credentials not configured — set JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN"
        await log_node_event(
            run_id=state["run_id"], node="write_jira", attempt=0, provider="jira_rest",
            input_hash=input_hash, output_json={}, latency_ms=0, error=error_msg,
        )
        return {**state, "error": error_msg}

    results_by_tc: dict[str, dict] = {r["tc_id"]: r for r in execution_results}
    written: list[dict] = []
    statuses: list[str] = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        for tc in tc_list:
            tc_id = tc.get("id", "")
            result = results_by_tc.get(tc_id)
            status = (result or {}).get("status", "not_run")
            statuses.append(status)

            screenshot_url: Optional[str] = None
            if status == "failed" and result:
                for url in result.get("artifact_urls", []):
                    if "screenshot" in url.lower():
                        screenshot_url = url
                        break

            try:
                existing_key = await _search_subtask(client, ticket_id, tc_id)
                if existing_key:
                    await _update_subtask(client, existing_key, ticket_id, tc, result, screenshot_url, qa_status_field)
                    issue_key = existing_key
                    action = "updated"
                else:
                    issue_key = await _create_subtask(client, ticket_id, tc, result, screenshot_url, qa_status_field)
                    action = "created"

                await _link_requirements(client, issue_key, tc.get("linked_requirements", []))
                written.append({"tc_id": tc_id, "issue_key": issue_key, "action": action})
            except Exception as exc:
                written.append({"tc_id": tc_id, "issue_key": None, "error": str(exc)[:200]})

        try:
            await _update_parent_status(client, ticket_id, statuses, qa_status_field)
        except Exception:
            pass  # Parent update failure is non-fatal

    latency_ms = int((time.monotonic() - t0) * 1000)
    await log_node_event(
        run_id=state["run_id"],
        node="write_jira",
        attempt=0,
        provider="jira_rest",
        input_hash=input_hash,
        output_json={"written_count": len(written), "written": written},
        latency_ms=latency_ms,
        error=None,
    )

    return state
