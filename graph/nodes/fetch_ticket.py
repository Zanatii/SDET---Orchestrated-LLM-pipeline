import json
import logging

from graph.state import AgentState

logger = logging.getLogger(__name__)


async def fetch_ticket_node(state: AgentState) -> AgentState:
    # TODO(session-5) — JIRA MCP read; populate ticket_data
    logger.info(json.dumps({"event": "node_start", "node": "fetch_ticket", "run_id": state.get("run_id")}))
    return state
