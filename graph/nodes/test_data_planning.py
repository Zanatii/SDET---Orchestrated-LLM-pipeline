import json
import time

from pydantic import ValidationError  # noqa: F401 — propagates through with_retry

from agent.feedback_retriever import get_feedback_examples
from agent.model_router import get_model
from agent.node_logger import compute_input_hash, log_node_event
from agent.provider import run_agent
from agent.retry import with_retry
from agent.safe_parse_json import safe_parse_json
from agent.schemas import TestDataOutput
from agent.prompts import test_data_planning as prompts
from graph.state import AgentState

_SENSITIVE_KEYWORDS: frozenset[str] = frozenset({
    "password", "token", "secret", "key", "credential", "auth", "ssn", "card",
})


def _enforce_sensitivity(items: list[dict]) -> list[dict]:
    """Guarantee sensitive=True for any field whose name matches a keyword.
    The LLM prompt already asks for this; this enforces it unconditionally."""
    result = []
    for item in items:
        new_fields = []
        for f in item.get("fields", []):
            name = f.get("field", "").lower()
            is_sensitive = any(kw in name for kw in _SENSITIVE_KEYWORDS)
            new_fields.append({**f, "sensitive": is_sensitive or bool(f.get("sensitive"))})
        result.append({**item, "fields": new_fields})
    return result


async def test_data_planning_node(state: AgentState) -> AgentState:
    t0 = time.monotonic()
    tc_list = state.get("tc_list") or []
    tc_classifications = state.get("tc_classifications") or []
    start_retries = state.get("tc_retry_count", 0)
    input_hash = compute_input_hash({
        "tc_list": tc_list,
        "tc_classifications": tc_classifications,
    })

    async def _plan(s: AgentState) -> AgentState:
        model = get_model("test_data_planning_node", s["provider"])
        feedback_examples = await get_feedback_examples(
            node="test_data_planning",
            ticket_type=(s.get("ticket_data") or {}).get("type"),
        )
        prompt = prompts.USER_TEMPLATE.format(
            tc_list=json.dumps(s.get("tc_list") or [], indent=2),
            tc_classifications=json.dumps(s.get("tc_classifications") or [], indent=2),
            feedback_examples=feedback_examples,
        )
        raw = await run_agent(
            prompt=prompt,
            provider=s["provider"],
            system=prompts.SYSTEM,
            calling_node="test_data_planning_node",
            model_override=model,
        )
        parsed = safe_parse_json(raw)
        validated = TestDataOutput(**parsed)   # ValidationError → retry
        items = _enforce_sensitivity([td.model_dump() for td in validated.test_data_requirements])
        return {
            **s,
            "test_data_requirements": items,
            "feedback_injected": {
                **(s.get("feedback_injected") or {}),
                "test_data_planning": feedback_examples,
            },
        }

    result = await with_retry(_plan, state, retry_key="tc_retry_count")

    latency_ms = int((time.monotonic() - t0) * 1000)
    await log_node_event(
        run_id=state["run_id"],
        node="test_data_planning",
        attempt=result.get("tc_retry_count", 0) - start_retries,
        provider=state["provider"],
        input_hash=input_hash,
        output_json={"test_data_requirements": result.get("test_data_requirements") or []},
        latency_ms=latency_ms,
        error=result.get("error"),
    )

    return result
