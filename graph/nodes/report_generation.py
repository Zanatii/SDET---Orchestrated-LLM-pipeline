import json
import logging

from graph.state import AgentState

logger = logging.getLogger(__name__)


async def report_generation_node(state: AgentState) -> AgentState:
    # TODO(session-9) — LLM call; unified report with RCA + S3 pre-signed URLs
    logger.info(json.dumps({"event": "node_start", "node": "report_generation", "run_id": state.get("run_id")}))
    return state
