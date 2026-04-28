import os


def get_model(node: str, provider: str) -> str:
    """Return the model ID for a node + provider pair.

    Resolution order:
    1. Per-node env override: MODEL_<NODE_NAME_UPPER>  (e.g. MODEL_CLASSIFY_TCS_NODE)
    2. Per-provider default:  CLAUDE_MODEL / GROK_MODEL / GROQ_MODEL
    3. Hardcoded default for each provider
    """
    env_key = f"MODEL_{node.upper()}"
    override = os.getenv(env_key)
    if override:
        return override
    if provider == "claude":
        return os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")
    if provider == "grok":
        return os.getenv("GROK_MODEL", "grok-3")
    if provider == "groq":
        return os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    return provider
