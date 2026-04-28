import asyncpg, json, os
from typing import List, Dict, Optional

async def get_feedback_examples(
    node: str,
    ticket_type: Optional[str],
    limit: int = 3,
) -> str:
    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        return ""
    try:
        conn = await asyncpg.connect(db_url)
        rows = await conn.fetch(
            """
            SELECT edit_type, agent_output, human_edit, diff, feedback_text
            FROM feedback_log
            WHERE node = $1
              AND ($2::text IS NULL OR ticket_type = $2)
              AND edit_type IN ('modified', 'added', 'deleted', 'rejected')
            ORDER BY created_at DESC
            LIMIT $3
            """,
            node, ticket_type, limit,
        )
        await conn.close()
    except Exception:
        return ""

    if not rows:
        return ""

    lines = ["EXAMPLES FROM PREVIOUS HUMAN REVIEWS (learn from these patterns):"]
    for i, row in enumerate(rows, 1):
        diff = json.loads(row["diff"]) if row["diff"] else {}
        text = row["feedback_text"] or ""
        edit = row["edit_type"]

        if edit == "rejected" and text:
            lines.append(f"\nExample {i} — Human rejected output with reason: \"{text}\"")
        elif edit == "modified" and diff.get("modified"):
            sample = diff["modified"][0]
            lines.append(f"\nExample {i} — Human modified item {sample['id']}:")
            for field, change in list(sample["changed_fields"].items())[:3]:
                lines.append(f"  {field}: \"{change['before']}\" → \"{change['after']}\"")
        elif edit == "added":
            added = json.loads(row["human_edit"]) if row["human_edit"] else {}
            lines.append(f"\nExample {i} — Human added item the model missed: {json.dumps(added)[:200]}")
        elif edit == "deleted":
            deleted = json.loads(row["agent_output"]) if row["agent_output"] else {}
            lines.append(f"\nExample {i} — Human deleted this item (model over-generated): {json.dumps(deleted)[:200]}")

    return "\n".join(lines)


async def log_feedback(
    run_id: str, node: str, ticket_id: str, ticket_type: Optional[str],
    item_id: Optional[str], edit_type: str,
    agent_output: Optional[dict], human_edit: Optional[dict],
    diff: Optional[dict], feedback_text: Optional[str] = None,
) -> None:
    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        return
    try:
        conn = await asyncpg.connect(db_url)
        await conn.execute(
            """
            INSERT INTO feedback_log
              (run_id, node, ticket_id, ticket_type, item_id, edit_type,
               agent_output, human_edit, diff, feedback_text)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            """,
            run_id, node, ticket_id, ticket_type, item_id, edit_type,
            json.dumps(agent_output), json.dumps(human_edit),
            json.dumps(diff), feedback_text,
        )
        await conn.close()
    except Exception:
        pass
