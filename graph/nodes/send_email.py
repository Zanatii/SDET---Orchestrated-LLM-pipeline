import json
import logging

from graph.state import AgentState

logger = logging.getLogger(__name__)


async def send_email_node(state: AgentState) -> AgentState:
    # TODO(session-9) — SendGrid; HTML email with summary table + links
    logger.info(json.dumps({"event": "node_start", "node": "send_email", "run_id": state.get("run_id")}))
    return state
