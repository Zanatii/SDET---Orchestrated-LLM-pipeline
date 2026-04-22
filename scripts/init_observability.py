"""
Import this module at FastAPI startup to activate LangSmith tracing.
All four required env vars are read from .env (via dotenv) and pinned into
os.environ so that LangGraph picks them up automatically on every graph run.
"""
import os

from dotenv import load_dotenv

load_dotenv()

_LANGSMITH_KEYS = (
    "LANGCHAIN_TRACING_V2",
    "LANGCHAIN_ENDPOINT",
    "LANGCHAIN_API_KEY",
    "LANGCHAIN_PROJECT",
)

for _key in _LANGSMITH_KEYS:
    _val = os.getenv(_key, "")
    if _val:
        os.environ[_key] = _val

project: str = os.environ.get("LANGCHAIN_PROJECT", "(not set)")
print(f"LangSmith tracing active: {project}")
