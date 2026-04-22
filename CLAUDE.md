# CLAUDE.md — SDET Multi-Agent Pipeline

This file is read automatically by Claude Code at the start of every session.
Follow every rule here without being asked.

---

## 🏗 AUTOMATIC FILE MAINTENANCE

### ARCHITECTURE.md
Update `ARCHITECTURE.md` automatically whenever you:
- Create or rename a file or folder
- Add, remove, or rewire a graph node
- Add a new API endpoint
- Add a new dependency (pyproject.toml or package.json)
- Change a database schema or state field
- Add a new MCP server or external integration

How to update:
1. Read the current `ARCHITECTURE.md`
2. Apply the minimal surgical change that reflects what you just built
3. Never rewrite the whole file — only update the affected section
4. Keep it accurate and concise — this is a live map, not a story

### PROGRESS.md
Update `PROGRESS.md` automatically at the END of every session or whenever you complete a discrete task.

How to update:
1. Read the current `PROGRESS.md`
2. Find the matching session or task entry
3. Change its status from `[ ]` to `[x]`
4. Add a one-line note under it: what was built, any deviation from the plan, any known issue
5. Append anything unfinished to the "Carry-over" section at the bottom
6. Never delete history — only append or tick off

---

## ⌨️ SLASH COMMANDS

You can also trigger manual updates with these commands:

### `/architecture`
Regenerate the full `ARCHITECTURE.md` from scratch by reading the actual codebase.
Scan: all .py files, all .ts/.tsx files, pyproject.toml, package.json, docker-compose.yml, mcp-config.json.
Do not guess — only document what exists on disk.

### `/progress`
Print a summary of `PROGRESS.md` to the terminal: sessions done, sessions remaining, carry-overs.
Do not modify the file — just print the summary.

### `/status`
Run both `/architecture` and `/progress` in sequence. Use this at the start of a new session
to re-orient yourself before writing any code.

---

## 📋 CODING STANDARDS

- Python: async/await throughout, type hints on every function signature
- Imports: absolute imports only (`from graph.state import AgentState`)
- Secrets: always read from `os.getenv()` — never hardcode
- JSON parsing: always use `re.search(r'\[.*\]', raw, re.DOTALL)` fallback for LLM responses
- Logging: structured JSON to stdout — `{"event": "...", "node": "...", "run_id": "..."}`
- File naming: snake_case for Python, kebab-case for TS/Next.js
- Every new node must be added to `graph/builder.py` before the session ends
- Every new endpoint must be documented with a one-line comment above the route decorator

## 🚫 NEVER DO

- Never use `MemorySaver` in production code paths (use `AsyncPostgresSaver`)
- Never log sensitive fields (`password`, `token`, `secret`, `key`, `credential`)
- Never hardcode JIRA ticket IDs, URLs, or credentials in test files
- Never leave a node stub (`pass` or `return state`) without a `# TODO(session-N)` comment
- Never skip updating `ARCHITECTURE.md` or `PROGRESS.md` at the end of a session

---

## 🗂 PROJECT STRUCTURE (reference)

```
sdet-agent/
├── CLAUDE.md              ← you are here
├── ARCHITECTURE.md        ← live architecture map (auto-updated)
├── PROGRESS.md            ← session progress tracker (auto-updated)
├── .env                   ← never commit
├── .env.example           ← commit this
├── docker-compose.yml
├── docker-compose.prod.yml
├── pyproject.toml
├── agent/
│   ├── provider.py        ← run_agent(prompt, provider) abstraction
│   └── retry.py           ← with_retry() wrapper
├── graph/
│   ├── state.py           ← AgentState TypedDict
│   ├── builder.py         ← StateGraph wiring + compile()
│   └── nodes/
│       ├── fetch_ticket.py
│       ├── requirements_analysis.py
│       ├── generate_hls.py
│       ├── generate_tcs.py
│       ├── coverage_validation.py
│       ├── classify_tcs.py
│       ├── test_data_planning.py
│       ├── playwright_execution.py
│       ├── hybrid_execution.py
│       ├── report_generation.py
│       ├── write_jira.py
│       ├── commit_github.py
│       └── send_email.py
├── api/
│   └── main.py            ← FastAPI app
├── scripts/
│   ├── s3_upload.py
│   └── seed_db.py
├── tests/
└── ui/                    ← Next.js 14 app
    ├── app/
    ├── components/
    └── package.json
```
