"""Offline logic verification for generate_hls_node — no external packages needed."""
import asyncio
import hashlib
import json
import sys
import types

# ── Stub pydantic ──────────────────────────────────────────────────────────────
pydantic_mod = types.ModuleType("pydantic")


class ValidationError(Exception):
    pass


class BaseModel:
    model_config = {}

    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)

    def model_dump(self):
        return {k: getattr(self, k) for k in dir(self) if not k.startswith("_")}


pydantic_mod.ValidationError = ValidationError
pydantic_mod.BaseModel = BaseModel
pydantic_mod.ConfigDict = dict
sys.modules["pydantic"] = pydantic_mod

# ── Stub agent packages ────────────────────────────────────────────────────────
for mod in ("agent", "agent.node_logger", "agent.provider", "agent.retry", "agent.schemas", "graph.state"):
    sys.modules[mod] = types.ModuleType(mod)


def compute_input_hash(d):
    return hashlib.sha256(json.dumps(d, sort_keys=True).encode()).hexdigest()[:16]


async def log_node_event(**kw):
    pass


sys.modules["agent.node_logger"].compute_input_hash = compute_input_hash
sys.modules["agent.node_logger"].log_node_event = log_node_event


async def with_retry(fn, state, max_retries=3, retry_key="req_retry_count"):
    last_exc = None
    for attempt in range(max_retries):
        try:
            return await fn(state)
        except Exception as exc:
            last_exc = exc
            state = {**state, retry_key: state.get(retry_key, 0) + 1}
    return {**state, "error": str(last_exc)}


sys.modules["agent.retry"].with_retry = with_retry


class HLSItem:
    def __init__(self, **kw):
        self.id = kw["id"]
        self.title = kw["title"]
        self.description = kw["description"]
        self.linked_requirements = kw["linked_requirements"]
        self.type = kw["type"]

    def model_dump(self):
        return {
            "id": self.id, "title": self.title, "description": self.description,
            "linked_requirements": self.linked_requirements, "type": self.type,
        }


class HLSOutput:
    def __init__(self, **kw):
        self.hls_list = [HLSItem(**h) for h in kw["hls_list"]]


sys.modules["agent.schemas"].HLSItem = HLSItem
sys.modules["agent.schemas"].HLSOutput = HLSOutput
sys.modules["graph.state"].AgentState = dict
# generate_hls.py does `from agent.provider import run_agent` at module load —
# the attribute must exist on the stub before the import happens.
sys.modules["agent.provider"].run_agent = None

# ── Import real node ───────────────────────────────────────────────────────────
import graph.nodes.generate_hls as _hls_mod  # noqa: E402
from graph.nodes.generate_hls import generate_hls_node, _HLS_EXP  # noqa: E402

_BASE = {
    "ticket_id": "TEST-1", "provider": "claude",
    "run_id": "aaaaaaaa-0000-0000-0000-000000000001",
    "hls_retry_count": 0, "req_retry_count": 0,
    "tc_retry_count": 0, "report_retry_count": 0,
    "requirements_analysis": {"requirements": [{"id": "REQ-001", "text": "Login"}]},
    "changed_hls_ids": None, "hls_list": None,
}


def _set_llm(response_json: str):
    async def _fake(**kw):
        return response_json
    # Patch the name inside generate_hls's own module namespace (already bound at import time)
    _hls_mod.run_agent = _fake


# ── Test 1: HLS-EXP always last ───────────────────────────────────────────────
_set_llm(json.dumps({"hls_list": [
    {"id": "HLS-001", "title": "Happy path", "description": "d",
     "linked_requirements": ["REQ-001"], "type": "positive"},
    {"id": "HLS-002", "title": "Bad password", "description": "d",
     "linked_requirements": ["REQ-001"], "type": "negative"},
]}))
r = asyncio.run(generate_hls_node(dict(_BASE)))
hls = r["hls_list"]
assert hls[-1]["id"] == "HLS-EXP", f"Last item is {hls[-1]['id']}, expected HLS-EXP"
assert len(hls) == 3
print("PASS test1: HLS-EXP always last, count =", len(hls))

# ── Test 2: LLM-generated HLS-EXP stripped before system version appended ─────
_set_llm(json.dumps({"hls_list": [
    {"id": "HLS-001", "title": "H", "description": "d",
     "linked_requirements": ["REQ-001"], "type": "positive"},
    {"id": "HLS-EXP", "title": "LLM exploratory", "description": "d",
     "linked_requirements": [], "type": "exploratory"},
]}))
r2 = asyncio.run(generate_hls_node(dict(_BASE)))
hls2 = r2["hls_list"]
assert hls2[-1] == _HLS_EXP, "System HLS-EXP not appended"
assert len(hls2) == 2, f"Expected 2 (HLS-001 + system HLS-EXP), got {len(hls2)}"
print("PASS test2: LLM HLS-EXP stripped, system version appended, count =", len(hls2))

# ── Test 3: Diff mode — HLS-001 preserved, HLS-002 regenerated ───────────────
existing = [
    {"id": "HLS-001", "title": "Original HLS-001", "description": "preserved",
     "linked_requirements": ["REQ-001"], "type": "positive"},
    {"id": "HLS-002", "title": "Old HLS-002", "description": "to be replaced",
     "linked_requirements": ["REQ-001"], "type": "negative"},
    dict(_HLS_EXP),
]
_set_llm(json.dumps({"hls_list": [
    {"id": "HLS-002", "title": "New HLS-002", "description": "regenerated",
     "linked_requirements": ["REQ-001"], "type": "edge"},
]}))
diff_state = {**_BASE, "changed_hls_ids": ["HLS-002"], "hls_list": existing}
r3 = asyncio.run(generate_hls_node(diff_state))
hls3 = r3["hls_list"]
assert hls3[0]["id"] == "HLS-001", f"First should be HLS-001, got {hls3[0]['id']}"
assert hls3[0]["title"] == "Original HLS-001", "HLS-001 not preserved"
assert hls3[1]["id"] == "HLS-002", f"Second should be HLS-002, got {hls3[1]['id']}"
assert hls3[1]["title"] == "New HLS-002", "HLS-002 not regenerated"
assert hls3[-1]["id"] == "HLS-EXP", "HLS-EXP not last in diff mode"
print("PASS test3: diff mode — order:", [h["id"] for h in hls3])

# ── Test 4: Missing linked_requirements retried to exhaustion ─────────────────
_set_llm(json.dumps({"hls_list": [
    {"id": "HLS-001", "title": "H", "description": "d",
     "linked_requirements": [], "type": "positive"},
]}))
r4 = asyncio.run(generate_hls_node(dict(_BASE)))
assert "error" in r4, "Expected error key"
assert r4["hls_retry_count"] == 3, f"Expected 3 retries, got {r4['hls_retry_count']}"
print("PASS test4: missing linked_requirements -> ValueError -> retried 3x -> error key set")

print("\nAll offline verify tests passed.")
