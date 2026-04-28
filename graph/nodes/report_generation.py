import json
import time

from pydantic import ValidationError  # noqa: F401 — propagates through with_retry

from agent.feedback_retriever import get_feedback_examples
from agent.model_router import get_model
from agent.node_logger import compute_input_hash, log_node_event
from agent.provider import run_agent
from agent.retry import with_retry
from agent.safe_parse_json import safe_parse_json
from agent.schemas import ReportOutput
from agent.prompts import report_generation as prompts
from graph.state import AgentState
from scripts.s3_upload import generate_presigned_url


async def _resolve_artifact_urls(urls: list[str]) -> list[str]:
    resolved = []
    for url in urls:
        if url.startswith("s3://"):
            try:
                presigned = await generate_presigned_url(url, expires_in=3600)
                resolved.append(presigned)
            except Exception:
                resolved.append(url)  # fall back to raw s3:// on error
        else:
            resolved.append(url)
    return resolved


async def report_generation_node(state: AgentState) -> AgentState:
    t0 = time.monotonic()
    execution_results = state.get("execution_results") or []
    coverage_report = state.get("coverage_report") or {}
    tc_list = state.get("tc_list") or []
    start_retries = state.get("report_retry_count", 0)
    input_hash = compute_input_hash({
        "execution_count": len(execution_results),
        "tc_count": len(tc_list),
    })

    async def _generate(s: AgentState) -> AgentState:
        model = get_model("report_generation_node", s["provider"])
        feedback_examples = await get_feedback_examples(
            node="report_generation",
            ticket_type=(s.get("ticket_data") or {}).get("type"),
        )
        # USER_TEMPLATE has no {feedback_examples} placeholder — extra kwarg is silently ignored
        prompt = prompts.USER_TEMPLATE.format(
            execution_results=json.dumps(s.get("execution_results") or [], indent=2),
            coverage_report=json.dumps(s.get("coverage_report") or {}, indent=2),
            tc_list=json.dumps(s.get("tc_list") or [], indent=2),
            feedback_examples=feedback_examples,
        )
        raw = await run_agent(
            prompt=prompt,
            provider=s["provider"],
            system=prompts.SYSTEM,
            calling_node="report_generation_node",
            model_override=model,
        )
        parsed = safe_parse_json(raw)
        validated = ReportOutput(**parsed)   # ValidationError → retry

        # Resolve artifact URLs: s3:// → presigned HTTPS, HTTPS → pass through
        resolved_results = []
        for item in validated.results:
            item_dict = item.model_dump()
            item_dict["artifact_urls"] = await _resolve_artifact_urls(item_dict["artifact_urls"])
            resolved_results.append(item_dict)

        report = {
            "summary": validated.summary,
            "results": resolved_results,
            "coverage_percentage": validated.coverage_percentage,
            "langsmith_trace_url": validated.langsmith_trace_url,
        }
        return {**s, "report": report}

    result = await with_retry(
        _generate, state, max_retries=2, retry_key="report_retry_count"
    )

    latency_ms = int((time.monotonic() - t0) * 1000)
    report = result.get("report") or {}
    summary = report.get("summary") or {}

    await log_node_event(
        run_id=state["run_id"],
        node="report_generation",
        attempt=result.get("report_retry_count", 0) - start_retries,
        provider=state["provider"],
        input_hash=input_hash,
        output_json={
            "summary": summary,
            "coverage_percentage": report.get("coverage_percentage"),
            "results_count": len(report.get("results") or []),
        },
        latency_ms=latency_ms,
        error=result.get("error"),
    )

    return result
