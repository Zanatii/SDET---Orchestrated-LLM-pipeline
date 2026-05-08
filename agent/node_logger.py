import hashlib
import json
import os
from datetime import datetime, timezone
from typing import Optional

import asyncpg
from dotenv import load_dotenv

load_dotenv()

_DSN: str = os.getenv("DATABASE_URL", "").replace("postgresql+asyncpg://", "postgresql://")


def compute_input_hash(input_dict: dict) -> str:
    serialized = json.dumps(input_dict, sort_keys=True)
    return hashlib.sha256(serialized.encode()).hexdigest()[:16]


async def log_node_event(
    run_id: str,
    node: str,
    attempt: int,
    provider: str,
    input_hash: str,
    output_json: dict,
    latency_ms: int,
    error: Optional[str] = None,
) -> None:
    if not _DSN:
        return
    try:
        conn = await asyncpg.connect(_DSN)
        try:
            await conn.execute(
                """
                INSERT INTO node_events
                    (run_id, node, attempt, provider, input_hash, output_json, latency_ms, error)
                VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb, $7, $8)
                """,
                run_id,
                node,
                attempt,
                provider,
                input_hash,
                json.dumps(output_json),
                latency_ms,
                error,
            )
        finally:
            await conn.close()
    except Exception:
        pass  # DB logging must never crash a node


async def emit_node_event(run_id: str, node: str, latency_ms: int, status: str = "completed") -> None:
    """Push node completion event to WebSocket clients via notification queue."""
    try:
        from api.main import notification_queue  # local import to avoid circular deps
        await notification_queue.put((run_id, {
            "type": "node_completed",
            "node": node,
            "latency_ms": latency_ms,
            "status": status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }))
    except Exception:
        pass  # never crash a node due to notification failure
