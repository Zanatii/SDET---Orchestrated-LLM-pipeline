import logging
import os

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from graph.nodes.classify_tcs import classify_tcs_node
from graph.nodes.commit_github import commit_github_node
from graph.nodes.coverage_validation import coverage_validation_node
from graph.nodes.error_node import error_node
from graph.nodes.fetch_ticket import fetch_ticket_node
from graph.nodes.generate_hls import generate_hls_node
from graph.nodes.generate_scripts_node import generate_scripts_node
from graph.nodes.generate_tcs import generate_tcs_node
from graph.nodes.hybrid_execution import hybrid_execution_node
from graph.nodes.playwright_execution import playwright_execution_node
from graph.nodes.report_generation import report_generation_node
from graph.nodes.requirements_analysis import requirements_analysis_node
from graph.nodes.send_email import send_email_node
from graph.nodes.test_data_planning import test_data_planning_node
from graph.nodes.write_jira import write_jira_node
from graph.state import AgentState

logger = logging.getLogger(__name__)

# Seven human-review interrupt gates, declared at compile time.
# The graph pauses BEFORE each node listed here; the API resumes it after
# the matching review_* field is written into state.
_INTERRUPT_BEFORE = [
    "generate_hls",        # gate: review_requirements
    "generate_tcs",        # gate: review_hls
    "coverage_validation", # gate: review_tcs
    "classify_tcs",        # gate: review_coverage
    "test_data_planning",  # gate: review_classifications
    "generate_scripts",    # gate: review_scripts
    "write_jira",          # gate: review_report
]


def execution_router(state: AgentState) -> str:
    # TODO(session-8) — route by tc_classifications: "auto" → playwright,
    #   "manual" → hybrid, "mixed" → playwright (then hybrid in sequence)
    return "playwright"


def _compile(checkpointer):
    builder = StateGraph(AgentState)

    # ── Register all nodes ───────────────────────────────────────────────
    builder.add_node("fetch_ticket", fetch_ticket_node)
    builder.add_node("requirements_analysis", requirements_analysis_node)
    builder.add_node("generate_hls", generate_hls_node)
    builder.add_node("generate_tcs", generate_tcs_node)
    builder.add_node("coverage_validation", coverage_validation_node)
    builder.add_node("classify_tcs", classify_tcs_node)
    builder.add_node("test_data_planning", test_data_planning_node)
    builder.add_node("generate_scripts", generate_scripts_node)
    builder.add_node("playwright_execution", playwright_execution_node)
    builder.add_node("hybrid_execution", hybrid_execution_node)
    builder.add_node("report_generation", report_generation_node)
    builder.add_node("write_jira", write_jira_node)
    builder.add_node("commit_github", commit_github_node)
    builder.add_node("send_email", send_email_node)
    builder.add_node("error", error_node)  # dead-end; reachable via future retry-cap routing

    # ── Entry point ──────────────────────────────────────────────────────
    builder.set_entry_point("fetch_ticket")

    # ── Phase 1: requirements → test design (serialized, no branches) ────
    builder.add_edge("fetch_ticket", "requirements_analysis")
    builder.add_edge("requirements_analysis", "generate_hls")
    builder.add_edge("generate_hls", "generate_tcs")
    builder.add_edge("generate_tcs", "coverage_validation")
    builder.add_edge("coverage_validation", "classify_tcs")
    builder.add_edge("classify_tcs", "test_data_planning")

    # ── Phase 2: script generation → human gate → live execution ────────
    builder.add_edge("test_data_planning", "generate_scripts")
    builder.add_edge("generate_scripts", "playwright_execution")
    builder.add_edge("playwright_execution", "hybrid_execution")

    # ── Phase 2: reporting + outputs ─────────────────────────────────────
    builder.add_edge("hybrid_execution", "report_generation")
    builder.add_edge("report_generation", "write_jira")
    builder.add_edge("write_jira", "commit_github")
    builder.add_edge("commit_github", "send_email")
    builder.add_edge("send_email", END)

    return builder.compile(
        checkpointer=checkpointer,
        interrupt_before=_INTERRUPT_BEFORE,
    )


# Module-level graph uses MemorySaver so `from graph.builder import graph`
# works without a running database.  FastAPI startup (Session 6) will call
# _compile() again with AsyncPostgresSaver once the connection pool is ready.
graph = _compile(MemorySaver())
