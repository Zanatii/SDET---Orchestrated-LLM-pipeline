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


def make_skippable_node(node_fn, skip_key: str):
    """Wrap a node so it returns immediately when skip_key is in state.skip_steps."""
    async def wrapper(state: AgentState) -> AgentState:
        skip_steps = state.get("skip_steps") or []
        if skip_key in skip_steps:
            print(f"[SKIP] {skip_key} — skipped by user")
            return state
        return await node_fn(state)
    return wrapper


def _skip_scripts_router(state: AgentState) -> str:
    """After test_data_planning: bypass generate_scripts interrupt when skipped."""
    if "generate_scripts" in (state.get("skip_steps") or []):
        return "playwright_execution"
    return "generate_scripts"


# Eight human-review interrupt gates, declared at compile time.
# The graph pauses BEFORE each node listed here; the API resumes it after
# the matching review_* field is written into state.
_INTERRUPT_BEFORE = [
    "generate_hls",        # gate: review_requirements
    "generate_tcs",        # gate: review_hls
    "coverage_validation", # gate: review_tcs
    "write_jira",          # gate: review_jira  (Phase 1 end — preview before creating JIRA sub-tasks)
    "test_data_planning",  # gate: review_classifications
    "generate_scripts",    # gate: review_scripts
    "commit_github",       # gate: review_report (Phase 2 end — was write_jira)
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
    builder.add_node("test_data_planning", make_skippable_node(test_data_planning_node, "test_data_planning"))
    builder.add_node("generate_scripts", generate_scripts_node)
    builder.add_node("playwright_execution", make_skippable_node(playwright_execution_node, "generate_scripts"))
    builder.add_node("hybrid_execution", make_skippable_node(hybrid_execution_node, "execute_tests"))
    builder.add_node("report_generation", report_generation_node)
    builder.add_node("write_jira", write_jira_node)
    builder.add_node("commit_github", commit_github_node)
    builder.add_node("send_email", send_email_node)
    builder.add_node("error", error_node)  # dead-end; reachable via future retry-cap routing

    # ── Entry point ──────────────────────────────────────────────────────
    builder.set_entry_point("fetch_ticket")

    # ── Phase 1: requirements → test design → write JIRA ────────────────
    builder.add_edge("fetch_ticket", "requirements_analysis")
    builder.add_edge("requirements_analysis", "generate_hls")
    builder.add_edge("generate_hls", "generate_tcs")
    builder.add_edge("generate_tcs", "coverage_validation")
    builder.add_edge("coverage_validation", "write_jira")
    builder.add_edge("write_jira", "classify_tcs")
    builder.add_edge("classify_tcs", "test_data_planning")

    # ── Phase 2: script generation → human gate → live execution ────────
    # Conditional: skip straight to playwright_execution when generate_scripts is in skip_steps,
    # bypassing the review_scripts interrupt_before gate entirely.
    builder.add_conditional_edges(
        "test_data_planning",
        _skip_scripts_router,
        {"generate_scripts": "generate_scripts", "playwright_execution": "playwright_execution"},
    )
    builder.add_edge("generate_scripts", "playwright_execution")
    builder.add_edge("playwright_execution", "hybrid_execution")

    # ── Phase 2: reporting + outputs ─────────────────────────────────────
    builder.add_edge("hybrid_execution", "report_generation")
    builder.add_edge("report_generation", "commit_github")
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
