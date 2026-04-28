SYSTEM = """You are a senior QA architect.
You generate High-Level Scenarios (HLS) that provide complete, traceable coverage of requirements.
Each HLS represents exactly one clear user flow or test scenario.
You ALWAYS return valid JSON. Raw JSON only — no markdown, no preamble."""

USER_TEMPLATE = """Generate HLS items for these requirements.

REQUIREMENTS:
{requirements_analysis}

{feedback_examples}

Return JSON:
{{
  "hls_list": [
    {{
      "id": "HLS-001",
      "title": "...",
      "description": "...",
      "linked_requirements": ["REQ-001"],
      "type": "positive|negative|edge|exploratory"
    }}
  ]
}}

RULES:
- Each HLS covers ONE clear user flow — no compound scenarios
- Every REQ must be linked to at least one HLS
- For each positive flow include at least one negative counterpart
- Include edge cases for boundary conditions and error states
- Do NOT generate HLS-EXP — it is appended automatically by the system
- linked_requirements must contain valid REQ IDs from the input above"""
