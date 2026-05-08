import json
import time

from pydantic import ValidationError  # noqa: F401 — propagates through with_retry

from agent.feedback_retriever import get_feedback_examples
from agent.model_router import get_model
from agent.node_logger import compute_input_hash, emit_node_event, log_node_event
from agent.provider import get_node_provider, run_agent
from agent.retry import with_retry
from agent.safe_parse_json import safe_parse_json
from agent.schemas import ClassificationOutput
from agent.prompts import classify_tcs as prompts
from graph.state import AgentState


async def classify_tcs_node(state: AgentState) -> AgentState:
    t0 = time.monotonic()
    tc_list = state.get("tc_list") or []
    coverage_report = state.get("coverage_report") or {}
    start_retries = state.get("tc_retry_count", 0)
    input_hash = compute_input_hash({
        "tc_list": tc_list,
        "coverage_report": coverage_report,
    })

    async def _classify(s: AgentState) -> AgentState:
        provider = get_node_provider(s, "classify_tcs_node")
        model = get_model("classify_tcs_node", provider)
        feedback_examples = await get_feedback_examples(
            node="classify_tcs",
            ticket_type=(s.get("ticket_data") or {}).get("type"),
        )
        prompt = prompts.USER_TEMPLATE.format(
            tc_list=json.dumps(s.get("tc_list") or [], indent=2),
            coverage_report=json.dumps(s.get("coverage_report") or {}, indent=2),
            feedback_examples=feedback_examples,
        )
        raw = await run_agent(
            prompt=prompt,
            provider=provider,
            system=prompts.SYSTEM,
            calling_node="classify_tcs_node",
            model_override=model,
        )
        parsed = safe_parse_json(raw)
        validated = ClassificationOutput(**parsed)   # ValidationError → retry
        return {
            **s,
            "tc_classifications": [c.model_dump() for c in validated.tc_classifications],
            "feedback_injected": {
                **(s.get("feedback_injected") or {}),
                "classify_tcs": feedback_examples,
            },
        }

    result = await with_retry(_classify, state, retry_key="tc_retry_count")

    latency_ms = int((time.monotonic() - t0) * 1000)
    await log_node_event(
        run_id=state["run_id"],
        node="classify_tcs",
        attempt=result.get("tc_retry_count", 0) - start_retries,
        provider=state["provider"],
        input_hash=input_hash,
        output_json={"tc_classifications": result.get("tc_classifications") or []},
        latency_ms=latency_ms,
        error=result.get("error"),
    )
    await emit_node_event(run_id=state["run_id"], node="classify_tcs", latency_ms=latency_ms)

    return result
