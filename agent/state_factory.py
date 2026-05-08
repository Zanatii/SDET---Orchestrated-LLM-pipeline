import uuid

from graph.state import AgentState


def create_initial_state(ticket_id: str, run_id: str) -> AgentState:
    return AgentState(
        ticket_id=ticket_id,
        provider='claude',
        run_id=run_id,
        ticket_data=None,
        requirements_analysis=None,
        requirements=None,
        hls_list=None,
        tc_list=None,
        coverage_report=None,
        review_requirements=None,
        review_hls=None,
        review_tcs=None,
        review_coverage=None,
        review_jira=None,
        review_classifications=None,
        review_report=None,
        test_data_requirements=None,
        tc_classifications=None,
        scripts_written=None,
        execution_results=None,
        report=None,
        req_retry_count=0,
        hls_retry_count=0,
        tc_retry_count=0,
        report_retry_count=0,
        changed_hls_ids=None,
        _auto_approved_reason=None,
        feedback_injected={},
        node_providers={},
        error=None,
        project_name=None,
        feature_slug=None,
        skip_steps=[],
        jira_tc_project_key='',
        jira_functional_area='Dubai Justice Platform',
        jira_selected_tc_ids=None,
    )
