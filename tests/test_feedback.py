import pytest

from agent.diff_tracker import compute_list_diff
from agent.feedback_retriever import get_feedback_examples, log_feedback


def test_compute_list_diff_modified():
    agent_items = [{"id": "REQ-001", "text": "User can log in", "type": "functional"}]
    human_items = [{"id": "REQ-001", "text": "User can log in securely", "type": "functional"}]
    diff = compute_list_diff(agent_items, human_items)
    assert len(diff["modified"]) == 1
    assert diff["modified"][0]["id"] == "REQ-001"
    assert "text" in diff["modified"][0]["changed_fields"]
    assert diff["added"] == []
    assert diff["deleted"] == []


def test_compute_list_diff_added():
    agent_items = [{"id": "REQ-001", "text": "User can log in", "type": "functional"}]
    human_items = [
        {"id": "REQ-001", "text": "User can log in", "type": "functional"},
        {"id": "REQ-002", "text": "User can log out", "type": "functional"},
    ]
    diff = compute_list_diff(agent_items, human_items)
    assert len(diff["added"]) == 1
    assert diff["added"][0]["id"] == "REQ-002"
    assert diff["deleted"] == []
    assert diff["modified"] == []


def test_compute_list_diff_deleted():
    agent_items = [
        {"id": "REQ-001", "text": "User can log in", "type": "functional"},
        {"id": "REQ-002", "text": "User can log out", "type": "functional"},
    ]
    human_items = [{"id": "REQ-001", "text": "User can log in", "type": "functional"}]
    diff = compute_list_diff(agent_items, human_items)
    assert diff["deleted"] == ["REQ-002"]
    assert diff["added"] == []
    assert diff["modified"] == []


@pytest.mark.asyncio
async def test_get_feedback_examples_empty_db(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://invalid:0/baddb")
    result = await get_feedback_examples(node="requirements_analysis", ticket_type="Story")
    assert result == ""


@pytest.mark.asyncio
async def test_log_feedback_swallows_error(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://invalid:0/baddb")
    await log_feedback(
        run_id="00000000-0000-0000-0000-000000000000",
        node="requirements_analysis",
        ticket_id="PROJ-001",
        ticket_type="Story",
        item_id=None,
        edit_type="modified",
        agent_output={"id": "REQ-001"},
        human_edit={"id": "REQ-001", "text": "updated"},
        diff={"modified": []},
        feedback_text=None,
    )
