from typing import List, Literal, Optional, TypedDict


class AgentState(TypedDict):
    # Meta
    ticket_id:              str
    provider:               Literal["claude", "grok", "groq"]
    run_id:                 str
    # Phase 1 outputs
    ticket_data:            Optional[dict]
    requirements_analysis:  Optional[dict]
    requirements:           Optional[str]
    hls_list:               Optional[List[dict]]
    tc_list:                Optional[List[dict]]
    coverage_report:        Optional[dict]
    # Human gate decisions
    review_requirements:    Optional[dict]
    review_hls:             Optional[dict]
    review_tcs:             Optional[dict]
    review_coverage:        Optional[dict]
    review_jira:            Optional[dict]
    review_classifications: Optional[dict]
    review_scripts:         Optional[dict]
    review_report:          Optional[dict]
    # Phase 2 outputs
    test_data_requirements: Optional[List[dict]]
    tc_classifications:     Optional[List[dict]]
    generated_scripts:      Optional[List[dict]]
    scripts_written:        Optional[List[dict]]
    execution_results:      Optional[List[dict]]
    report:                 Optional[dict]
    # Retry counters (start at 0)
    req_retry_count:        int
    hls_retry_count:        int
    tc_retry_count:         int
    report_retry_count:     int
    # Project-aware script organisation
    project_name:           Optional[str]
    feature_slug:           Optional[str]
    # Internal flags
    changed_hls_ids:        Optional[List[str]]
    _auto_approved_reason:  Optional[str]
    error:                  Optional[str]
    feedback_injected:      Optional[dict]
    node_providers:         Optional[dict]
    skip_steps:             Optional[List[str]]
    # Jira output configuration
    jira_tc_project_key:    str
    jira_functional_area:   str
    jira_selected_tc_ids:   Optional[List[str]]
    # Optional Figma/UI screenshots (base64-encoded, sent to Proxi)
    figma_images:           Optional[List[str]]
