import asyncio
import os
import sys

import asyncpg
from dotenv import load_dotenv

load_dotenv()

_DDL = """
CREATE TABLE IF NOT EXISTS node_events (
    id          SERIAL PRIMARY KEY,
    run_id      UUID         NOT NULL,
    node        TEXT         NOT NULL,
    attempt     INT          NOT NULL DEFAULT 1,
    provider    TEXT,
    input_hash  TEXT,
    output_json JSONB,
    latency_ms  INT,
    error       TEXT,
    created_at  TIMESTAMPTZ  DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_node_events_run_node ON node_events (run_id, node);
"""


async def main() -> None:
    url = os.getenv("DATABASE_URL")
    if not url:
        print(
            "ERROR: DATABASE_URL is not set. Copy .env.example to .env and fill in the value.",
            file=sys.stderr,
        )
        sys.exit(1)

    # asyncpg uses postgresql:// — strip the SQLAlchemy dialect suffix if present
    dsn = url.replace("postgresql+asyncpg://", "postgresql://")

    try:
        conn = await asyncpg.connect(dsn)
    except Exception as exc:
        print(f"ERROR: Could not connect to database — {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        await conn.execute(_DDL)
    finally:
        await conn.close()

    print("node_events table ready")


if __name__ == "__main__":
    asyncio.run(main())
