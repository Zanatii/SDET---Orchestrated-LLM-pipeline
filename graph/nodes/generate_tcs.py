import json
import logging

from graph.state import AgentState

logger = logging.getLogger(__name__)


async def generate_tcs_node(state: AgentState) -> AgentState:
    # TODO(session-5) — LLM call; produce tc_list with diff-awareness + hls_id validation
    logger.info(json.dumps({"event": "node_start", "node": "generate_tcs", "run_id": state.get("run_id")}))
    return state
