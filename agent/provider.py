import asyncio
import json
import os
import time

import anthropic
import openai
from dotenv import load_dotenv

load_dotenv()

# Nodes that call MCP servers — must always use Anthropic (Grok has no MCP support).
_MCP_ONLY_NODES: frozenset[str] = frozenset({
    "fetch_ticket_node",
    "playwright_execution_node",
    "write_jira_node",
    "commit_github_node",
})


async def run_agent(
    prompt: str,
    provider: str = "claude",
    max_tokens: int = 4096,
    system: str = "",
    calling_node: str = "",
) -> str:
    # MCP fallback: silently switch to Claude for nodes that require MCP tooling.
    if provider == "grok" and calling_node in _MCP_ONLY_NODES:
        _log({"event": "grok_fallback", "node": calling_node, "reason": "mcp_required"})
        provider = "claude"

    t0 = time.monotonic()

    if provider == "claude":
        text, input_tok, output_tok = await _call_claude(prompt, system, max_tokens)
        model = "claude-sonnet-4-6"
    elif provider == "grok":
        text, input_tok, output_tok = await _call_grok(prompt, system, max_tokens)
        model = "grok-3"
    else:
        raise ValueError(f"Unknown provider {provider!r}. Must be 'claude' or 'grok'.")

    latency_ms = int((time.monotonic() - t0) * 1000)

    _log({
        "event": "run_agent",
        "provider": provider,
        "model": model,
        "calling_node": calling_node,
        "latency_ms": latency_ms,
        "input_tokens": input_tok,
        "output_tokens": output_tok,
    })

    return text


async def _call_claude(prompt: str, system: str, max_tokens: int) -> tuple[str, int, int]:
    client = anthropic.Anthropic()
    kwargs: dict = {
        "model": "claude-sonnet-4-6",
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        kwargs["system"] = system
    # Sync client wrapped in thread so the event loop stays unblocked.
    response = await asyncio.to_thread(client.messages.create, **kwargs)
    return response.content[0].text, response.usage.input_tokens, response.usage.output_tokens


async def _call_grok(prompt: str, system: str, max_tokens: int) -> tuple[str, int, int]:
    client = openai.OpenAI(
        api_key=os.getenv("GROK_API_KEY"),
        base_url="https://api.x.ai/v1",
    )
    messages: list[dict] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    response = await asyncio.to_thread(
        client.chat.completions.create,
        model="grok-3",
        max_tokens=max_tokens,
        messages=messages,
    )
    usage = response.usage
    return response.choices[0].message.content, usage.prompt_tokens, usage.completion_tokens


def _log(data: dict) -> None:
    print(json.dumps(data), flush=True)
