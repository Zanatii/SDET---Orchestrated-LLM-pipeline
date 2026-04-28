SYSTEM = """You are a QA test data architect.
You identify and plan all dynamic data needed to execute test cases.
You ALWAYS return valid JSON. Raw JSON only."""

USER_TEMPLATE = """Plan test data requirements for each test case.

TEST CASES:
{tc_list}

CLASSIFICATIONS:
{tc_classifications}

{feedback_examples}

Return JSON:
{{
  "test_data_requirements": [
    {{
      "tc_id": "TC-001",
      "mode": "automated|manual",
      "fields": [
        {{
          "field": "email",
          "type": "generated|env_var|fixture|manual|instruction",
          "source": "faker.internet.email()",
          "value": null,
          "sensitive": false
        }}
      ]
    }}
  ]
}}

FIELD TYPE RULES:
env_var:     value read from environment variable at execution time
fixture:     pre-loaded static file
generated:   agent generates at runtime (random email, UUID, phone number)
manual:      human must provide value before execution begins
instruction: human-readable guidance string for manual TCs only

SENSITIVITY — set sensitive=true for field names containing (case-insensitive):
password, token, secret, key, credential, auth, ssn, card"""
