import json
import logging

from graph.state import AgentState

logger = logging.getLogger(__name__)


async def classify_tcs_node(state: AgentState) -> AgentState:
    # TODO(session-7) — LLM call; classify each TC as auto/manual/hybrid with confidence score
    logger.info(json.dumps({"event": "node_start", "node": "classify_tcs", "run_id": state.get("run_id")}))
    return state
