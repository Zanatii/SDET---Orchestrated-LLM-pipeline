import os
import time

from agent.node_logger import compute_input_hash, log_node_event
from graph.state import AgentState


async def coverage_validation_node(state: AgentState) -> AgentState:
    t0 = time.monotonic()
    hls_list: list = state.get("hls_list") or []
    tc_list: list = state.get("tc_list") or []
    requirements_analysis: dict = state.get("requirements_analysis") or {}

    input_hash = compute_input_hash({
        "hls_list": hls_list,
        "tc_list": tc_list,
        "requirements_analysis": requirements_analysis,
    })

    threshold = int(os.getenv("COVERAGE_THRESHOLD", "90"))

    # --- Requirements coverage ---
    all_req_ids = {r["id"] for r in requirements_analysis.get("requirements", [])}
    total_requirements = len(all_req_ids)

    covered_req_ids: set[str] = set()
    for h in hls_list:
        if h.get("id") == "HLS-EXP":
            continue
        for req_id in h.get("linked_requirements", []):
            covered_req_ids.add(req_id)

    uncovered_requirements = sorted(all_req_ids - covered_req_ids)
    coverage_percentage = (
        (len(covered_req_ids) / total_requirements * 100) if total_requirements else 100.0
    )

    # --- HLS without TCs ---
    valid_hls_ids = {h["id"] for h in hls_list}
    hls_covered_by_tcs: set[str] = {tc["hls_id"] for tc in tc_list if tc.get("hls_id")}

    exploratory_tc_count = sum(1 for tc in tc_list if tc.get("hls_id") == "HLS-EXP")

    hls_without_tcs: list[str] = []
    for h in hls_list:
        hid = h.get("id")
        if hid == "HLS-EXP":
            continue  # always exempt — catch-all bucket need not have TCs
        if hid not in hls_covered_by_tcs:
            hls_without_tcs.append(hid)

    # --- Orphan TCs ---
    orphan_tcs = [
        tc["id"] for tc in tc_list
        if tc.get("hls_id") not in valid_hls_ids
    ]

    # --- Exploratory ratio ---
    total_tc_count = len(tc_list)
    exploratory_tc_ratio = (
        exploratory_tc_count / total_tc_count if total_tc_count else 0.0
    )
    exploratory_cap_exceeded = exploratory_tc_ratio > 0.20

    # --- Traceability errors ---
    traceability_errors: list[str] = []
    if uncovered_requirements:
        traceability_errors.append(
            f"Requirements with no HLS link: {uncovered_requirements}"
        )
    if hls_without_tcs:
        traceability_errors.append(
            f"HLS items with no TCs: {hls_without_tcs}"
        )
    if orphan_tcs:
        traceability_errors.append(
            f"Orphan TCs (unknown hls_id): {orphan_tcs}"
        )
    if exploratory_cap_exceeded:
        traceability_errors.append(
            f"WARNING: exploratory TC ratio {exploratory_tc_ratio:.1%} exceeds 20% cap "
            f"({exploratory_tc_count}/{total_tc_count} TCs). Review exploratory coverage."
        )

    # --- Phase 2 gate ---
    phase2_unlocked = coverage_percentage >= threshold and len(orphan_tcs) == 0

    coverage_report = {
        "total_requirements": total_requirements,
        "covered_requirements": sorted(covered_req_ids),
        "uncovered_requirements": uncovered_requirements,
        "hls_without_tcs": sorted(hls_without_tcs),
        "orphan_tcs": sorted(orphan_tcs),
        "traceability_errors": traceability_errors,
        "coverage_percentage": round(coverage_percentage, 2),
        "threshold": threshold,
        "phase2_unlocked": phase2_unlocked,
        "exploratory_tc_ratio": round(exploratory_tc_ratio, 4),
        "exploratory_cap_exceeded": exploratory_cap_exceeded,
    }

    latency_ms = int((time.monotonic() - t0) * 1000)
    await log_node_event(
        run_id=state["run_id"],
        node="coverage_validation",
        attempt=0,
        provider="none",
        input_hash=input_hash,
        output_json=coverage_report,
        latency_ms=latency_ms,
        error=None,
    )

    return {**state, "coverage_report": coverage_report}
