import json
import logging

from graph.state import AgentState

logger = logging.getLogger(__name__)


async def test_data_planning_node(state: AgentState) -> AgentState:
    # TODO(session-7) — LLM call; produce test_data_requirements keyed by classification mode
    logger.info(json.dumps({"event": "node_start", "node": "test_data_planning", "run_id": state.get("run_id")}))
    return state
