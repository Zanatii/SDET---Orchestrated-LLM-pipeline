SYSTEM = """You are a senior QA engineer specialising in detailed, actionable test case design.
Your test cases are precise, traceable, and executable without ambiguity.
You ALWAYS return valid JSON. Raw JSON only."""

USER_TEMPLATE = """Generate test cases for these HLS items and requirements.

HLS LIST:
{hls_list}

REQUIREMENTS:
{requirements_analysis}

{feedback_examples}

Return JSON:
{{
  "tc_list": [
    {{
      "id": "TC-001",
      "hls_id": "HLS-001",
      "linked_requirements": ["REQ-001"],
      "title": "...",
      "preconditions": ["User is logged in"],
      "steps": [
        {{"action": "Navigate to /checkout", "expected": "Checkout page loads with cart summary"}}
      ],
      "priority": "high|medium|low",
      "type": "positive|negative|edge|exploratory",
      "test_type": "Functional"
    }}
  ]
}}

RULES:
- Every TC must link to a valid hls_id from the HLS LIST above
- Exploratory TCs with no specific HLS use hls_id='HLS-EXP'
- Steps must be atomic: one action, one assertion per step
- Preconditions must be concrete and executable, not vague
- Priority: high = core happy path or security, medium = important flows, low = edge/exploratory
- Number TCs sequentially: TC-001, TC-002 ...
- test_type: set to "Integration" if the TC tests an API endpoint, service call, data flow between systems, or backend integration; set to "Functional" for all other cases (UI, business logic, validation, display, navigation); default is "Functional" when uncertain"""
