import json
import re
import time

from pydantic import ValidationError  # noqa: F401 — imported so with_retry catches it

from agent.node_logger import compute_input_hash, log_node_event
from agent.provider import run_agent
from agent.retry import with_retry
from agent.schemas import RequirementsOutput
from graph.state import AgentState

_SYSTEM = (
    "You are an expert SDET requirements analyst. "
    "Extract structured requirements from JIRA ticket content. "
    "Return ONLY valid JSON — no markdown fences, no explanation."
)


def _build_prompt(ticket_data: dict) -> str:
    return f"""Analyse this JIRA ticket and extract all requirements.

TICKET DATA:
Summary:  {ticket_data.get('summary', '')}
Type:     {ticket_data.get('type', '')}
Priority: {ticket_data.get('priority', '')}

Description:
{ticket_data.get('description', '')}

Acceptance Criteria:
{ticket_data.get('acceptance_criteria', '')}

Return JSON matching this exact schema (no extra keys, no markdown):
{{
  "requirements": [
    {{"id": "REQ-001", "text": "<requirement>", "source": "<description|AC|constraint>", "type": "<functional|non-functional|constraint>"}}
  ],
  "ambiguities":    [{{"id": "AMB-001", "description": "<what is unclear>",     "linked_req": "<REQ-id or null>"}}],
  "contradictions": [{{"id": "CON-001", "description": "<what contradicts what>"}}],
  "assumptions":    [{{"id": "ASS-001", "description": "<assumption made>"}}]
}}

Rules:
- Number sequentially: REQ-001, REQ-002 … AMB-001 … CON-001 … ASS-001 …
- source  ∈ {{description, AC, constraint}}
- type    ∈ {{functional, non-functional, constraint}}
- Return empty lists [] if no items exist in that category
"""


def _strip_fences(raw: str) -> str:
    """Remove ```json fences; fall back to first {{ }} block via regex."""
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`").strip()
    if not cleaned.startswith("{"):
        m = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if m:
            cleaned = m.group()
    return cleaned


def _to_markdown(output: RequirementsOutput) -> str:
    lines = ["## Requirements\n"]
    for r in output.requirements:
        lines.append(f"- **{r.id}** ({r.type}, source: {r.source}): {r.text}")
    if output.ambiguities:
        lines.append("\n## Ambiguities\n")
        for a in output.ambiguities:
            lines.append(f"- **{a.get('id', '?')}**: {a.get('description', '')}")
    if output.contradictions:
        lines.append("\n## Contradictions\n")
        for c in output.contradictions:
            lines.append(f"- **{c.get('id', '?')}**: {c.get('description', '')}")
    if output.assumptions:
        lines.append("\n## Assumptions\n")
        for a in output.assumptions:
            lines.append(f"- **{a.get('id', '?')}**: {a.get('description', '')}")
    return "\n".join(lines)


async def requirements_analysis_node(state: AgentState) -> AgentState:
    t0 = time.monotonic()
    ticket_data = state.get("ticket_data") or {}
    start_retries = state.get("req_retry_count", 0)
    input_hash = compute_input_hash({"ticket_data": ticket_data})

    async def _analyze(s: AgentState) -> AgentState:
        raw = await run_agent(
            prompt=_build_prompt(s.get("ticket_data") or {}),
            provider=s["provider"],
            system=_SYSTEM,
            calling_node="requirements_analysis_node",
        )
        parsed = json.loads(_strip_fences(raw))
        validated = RequirementsOutput(**parsed)  # ValidationError → retry
        return {
            **s,
            "requirements_analysis": validated.model_dump(),
            "requirements": _to_markdown(validated),
        }

    result = await with_retry(_analyze, state, retry_key="req_retry_count")

    latency_ms = int((time.monotonic() - t0) * 1000)
    await log_node_event(
        run_id=state["run_id"],
        node="requirements_analysis",
        attempt=result.get("req_retry_count", 0) - start_retries,
        provider=state["provider"],
        input_hash=input_hash,
        output_json=result.get("requirements_analysis") or {},
        latency_ms=latency_ms,
        error=result.get("error"),
    )

    return result
