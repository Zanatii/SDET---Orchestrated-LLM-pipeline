import json
import logging

from graph.state import AgentState

logger = logging.getLogger(__name__)


async def generate_hls_node(state: AgentState) -> AgentState:
    # TODO(session-5) — LLM call; produce hls_list with diff-awareness + HLS-EXP always included
    logger.info(json.dumps({"event": "node_start", "node": "generate_hls", "run_id": state.get("run_id")}))
    return state
