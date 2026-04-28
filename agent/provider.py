import asyncio
import json
import os
import time

import anthropic
import openai
from dotenv import load_dotenv

load_dotenv()

# Nodes that call MCP servers — must always use Anthropic (Grok/Groq have no MCP support).
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
    model_override: str = "",
) -> str:
    # MCP fallback: silently switch to Claude for nodes that require MCP tooling.
    if provider in ("grok", "groq") and calling_node in _MCP_ONLY_NODES:
        _log({"event": f"{provider}_fallback", "node": calling_node, "reason": "mcp_required"})
        provider = "claude"

    t0 = time.monotonic()

    if provider == "claude":
        model = model_override or "claude-sonnet-4-6"
        text, input_tok, output_tok = await _call_claude(prompt, system, max_tokens, model)
    elif provider == "grok":
        model = model_override or "grok-3"
        text, input_tok, output_tok = await _call_grok(prompt, system, max_tokens, model)
    elif provider == "groq":
        model = model_override or "llama-3.3-70b-versatile"
        text, input_tok, output_tok = await _call_groq(prompt, system, max_tokens, model)
    else:
        raise ValueError(f"Unknown provider {provider!r}. Must be 'claude', 'grok', or 'groq'.")

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


async def _call_claude(prompt: str, system: str, max_tokens: int, model: str) -> tuple[str, int, int]:
    client = anthropic.Anthropic()
    kwargs: dict = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        kwargs["system"] = system
    # Sync client wrapped in thread so the event loop stays unblocked.
    response = await asyncio.to_thread(client.messages.create, **kwargs)
    return response.content[0].text, response.usage.input_tokens, response.usage.output_tokens


async def _call_grok(prompt: str, system: str, max_tokens: int, model: str) -> tuple[str, int, int]:
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
        model=model,
        max_tokens=max_tokens,
        messages=messages,
    )
    usage = response.usage
    return response.choices[0].message.content, usage.prompt_tokens, usage.completion_tokens


async def _call_groq(prompt: str, system: str, max_tokens: int, model: str) -> tuple[str, int, int]:
    client = openai.OpenAI(
        api_key=os.getenv("GROQ_API_KEY"),
        base_url="https://api.groq.com/openai/v1",
    )
    messages: list[dict] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    response = await asyncio.to_thread(
        client.chat.completions.create,
        model=model,
        max_tokens=max_tokens,
        messages=messages,
    )
    usage = response.usage
    return response.choices[0].message.content, usage.prompt_tokens, usage.completion_tokens


def _log(data: dict) -> None:
    print(json.dumps(data), flush=True)
