import json
import os
import re
import time

import httpx

from pydantic import ValidationError  # noqa: F401 — imported so with_retry catches it

from agent.node_logger import compute_input_hash, emit_node_event, log_node_event
from agent.provider import get_node_provider, run_agent
from agent.retry import with_retry
from agent.schemas import RequirementsOutput
from agent.prompts import requirements_analysis as prompts
from agent.feedback_retriever import get_feedback_examples
from agent.safe_parse_json import safe_parse_json
from graph.state import AgentState

PROXI_URL = os.getenv("PROXI_URL", "http://localhost:3001")


def _build_prompt(ticket_data: dict, feedback_examples: str = "") -> str:
    formatted = (
        f"Summary:  {ticket_data.get('summary', '')}\n"
        f"Type:     {ticket_data.get('type', '')}\n"
        f"Priority: {ticket_data.get('priority', '')}\n\n"
        f"Description:\n{ticket_data.get('description', '')}\n\n"
        f"Acceptance Criteria:\n{ticket_data.get('acceptance_criteria', '')}"
    )
    return prompts.USER_TEMPLATE.format(ticket_data=formatted, feedback_examples=feedback_examples)


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
    if state.get("provider") == "proxi":
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.post(
                f"{PROXI_URL}/api/sdet/analyze",
                json={
                    "ticket_id": state["ticket_id"],
                    "ticket_data": state["ticket_data"],
                },
            )
            resp.raise_for_status()
            result = resp.json()
            if not result.get("success"):
                raise ValueError(f"Proxi analyze failed: {result.get('error', 'unknown')}")
            return {
                "requirements_analysis": result["data"]["requirements_analysis"],
                "requirements": result["data"]["requirements"],
            }

    t0 = time.monotonic()
    ticket_data = state.get("ticket_data") or {}
    start_retries = state.get("req_retry_count", 0)
    input_hash = compute_input_hash({"ticket_data": ticket_data})

    async def _analyze(s: AgentState) -> AgentState:
        feedback_examples = await get_feedback_examples(
            node="requirements_analysis",
            ticket_type=(s.get("ticket_data") or {}).get("type"),
        )
        provider = get_node_provider(s, "requirements_analysis_node")
        raw = await run_agent(
            prompt=_build_prompt(s.get("ticket_data") or {}, feedback_examples),
            provider=provider,
            system=prompts.SYSTEM,
            calling_node="requirements_analysis_node",
        )
        parsed = safe_parse_json(raw)
        validated = RequirementsOutput(**parsed)  # ValidationError → retry
        return {
            **s,
            "requirements_analysis": validated.model_dump(),
            "requirements": _to_markdown(validated),
            "feedback_injected": {
                **(s.get("feedback_injected") or {}),
                "requirements_analysis": feedback_examples,
            },
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
    await emit_node_event(run_id=state["run_id"], node="requirements_analysis", latency_ms=latency_ms)

    return result
