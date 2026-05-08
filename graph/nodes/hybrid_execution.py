import json
import time
from typing import Optional

from langgraph.types import interrupt
from pydantic import ValidationError  # noqa: F401

from agent.model_router import get_model
from agent.node_logger import compute_input_hash, emit_node_event, log_node_event
from agent.provider import get_node_provider, run_agent
from agent.safe_parse_json import safe_parse_json
from graph.state import AgentState

_SYSTEM = """You are a test execution analyst.
Given a test case and its test data, decide whether automated analysis can determine the pass/fail status.
Return valid JSON only."""

_USER_TEMPLATE = """Analyse this test case for manual/hybrid execution.

TEST CASE:
{tc}

TEST DATA:
{test_data}

EXISTING AUTOMATED RESULTS (may be empty):
{automated_results}

Return JSON:
{{
  "tc_id": "{tc_id}",
  "status": "passed|failed|pending_manual",
  "confidence": 0.0,
  "duration_ms": 0,
  "rca_class": null,
  "rca_detail": null
}}

Rules:
- confidence 0.0–1.0: your certainty in the determined status
- If confidence < 0.7, set status="pending_manual" — a human must decide
- rca_class required for status=failed: assertion_failure|locator_failure|timeout_sync|environment_issue|data_issue
- rca_detail: one paragraph for failed TCs only"""


def _tc_data_for(tc_id: str, test_data_requirements: list[dict]) -> dict:
    for item in test_data_requirements:
        if item.get("tc_id") == tc_id:
            return item
    return {}


def _automated_result_for(tc_id: str, execution_results: list[dict]) -> Optional[dict]:
    for r in execution_results:
        if r.get("tc_id") == tc_id:
            return r
    return None


async def _analyse_one(
    tc: dict,
    test_data: dict,
    automated: Optional[dict],
    provider: str,
    model: str,
) -> dict:
    prompt = _USER_TEMPLATE.format(
        tc=json.dumps(tc, indent=2),
        test_data=json.dumps(test_data, indent=2),
        automated_results=json.dumps(automated or {}, indent=2),
        tc_id=tc.get("id", ""),
    )
    raw = await run_agent(
        prompt=prompt,
        provider=provider,
        system=_SYSTEM,
        calling_node="hybrid_execution_node",
        model_override=model,
    )
    parsed = safe_parse_json(raw)
    return {
        "tc_id": tc.get("id", ""),
        "hls_id": tc.get("hls_id", ""),
        "req_ids": tc.get("linked_requirements", []),
        "status": parsed.get("status", "pending_manual"),
        "confidence": float(parsed.get("confidence", 0.0)),
        "duration_ms": int(parsed.get("duration_ms", 0)),
        "rca_class": parsed.get("rca_class"),
        "rca_detail": parsed.get("rca_detail"),
        "artifact_urls": [],
    }


async def hybrid_execution_node(state: AgentState) -> AgentState:
    if "execute_tests" in (state.get("skip_steps") or []):
        print("[SKIP] execute_tests skipped by user")
        return {**state, "execution_results": []}

    t0 = time.monotonic()

    tc_list = state.get("tc_list") or []
    tc_classifications = state.get("tc_classifications") or []
    test_data_requirements = state.get("test_data_requirements") or []
    existing_results = list(state.get("execution_results") or [])

    # Only process TCs classified as manual or hybrid
    hybrid_tc_ids = {
        c["tc_id"]
        for c in tc_classifications
        if c.get("mode") in ("manual", "hybrid")
    }
    hybrid_tcs = [tc for tc in tc_list if tc.get("id") in hybrid_tc_ids]

    input_hash = compute_input_hash({
        "hybrid_tc_ids": sorted(hybrid_tc_ids),
        "test_data_count": len(test_data_requirements),
    })

    if not hybrid_tcs:
        await log_node_event(
            run_id=state["run_id"],
            node="hybrid_execution",
            attempt=0,
            provider=state["provider"],
            input_hash=input_hash,
            output_json={"skipped": True, "reason": "no manual/hybrid TCs"},
            latency_ms=0,
            error=None,
        )
        return state

    provider = get_node_provider(state, "hybrid_execution_node")
    model = get_model("hybrid_execution_node", provider)

    # LLM analysis pass — one call per TC
    llm_results: list[dict] = []
    for tc in hybrid_tcs:
        tc_id = tc.get("id", "")
        test_data = _tc_data_for(tc_id, test_data_requirements)
        automated = _automated_result_for(tc_id, existing_results)
        try:
            result = await _analyse_one(tc, test_data, automated, provider, model)
        except Exception as exc:
            result = {
                "tc_id": tc_id,
                "hls_id": tc.get("hls_id", ""),
                "req_ids": tc.get("linked_requirements", []),
                "status": "pending_manual",
                "confidence": 0.0,
                "duration_ms": 0,
                "rca_class": None,
                "rca_detail": str(exc)[:200],
                "artifact_urls": [],
            }
        llm_results.append(result)

    # Split: confident results vs those needing human review
    confident: list[dict] = []
    pending_manual: list[dict] = []
    for r in llm_results:
        if r["status"] != "pending_manual" and r["confidence"] >= 0.7:
            confident.append(r)
        else:
            r["status"] = "pending_manual"
            pending_manual.append(r)

    final_results: list[dict] = list(confident)

    if pending_manual:
        # Single interrupt for ALL pending_manual TCs
        human_verdicts: dict = interrupt({
            "pending_manual_tcs": [
                {
                    "tc_id": r["tc_id"],
                    "hls_id": r["hls_id"],
                    "title": next(
                        (tc.get("title", "") for tc in hybrid_tcs if tc.get("id") == r["tc_id"]),
                        "",
                    ),
                    "confidence": r["confidence"],
                    "rca_detail": r["rca_detail"],
                }
                for r in pending_manual
            ]
        })
        # human_verdicts: {tc_id: "manual_passed" | "manual_failed" | "skipped"}
        for r in pending_manual:
            verdict = (human_verdicts or {}).get(r["tc_id"], "skipped")
            if verdict == "manual_passed":
                r["status"] = "passed"
            elif verdict == "manual_failed":
                r["status"] = "failed"
            else:
                r["status"] = "skipped"
            final_results.append(r)

    # Strip internal confidence key before storing — not part of AgentState schema
    for r in final_results:
        r.pop("confidence", None)

    # Merge with existing execution_results; hybrid results append after playwright
    merged = existing_results + final_results

    latency_ms = int((time.monotonic() - t0) * 1000)
    passed = sum(1 for r in final_results if r["status"] == "passed")
    failed = sum(1 for r in final_results if r["status"] == "failed")
    skipped = sum(1 for r in final_results if r["status"] == "skipped")

    await log_node_event(
        run_id=state["run_id"],
        node="hybrid_execution",
        attempt=0,
        provider=state["provider"],
        input_hash=input_hash,
        output_json={
            "total": len(final_results),
            "passed": passed,
            "failed": failed,
            "skipped": skipped,
            "pending_manual_interrupted": len(pending_manual),
        },
        latency_ms=latency_ms,
        error=None,
    )
    await emit_node_event(run_id=state["run_id"], node="hybrid_execution", latency_ms=latency_ms)

    return {**state, "execution_results": merged}
