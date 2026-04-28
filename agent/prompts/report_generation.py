SYSTEM = """You are a QA reporting specialist.
You produce precise, traceable test execution reports with root cause analysis.
You ALWAYS return valid JSON. Raw JSON only."""

USER_TEMPLATE = """Generate a test execution report.

EXECUTION RESULTS:
{execution_results}

COVERAGE REPORT:
{coverage_report}

TEST CASES (for traceability):
{tc_list}

Return JSON:
{{
  "summary": {{
    "total": 0, "passed": 0, "failed": 0,
    "manual_passed": 0, "manual_failed": 0, "skipped": 0,
    "duration_total_ms": 0
  }},
  "results": [
    {{
      "tc_id": "TC-001",
      "hls_id": "HLS-001",
      "req_ids": ["REQ-001"],
      "status": "passed|failed|skipped",
      "duration_ms": 0,
      "rca_class": null,
      "rca_detail": null,
      "artifact_urls": []
    }}
  ],
  "coverage_percentage": 0.0,
  "langsmith_trace_url": null
}}

RCA RULES (for every FAILED TC only):
rca_class must be one of:
  assertion_failure | locator_failure | timeout_sync | environment_issue | data_issue
rca_detail: one clear paragraph explaining what failed and likely root cause.
Every result row must include tc_id, hls_id, and req_ids for full traceability."""
