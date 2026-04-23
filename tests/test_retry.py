import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from pydantic import ValidationError

from agent.retry import with_retry
from agent.schemas import REQItem, RequirementsOutput


@pytest.mark.asyncio
async def test_success_first_try():
    """fn succeeds on the first attempt — retry counter stays at 0."""
    async def fn(state: dict) -> dict:
        return state

    result = await with_retry(fn, {"req_retry_count": 0}, max_retries=3)
    assert result["req_retry_count"] == 0


@pytest.mark.asyncio
async def test_raises_once_then_succeeds():
    """fn raises on attempt 0, succeeds on attempt 1 — counter = 1 in result."""
    calls = {"n": 0}

    async def fn(state: dict) -> dict:
        calls["n"] += 1
        if calls["n"] == 1:
            raise ValueError("first try fails")
        return state

    with patch("asyncio.sleep", new_callable=AsyncMock):
        result = await with_retry(fn, {"req_retry_count": 0}, max_retries=3)

    assert result["req_retry_count"] == 1


@pytest.mark.asyncio
async def test_always_raises_exhausts_retries():
    """fn always raises — counter equals max_retries and 'error' key is set."""
    async def fn(state: dict) -> dict:
        raise RuntimeError("always fails")

    max_retries = 3
    with patch("asyncio.sleep", new_callable=AsyncMock):
        result = await with_retry(
            fn, {"req_retry_count": 0}, max_retries=max_retries
        )

    assert result["req_retry_count"] == max_retries
    assert "error" in result
    assert "always fails" in result["error"]


def test_requirements_output_extra_field_raises():
    """RequirementsOutput rejects unknown fields (extra='forbid')."""
    with pytest.raises(ValidationError):
        RequirementsOutput(
            extra_field="not_allowed",
            requirements=[],
            ambiguities=[],
            contradictions=[],
            assumptions=[],
        )


def test_requirements_output_valid():
    """RequirementsOutput accepts well-formed data."""
    output = RequirementsOutput(
        requirements=[
            REQItem(id="REQ-001", text="User can log in", source="AC-1", type="functional")
        ],
        ambiguities=[],
        contradictions=[],
        assumptions=[],
    )
    assert len(output.requirements) == 1
    assert output.requirements[0].id == "REQ-001"
