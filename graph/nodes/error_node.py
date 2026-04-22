import json
import logging

from graph.state import AgentState

logger = logging.getLogger(__name__)


async def error_node(state: AgentState) -> AgentState:
    # TODO(session-11) — interrupt + surface error in UI; offer retry/abort
    logger.info(json.dumps({"event": "node_start", "node": "error", "run_id": state.get("run_id"), "error": state.get("error")}))
    return state
