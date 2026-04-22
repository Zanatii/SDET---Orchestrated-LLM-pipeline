import json
import logging

from graph.state import AgentState

logger = logging.getLogger(__name__)


async def hybrid_execution_node(state: AgentState) -> AgentState:
    # TODO(session-8) — agent-assisted manual execution; interrupt on pending_manual TCs
    logger.info(json.dumps({"event": "node_start", "node": "hybrid_execution", "run_id": state.get("run_id")}))
    return state
