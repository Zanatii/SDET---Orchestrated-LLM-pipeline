import asyncio
import json
import sys

from pydantic import ValidationError


async def with_retry(
    fn,
    state: dict,
    max_retries: int = 3,
    retry_key: str = "req_retry_count",
) -> dict:
    last_exception: BaseException | None = None

    for attempt in range(max_retries):
        try:
            # On success we return immediately; code below only runs on failure.
            return await fn(state)
        except ValidationError as exc:
            last_exception = exc
            error_class = "ValidationError"
        except ValueError as exc:
            last_exception = exc
            error_class = "ValueError"
        except Exception as exc:
            last_exception = exc
            error_class = type(exc).__name__

        print(
            json.dumps({
                "event": "retry_attempt",
                "retry_key": retry_key,
                "attempt": attempt,
                "max_retries": max_retries,
                "error_class": error_class,
                "detail": str(last_exception)[:200],
            }),
            file=sys.stdout,
            flush=True,
        )
        # CRITICAL: increment counter BEFORE sleep.
        # v1.0 bug: counter was placed after `return result` and never reached.
        state = {**state, retry_key: state.get(retry_key, 0) + 1}
        await asyncio.sleep(2 ** attempt)  # 1s, 2s, 4s

    return {**state, "error": str(last_exception)}
