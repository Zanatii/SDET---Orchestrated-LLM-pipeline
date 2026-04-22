import json
import logging

from graph.state import AgentState

logger = logging.getLogger(__name__)


async def requirements_analysis_node(state: AgentState) -> AgentState:
    # TODO(session-5) — LLM call; extract REQ-001... JSON into requirements_analysis + requirements
    logger.info(json.dumps({"event": "node_start", "node": "requirements_analysis", "run_id": state.get("run_id")}))
    return state
