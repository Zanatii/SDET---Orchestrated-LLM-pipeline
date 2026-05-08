"""write_jira_node — idempotent JIRA sub-task writer.

Idempotency key: ticket_id + tc_id (NOT run_id).
Search → update existing OR create new sub-task for each TC.
After all TCs: update parent ticket QA Status.
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

def _check_redirect(resp: httpx.Response) -> None:
    if resp.status_code == 302:
        raise Exception("Jira auth failed — check JIRA_API_TOKEN and JIRA_AUTH_TYPE=bearer in .env")

async def _search_subtask(
    client: httpx.AsyncClient, ticket_id: str, tc_id: str
) -> Optional[str]:
    """Return the JIRA issue key of an existing sub-task, or None."""
    jql = f'parent = "{ticket_id}" AND labels = "sdet-agent" AND summary ~ "{tc_id}"'
    resp = await client.get(
        f"{_JIRA_URL}/rest/api/2/issue/search",
        headers=get_jira_headers(),
        params={"jql": jql, "maxResults": 10, "fields": "summary"},
    )
    _check_redirect(resp)
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
    project_key: str,
    functional_area: str,
    *,
    include_project: bool,
) -> dict:
    status = (result or {}).get("status", "not_run")
    labels = ["sdet-agent"]
    hls_id = tc.get("hls_id", "")
    if hls_id:
        labels.append(hls_id)

    test_type = tc.get("test_type", "Functional")
    if test_type not in ("Functional", "Integration"):
        test_type = "Functional"

    fields: dict = {
        "summary": f"[SDET] {tc.get('id', '')} — {tc.get('title', '')}",
        "description": _build_description(tc, result, screenshot_url),
        "priority": {"name": tc.get("priority", "Medium")},
        "labels": labels,
        "customfield_14109": {"value": test_type},
        "customfield_10300": [{"value": functional_area}],
    }
    if include_project:
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
    project_key: str,
    functional_area: str,
) -> str:
    fields = _issue_fields(ticket_id, tc, result, screenshot_url, qa_status_field, project_key, functional_area, include_project=True)
    resp = await client.post(
        f"{_JIRA_URL}/rest/api/2/issue",
        headers=get_jira_headers(),
        json={"fields": fields},
    )
    _check_redirect(resp)
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
    project_key: str,
    functional_area: str,
) -> None:
    fields = _issue_fields(ticket_id, tc, result, screenshot_url, qa_status_field, project_key, functional_area, include_project=False)
    resp = await client.put(
        f"{_JIRA_URL}/rest/api/2/issue/{issue_key}",
        headers=get_jira_headers(),
        json={"fields": fields},
    )
    _check_redirect(resp)
    resp.raise_for_status()


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
                existing_key = await _search_subtask(client, ticket_id, tc_id)
                if existing_key:
                    await _update_subtask(client, existing_key, ticket_id, tc, result, screenshot_url, qa_status_field, project_key, functional_area)
                    issue_key = existing_key
                    action = "updated"
                else:
                    issue_key = await _create_subtask(client, ticket_id, tc, result, screenshot_url, qa_status_field, project_key, functional_area)
                    action = "created"

                await _link_requirements(client, issue_key, tc.get("linked_requirements", []))
                written.append({"tc_id": tc_id, "issue_key": issue_key, "action": action})
            except Exception as exc:
                err_detail = exc.response.text if hasattr(exc, "response") else str(exc)
                print(f"[JIRA] ERROR for {tc_id}: {err_detail[:400]}")
                written.append({"tc_id": tc_id, "issue_key": None, "error": str(exc)[:200]})

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
