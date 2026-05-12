"""write_jira_node — always-create JIRA sub-task writer.

Creates a new sub-task for each TC. No search, no update.
"""

import os
import time
from typing import Optional

import httpx

from agent.jira_auth import get_jira_headers
from agent.node_logger import compute_input_hash, log_node_event
from graph.state import AgentState

_JIRA_URL: str = os.getenv("JIRA_URL", "").rstrip("/")
_JIRA_EMAIL: str = os.getenv("JIRA_EMAIL", "")
_JIRA_TOKEN: str = os.getenv("JIRA_API_TOKEN", "")


# ── JIRA REST helpers ─────────────────────────────────────────────────────────

def _check_redirect(resp: httpx.Response) -> None:
    if resp.status_code == 302:
        raise Exception("Jira auth failed — check JIRA_API_TOKEN and JIRA_AUTH_TYPE=bearer in .env")


def _build_test_case_data(tc: dict) -> str:
    lines = [f"Test Case: {tc.get('id', '')} — {tc.get('title', '')}"]
    if tc.get("description"):
        lines.append(f"Description: {tc['description']}")
    for i, step in enumerate(tc.get("steps", []), 1):
        lines.append(f"Step {i}: {step.get('action', '')}")
        lines.append(f"  Expected: {step.get('expected', '')}")
    return "\n".join(lines)


def _issue_fields(tc: dict, project_key: str) -> dict:
    priority_map = {"high": "2", "medium": "3", "low": "4"}
    summary = f"[SDET] {tc.get('id', '')} — {tc.get('title', '')}"
    test_case_data_string = _build_test_case_data(tc)
    priority_id = priority_map.get(tc.get("priority", "medium").lower(), "3")
    return {
        'project':            {'key': project_key},
        'issuetype':          {'id': '11517'},
        'summary':            summary,
        'priority':           {'id': priority_id},
        'customfield_21000':  {'id': '22702'},      # Not Executed
        'customfield_14109':  {'id': '14401'},      # Functional
        'customfield_30200':  test_case_data_string,  # plain string
    }


async def _create_subtask(
    client: httpx.AsyncClient,
    ticket_id: str,
    tc: dict,
    result: Optional[dict],
    screenshot_url: Optional[str],
    qa_status_field: Optional[str],
    project_key: str,
    functional_area: str,
) -> str:
    fields = _issue_fields(tc, project_key)
    print(f"[JIRA] fields dict: {fields}")
    resp = await client.post(
        f"{_JIRA_URL}/rest/api/2/issue",
        headers=get_jira_headers(),
        json={"fields": fields},
    )
    _check_redirect(resp)
    resp.raise_for_status()
    new_issue_key: str = resp.json()["key"]

    # Link the new TC issue back to the parent ticket
    link_resp = await client.post(
        f"{_JIRA_URL}/rest/api/2/issueLink",
        headers=get_jira_headers(),
        json={
            'type':         {'name': 'Covers'},
            'outwardIssue': {'key': new_issue_key},
            'inwardIssue':  {'key': ticket_id},
        },
    )
    _check_redirect(link_resp)
    return new_issue_key


async def _link_requirements(
    client: httpx.AsyncClient, issue_key: str, req_ids: list[str]
) -> None:
    for req_id in req_ids:
        try:
            resp = await client.post(
                f"{_JIRA_URL}/rest/api/2/issueLink",
                headers=get_jira_headers(),
                json={
                    "type": {"name": "Relates"},
                    "inwardIssue": {"key": issue_key},
                    "outwardIssue": {"key": req_id},
                },
            )
            _check_redirect(resp)
        except Exception:
            pass  # REQ IDs may not exist as JIRA issues — non-fatal


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

    project_key: str = state.get("jira_tc_project_key") or ticket_id.split("-")[0]
    functional_area: str = state.get("jira_functional_area") or "Dubai Justice Platform"

    selected_ids = state.get("jira_selected_tc_ids") or None
    if selected_ids:
        tc_list = [tc for tc in tc_list if tc.get("id") in selected_ids]

    print(f"[JIRA] jira_selected_tc_ids: {state.get('jira_selected_tc_ids')}")
    print(f"[JIRA] Total TCs in tc_list: {len(state.get('tc_list') or [])}")
    print(f"[JIRA] TCs to process: {len(tc_list)}")
    print(f"[JIRA] project_key={project_key!r}  functional_area={functional_area!r}  ticket_id={ticket_id!r}")

    results_by_tc: dict[str, dict] = {r["tc_id"]: r for r in execution_results}
    written: list[dict] = []

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=False) as client:
        for tc in tc_list:
            tc_id = tc.get("id", "")
            result = results_by_tc.get(tc_id)
            status = (result or {}).get("status", "not_run")

            screenshot_url: Optional[str] = None
            if status == "failed" and result:
                for url in result.get("artifact_urls", []):
                    if "screenshot" in url.lower():
                        screenshot_url = url
                        break

            try:
                issue_key = await _create_subtask(
                    client, ticket_id, tc, result, screenshot_url,
                    qa_status_field, project_key, functional_area,
                )
                print(f"[JIRA] Created {issue_key} for {tc_id}")
                await _link_requirements(client, issue_key, tc.get("linked_requirements", []))
                written.append({"tc_id": tc_id, "issue_key": issue_key, "action": "created"})
            except Exception as e:
                error_body = getattr(getattr(e, "response", None), "text", str(e))
                print(f"[JIRA] FULL ERROR for {tc.get('id', '?')}: {error_body}")
                written.append({"tc_id": tc_id, "issue_key": None, "error": str(e)[:200]})

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
