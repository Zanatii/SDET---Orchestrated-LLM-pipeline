import json
import re
import time

from pydantic import ValidationError  # noqa: F401 — propagates through with_retry

from agent.node_logger import compute_input_hash, log_node_event
from agent.provider import run_agent
from agent.retry import with_retry
from agent.schemas import TCItem, TCOutput
from graph.state import AgentState

_SYSTEM = (
    "You are an expert SDET. Generate detailed test cases from High-Level Scenarios. "
    "Return ONLY valid JSON — no markdown fences, no explanation."
)


# ── Prompt builders ────────────────────────────────────────────────────────────

def _build_full_prompt(requirements_analysis: dict, hls_list: list) -> str:
    req_lines = "\n".join(
        f"  {r['id']}: {r['text']}"
        for r in requirements_analysis.get("requirements", [])
    )
    hls_lines = "\n".join(
        f"  {h['id']} ({h.get('type','')}): {h['title']} — links: {h.get('linked_requirements', [])}"
        for h in hls_list if h.get("id") != "HLS-EXP"
    )
    return f"""Generate test cases for ALL High-Level Scenarios.

REQUIREMENTS:
{req_lines}

HIGH-LEVEL SCENARIOS:
{hls_lines}
  HLS-EXP: Exploratory Testing (catch-all for TCs with no specific HLS link)

Return JSON matching this exact schema (no extra keys, no markdown):
{{
  "tc_list": [
    {{
      "id": "TC-001",
      "hls_id": "HLS-001",
      "linked_requirements": ["REQ-001"],
      "title": "<what is tested>",
      "preconditions": ["<condition 1>"],
      "steps": [{{"action": "<do this>", "expected": "<see this>"}}],
      "priority": "<high|medium|low>",
      "type": "<positive|negative|edge|exploratory>"
    }}
  ]
}}

Rules:
- Sequential IDs: TC-001, TC-002, TC-003 …
- hls_id MUST be one of the HLS IDs listed above
- Exploratory TCs with no specific HLS: use hls_id="HLS-EXP"
- priority  ∈ {{high, medium, low}}
- type      ∈ {{positive, negative, edge, exploratory}}
- At least 1 step per TC; preconditions may be empty list []
"""


def _build_diff_prompt(
    requirements_analysis: dict,
    hls_list: list,
    changed_ids: list,
    preserved_tcs: list,
    start_num: int,
) -> str:
    req_lines = "\n".join(
        f"  {r['id']}: {r['text']}"
        for r in requirements_analysis.get("requirements", [])
    )
    changed_hls = [h for h in hls_list if h.get("id") in changed_ids]
    hls_lines = "\n".join(
        f"  {h['id']} ({h.get('type','')}): {h['title']} — links: {h.get('linked_requirements', [])}"
        for h in changed_hls
    )
    preserved_ids = [tc["id"] for tc in preserved_tcs]
    return f"""Regenerate test cases ONLY for these HLS IDs: {changed_ids}

REQUIREMENTS:
{req_lines}

HLS ITEMS TO COVER:
{hls_lines}

PRESERVED TCs (already exist, do NOT duplicate their IDs):
{preserved_ids or '(none)'}

Start numbering new TCs from TC-{start_num:03d}.

Return JSON containing ONLY the new TCs:
{{
  "tc_list": [
    {{
      "id": "TC-{start_num:03d}",
      "hls_id": "<one of: {changed_ids}>",
      "linked_requirements": ["REQ-001"],
      "title": "<what is tested>",
      "preconditions": [],
      "steps": [{{"action": "<do this>", "expected": "<see this>"}}],
      "priority": "<high|medium|low>",
      "type": "<positive|negative|edge|exploratory>"
    }}
  ]
}}

Rules:
- Only output TCs for hls_id in: {changed_ids}
- hls_id MUST be one of the IDs listed above (or HLS-EXP for exploratory)
- Do NOT reuse any IDs from the preserved list: {preserved_ids}
"""


# ── Helpers ────────────────────────────────────────────────────────────────────

def _strip_fences(raw: str) -> str:
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`").strip()
    if not cleaned.startswith("{"):
        m = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if m:
            cleaned = m.group()
    return cleaned


def _tc_sort_key(tc_id: str) -> tuple:
    parts = tc_id.split("-")
    try:
        return (0, int(parts[-1]))
    except (ValueError, IndexError):
        return (1, tc_id)


def _max_tc_number(tcs: list) -> int:
    nums = []
    for tc in tcs:
        try:
            nums.append(int(tc["id"].split("-")[-1]))
        except (ValueError, KeyError, IndexError):
            pass
    return max(nums) if nums else 0


def _validate_hls_ids(tcs: list[TCItem], valid_hls_ids: set) -> None:
    """Every TC's hls_id must exist in hls_list (ValueError → retry)."""
    bad = [tc.id for tc in tcs if tc.hls_id not in valid_hls_ids]
    if bad:
        raise ValueError(f"TCs reference unknown hls_id: {bad}. Valid IDs: {sorted(valid_hls_ids)}")


# ── Node ───────────────────────────────────────────────────────────────────────

async def generate_tcs_node(state: AgentState) -> AgentState:
    t0 = time.monotonic()
    hls_list: list = state.get("hls_list") or []
    requirements_analysis: dict = state.get("requirements_analysis") or {}
    changed_ids: list = state.get("changed_hls_ids") or []
    diff_mode = bool(changed_ids)
    start_retries = state.get("tc_retry_count", 0)
    input_hash = compute_input_hash({
        "hls_list": hls_list,
        "requirements_analysis": requirements_analysis,
        "changed_hls_ids": changed_ids,
    })

    valid_hls_ids = {h["id"] for h in hls_list}

    async def _generate(s: AgentState) -> AgentState:
        s_hls = s.get("hls_list") or []
        s_req = s.get("requirements_analysis") or {}
        s_changed = s.get("changed_hls_ids") or []

        preserved_tcs = (
            [tc for tc in (s.get("tc_list") or []) if tc.get("hls_id") not in s_changed]
            if diff_mode else []
        )

        if diff_mode:
            start_num = _max_tc_number(preserved_tcs) + 1
            prompt = _build_diff_prompt(s_req, s_hls, s_changed, preserved_tcs, start_num)
        else:
            prompt = _build_full_prompt(s_req, s_hls)

        raw = await run_agent(
            prompt=prompt,
            provider=s["provider"],
            system=_SYSTEM,
            calling_node="generate_tcs_node",
        )

        parsed = json.loads(_strip_fences(raw))
        validated = TCOutput(**parsed)                    # ValidationError → retry
        _validate_hls_ids(validated.tc_list, valid_hls_ids)  # ValueError → retry

        new_tcs = [tc.model_dump() for tc in validated.tc_list]

        if diff_mode:
            merged = sorted(preserved_tcs + new_tcs, key=lambda tc: _tc_sort_key(tc["id"]))
        else:
            merged = sorted(new_tcs, key=lambda tc: _tc_sort_key(tc["id"]))

        return {**s, "tc_list": merged}

    result = await with_retry(_generate, state, retry_key="tc_retry_count")

    latency_ms = int((time.monotonic() - t0) * 1000)
    await log_node_event(
        run_id=state["run_id"],
        node="generate_tcs",
        attempt=result.get("tc_retry_count", 0) - start_retries,
        provider=state["provider"],
        input_hash=input_hash,
        output_json={"tc_list": result.get("tc_list") or []},
        latency_ms=latency_ms,
        error=result.get("error"),
    )

    return result
