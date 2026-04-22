import json
import os
import uuid

import pytest

_DATABASE_URL: str = os.getenv("DATABASE_URL", "")


def _dsn() -> str:
    return _DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")


@pytest.mark.asyncio
async def test_node_events_roundtrip() -> None:
    if not _DATABASE_URL:
        pytest.skip("DATABASE_URL not set")

    asyncpg = pytest.importorskip("asyncpg")

    try:
        conn = await asyncpg.connect(_dsn())
    except Exception as exc:
        pytest.skip(f"Postgres unreachable: {exc}")

    run_id = uuid.uuid4()
    try:
        await conn.execute(
            """
            INSERT INTO node_events
                (run_id, node, attempt, provider, input_hash, output_json, latency_ms)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
            """,
            run_id,
            "test_node",
            1,
            "claude",
            "abc123",
            json.dumps({"ok": True}),
            42,
        )

        row = await conn.fetchrow(
            "SELECT * FROM node_events WHERE run_id = $1", run_id
        )
        assert row is not None, "Inserted row not found"
        assert row["node"] == "test_node"
        assert row["attempt"] == 1
        assert row["latency_ms"] == 42
        assert row["provider"] == "claude"
    finally:
        await conn.execute("DELETE FROM node_events WHERE run_id = $1", run_id)
        await conn.close()
