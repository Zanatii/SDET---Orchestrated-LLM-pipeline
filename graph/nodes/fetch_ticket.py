"""fetch_ticket_node — fetches a Jira ticket by ID plus its comments."""

import json
import os
import re
import time
from typing import Optional

import httpx
from dotenv import load_dotenv

from agent.jira_auth import get_jira_headers
from agent.node_logger import compute_input_hash, log_node_event
from agent.retry import with_retry
from graph.state import AgentState

load_dotenv()

_JIRA_URL: str = os.getenv("JIRA_URL", "").rstrip("/")
_JIRA_TOKEN: str = os.getenv("JIRA_API_TOKEN", "")


# ── ADF helpers ───────────────────────────────────────────────────────────────

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


def _wiki_to_structured(text: str) -> list[dict]:
    """Parse Jira wiki markup into structured blocks (text and table)."""
    blocks: list[dict] = []
    text_lines: list[str] = []
    table_headers: list[str] = []
    table_rows: list[list[str]] = []
    in_table = False

    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("||"):
            if text_lines:
                content = "\n".join(text_lines).strip()
                if content:
                    blocks.append({"type": "text", "content": content})
                text_lines = []
            in_table = True
            table_headers = [p.strip() for p in stripped.split("||") if p.strip()]
        elif in_table and stripped.startswith("|"):
            table_rows.append([p.strip() for p in stripped.split("|") if p.strip()])
        else:
            if in_table:
                blocks.append({"type": "table", "headers": table_headers, "rows": table_rows})
                table_headers, table_rows, in_table = [], [], False
            text_lines.append(line)

    if in_table:
        blocks.append({"type": "table", "headers": table_headers, "rows": table_rows})
    elif text_lines:
        content = "\n".join(text_lines).strip()
        if content:
            blocks.append({"type": "text", "content": content})

    return blocks


def _adf_to_structured(node: Optional[dict | str]) -> list[dict]:
    """Convert ADF to a list of typed blocks: {type: "text"|"table", ...}.

    text  → {"type": "text",  "content": str}
    table → {"type": "table", "headers": [str, ...], "rows": [[str, ...], ...]}
    """
    if node is None:
        return []
    if isinstance(node, str):
        if not node.strip():
            return []
        if any(l.strip().startswith("||") for l in node.splitlines()):
            return _wiki_to_structured(node)
        return [{"type": "text", "content": node}]

    node_type = node.get("type", "")
    children = node.get("content", [])

    if node_type == "doc":
        blocks: list[dict] = []
        for child in children:
            blocks.extend(_adf_to_structured(child))
        return blocks

    if node_type == "table":
        headers: list[str] = []
        rows: list[list[str]] = []
        for row in children:
            if row.get("type") != "tableRow":
                continue
            cells = row.get("content", [])
            if any(c.get("type") == "tableHeader" for c in cells):
                headers = [_adf_to_text(c).strip() for c in cells]
            else:
                rows.append([_adf_to_text(c).strip() for c in cells])
        return [{"type": "table", "headers": headers, "rows": rows}]

    if node_type in ("bulletList", "orderedList"):
        items: list[str] = []
        for i, item in enumerate(children):
            prefix = f"{i + 1}." if node_type == "orderedList" else "•"
            text = _adf_to_text(item).strip()
            if text:
                items.append(f"{prefix} {text}")
        return [{"type": "text", "content": "\n".join(items)}] if items else []

    if node_type in ("paragraph", "heading", "listItem", "blockquote", "codeBlock"):
        text = _adf_to_text(node).strip()
        return [{"type": "text", "content": text}] if text else []

    # Unknown node — recurse into children
    blocks = []
    for child in children:
        blocks.extend(_adf_to_structured(child))
    return blocks


# ── Wiki markup helpers ───────────────────────────────────────────────────────

def _wiki_table_to_text(wiki_text: str) -> str:
    """Convert Jira wiki markup tables to readable plain text."""
    lines = re.split(r"\r\n|\n", wiki_text)
    cleaned = []
    for line in lines:
        if line.startswith("||"):
            parts = [p.strip() for p in line.split("||") if p.strip()]
            cleaned.append(" | ".join(parts))
        elif line.startswith("|"):
            parts = [p.strip() for p in line.split("|") if p.strip()]
            cleaned.append(" | ".join(parts))
        else:
            cleaned.append(line)
    result = "\n".join(cleaned)
    result = re.sub(r"\{color(?::[^}]*)?\}", "", result)
    result = result.replace("*", "")
    return result


def _extract_ac(fields: dict) -> str:
    """Check common custom field IDs for Acceptance Criteria, then fall back
    to scraping an 'Acceptance Criteria' section from the description."""
    val_11200 = fields.get("customfield_11200")
    if val_11200:
        # Return raw wiki markup so the UI can render tables properly.
        # ADF dicts are flattened to text; strings are passed through as-is.
        return _adf_to_text(val_11200) if isinstance(val_11200, dict) else str(val_11200)
    for key in ("customfield_10016", "customfield_10014", "customfield_10500"):
        val = fields.get(key)
        if val:
            return _adf_to_text(val) if isinstance(val, dict) else str(val)
    description = _adf_to_text(fields.get("description"))
    m = re.search(r"(?i)acceptance[\s_]criteria[:\s]+(.*)", description, re.DOTALL)
    return m.group(1).strip() if m else ""


# ── Node ──────────────────────────────────────────────────────────────────────

async def _fetch_inner(state: AgentState) -> AgentState:
    if not (_JIRA_URL and _JIRA_TOKEN):
        raise ValueError(
            "JIRA credentials not configured — set JIRA_URL and JIRA_API_TOKEN in .env"
        )

    ticket_id = state["ticket_id"]

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=False) as client:
        resp = await client.get(
            f"{_JIRA_URL}/rest/api/2/issue/{ticket_id}",
            headers=get_jira_headers(),
        )

        if resp.status_code == 302:
            raise Exception("Jira auth failed — check JIRA_API_TOKEN and JIRA_AUTH_TYPE=bearer in .env")

        if resp.status_code == 404:
            return {**state, "error": f"Ticket {ticket_id} not found in JIRA"}

        resp.raise_for_status()
        fields = resp.json().get("fields", {})

        raw_desc = fields.get("description")
        print(json.dumps({
            "event": "description_raw",
            "node": "fetch_ticket",
            "dtype": type(raw_desc).__name__,
            "preview": str(raw_desc)[:1000],
        }, default=str))

        # Fetch comments — non-fatal, empty list on any error
        comments: list[dict] = []
        try:
            c_resp = await client.get(
                f"{_JIRA_URL}/rest/api/2/issue/{ticket_id}/comment?maxResults=50",
                headers=get_jira_headers(),
            )
            if c_resp.status_code == 200:
                for c in c_resp.json().get("comments", []):
                    body = _adf_to_text(c.get("body"))
                    if body.strip():
                        comments.append({
                            "author":  c.get("author", {}).get("displayName", "Unknown"),
                            "body":    body,
                            "created": c.get("created", ""),
                        })
        except Exception:
            pass

    return {
        **state,
        "ticket_data": {
            "summary":             fields.get("summary", ""),
            "description":         _adf_to_structured(fields.get("description")),
            "acceptance_criteria": _extract_ac(fields),
            "type":                fields.get("issuetype", {}).get("name", ""),
            "priority":            fields.get("priority", {}).get("name", ""),
            "comments":            comments,
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
