"""playwright_execution_node — two workflows in sequence.

Workflow A: Script Generation
  Generate .spec.ts per automated TC via Claude LLM and commit to GitHub.

Workflow B: Live Execution (added Session 15)
  Execute each automated TC step-by-step via Playwright browser primitives.
  Upload failure screenshots (and optionally video) to S3/MinIO.
"""

import base64
import json
import os
import re
import time
from datetime import datetime, timezone
from typing import Optional

import httpx

from agent.node_logger import compute_input_hash, log_node_event
from agent.prompts import playwright_scripts as pw_prompts
from agent.provider import run_agent
from agent.safe_parse_json import safe_parse_json
from scripts.s3_upload import generate_presigned_url, upload_artifact
from graph.state import AgentState

try:
    from playwright.async_api import async_playwright
    _HAS_PLAYWRIGHT = True
except ImportError:
    _HAS_PLAYWRIGHT = False

# ── TypeScript generation prompts (Workflow A) ─────────────────────────────────

_TS_SYSTEM = """You are a Playwright TypeScript test engineer.
You write clean, well-structured Page Object Model tests.
Return ONLY the raw TypeScript file content — no markdown fences, no explanation."""

_TS_USER_TEMPLATE = """Generate a Playwright TypeScript test file for the following test case.

=== TEST CASE ===
ID:           {tc_id}
Title:        {tc_title}
HLS:          {hls_id}
Preconditions:
{preconditions}

=== STEPS ===
{steps}

=== TEST DATA ===
{test_data_section}

=== REQUIREMENTS ===
1. Use the Page Object Model pattern — define a class with locator methods, then use it in the test.
2. Add a "// Locator: <element description>" comment directly above every selector string.
3. Test data injection rules:
   - env_var  → process.env.FIELD_KEY  (FIELD_KEY is the source value in UPPER_SNAKE_CASE)
   - fixture  → declared as a top-level import: import fixtureData from '../fixtures/{{source}}'
   - generated → inline expression as shown in the source column
4. Import {{ test, expect, Page }} from '@playwright/test'.
5. Import {{ faker }} from '@faker-js/faker' only if generated fields are present.
6. The file must compile without errors.
"""

# ── Execution planning prompt (Workflow B) ─────────────────────────────────────

_PLAN_SYSTEM = """You are a Playwright test execution planner.
Convert each test step into one or more Playwright browser primitives.
Return ONLY a raw JSON array — no markdown fences, no explanation."""

_PLAN_USER_TEMPLATE = """Convert these test steps into Playwright browser commands.

=== TEST CASE ===
ID: {tc_id}
Title: {tc_title}

=== STEPS ===
{steps}

=== RESOLVED TEST DATA ===
{test_data}

=== ALLOWED PRIMITIVES ===
Return a JSON array where each element is one of:
  {{"step_index": N, "primitive": "navigate",        "url": "..."}}
  {{"step_index": N, "primitive": "waitForSelector", "selector": "..."}}
  {{"step_index": N, "primitive": "click",           "selector": "..."}}
  {{"step_index": N, "primitive": "fill",            "selector": "...", "value": "..."}}
  {{"step_index": N, "primitive": "evaluate",        "expression": "...", "expected": "..."}}
  {{"step_index": N, "primitive": "screenshot",      "label": "..."}}

Rules:
- step_index is 0-based, matching the step list above.
- waitForSelector before every click or fill.
- Use precise CSS/ARIA selectors. Prefer data-testid attributes when plausible.
- Substitute actual values from RESOLVED TEST DATA into fill commands.
- evaluate expected is a string representation of the JS return value.
- Include a screenshot command after the final step.
"""


# ── GitHub REST API helpers (Workflow A) ──────────────────────────────────────

def _gh_headers() -> dict[str, str]:
    token = os.getenv("GITHUB_PERSONAL_ACCESS_TOKEN", "")
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _gh_repo() -> str:
    return os.getenv("GITHUB_REPO", "")


async def _ensure_branch(client: httpx.AsyncClient, branch: str) -> None:
    """Create branch sdet-agent/{run_id} off the default branch HEAD.
    Silently ignores 422 (branch already exists)."""
    repo = _gh_repo()
    default = os.getenv("GITHUB_DEFAULT_BRANCH", "main")

    ref_resp = await client.get(
        f"https://api.github.com/repos/{repo}/git/ref/heads/{default}",
        headers=_gh_headers(),
    )
    ref_resp.raise_for_status()
    sha = ref_resp.json()["object"]["sha"]

    create_resp = await client.post(
        f"https://api.github.com/repos/{repo}/git/refs",
        headers=_gh_headers(),
        json={"ref": f"refs/heads/{branch}", "sha": sha},
    )
    if create_resp.status_code not in (201, 422):
        create_resp.raise_for_status()


async def _commit_file(
    client: httpx.AsyncClient,
    file_path: str,
    content: str,
    branch: str,
    tc_id: str,
    ticket_id: str,
) -> str:
    """Create or update a file in the repo. Returns the commit SHA."""
    repo = _gh_repo()
    url = f"https://api.github.com/repos/{repo}/contents/{file_path}"
    encoded = base64.b64encode(content.encode()).decode()

    existing_sha: Optional[str] = None
    get_resp = await client.get(url, headers=_gh_headers(), params={"ref": branch})
    if get_resp.status_code == 200:
        existing_sha = get_resp.json().get("sha")

    body: dict = {
        "message": f"feat(sdet): add generated test {tc_id} [{ticket_id}]",
        "content": encoded,
        "branch": branch,
    }
    if existing_sha:
        body["sha"] = existing_sha

    put_resp = await client.put(url, headers=_gh_headers(), json=body)
    put_resp.raise_for_status()
    return put_resp.json()["commit"]["sha"]


# ── TypeScript generation helpers (Workflow A) ────────────────────────────────

def _format_steps(steps: list[dict]) -> str:
    lines = []
    for i, step in enumerate(steps, 1):
        lines.append(f"  {i}. Action:   {step.get('action', '')}")
        lines.append(f"     Expected: {step.get('expected', '')}")
    return "\n".join(lines) or "  (no steps)"


def _format_test_data(fields: list[dict]) -> str:
    if not fields:
        return "  (none)"
    lines = []
    for f in fields:
        ftype = f.get("type", "")
        source = f.get("source") or ""
        name = f.get("field", "")
        if ftype == "env_var":
            expr = f"process.env.{source or name.upper()}"
        elif ftype == "fixture":
            expr = f"import from '../fixtures/{source}'"
        elif ftype == "generated":
            expr = source or "faker.datatype.uuid()"
        elif ftype == "instruction":
            expr = f"[manual instruction] {source}"
        else:
            expr = f.get("value") or "(manual)"
        lines.append(f"  {name} ({ftype}): {expr}")
    return "\n".join(lines)


def _extract_typescript(raw: str) -> str:
    m = re.search(r"```(?:typescript|ts)\s*(.*?)\s*```", raw, re.DOTALL)
    if m:
        return m.group(1).strip()
    return raw.strip()


def _ts_filename(tc_id: str) -> str:
    return tc_id.lower().replace("-", "_") + ".spec.ts"


# ── Execution helpers (Workflow B) ─────────────────────────────────────────────

def _resolve_test_data(fields: list[dict]) -> dict[str, str]:
    """Resolve TDField values to concrete strings for execution."""
    resolved: dict[str, str] = {}
    for f in fields:
        name = f.get("field", "")
        ftype = f.get("type", "")
        source = f.get("source", "") or ""
        if ftype == "env_var":
            resolved[name] = os.getenv(source or name.upper(), "")
        elif ftype == "manual":
            resolved[name] = f.get("value") or ""
        elif ftype == "generated":
            resolved[name] = f"<generated:{source}>"
        elif ftype == "fixture":
            resolved[name] = f"<fixture:{source}>"
        else:
            resolved[name] = f.get("value") or ""
    return resolved


async def _plan_execution_commands(tc: dict, resolved_data: dict[str, str]) -> list[dict]:
    """Ask Claude to convert TC steps into Playwright primitive commands."""
    steps_text = _format_steps(tc.get("steps") or [])
    data_text = "\n".join(f"  {k}: {v}" for k, v in resolved_data.items()) or "  (none)"
    prompt = _PLAN_USER_TEMPLATE.format(
        tc_id=tc["id"],
        tc_title=tc.get("title", ""),
        steps=steps_text,
        test_data=data_text,
    )
    raw = await run_agent(
        prompt=prompt,
        provider="groq",
        system=_PLAN_SYSTEM,
        calling_node="playwright_execution_node",
    )
    parsed = safe_parse_json(raw)
    # safe_parse_json always returns dict; check if it's wrapped or a bare list
    if isinstance(parsed, list):
        return parsed
    # LLM might wrap as {"commands": [...]}
    for key in ("commands", "steps", "plan", "primitives"):
        if isinstance(parsed.get(key), list):
            return parsed[key]
    return []


async def _execute_primitive(page, cmd: dict) -> Optional[str]:
    """Execute one Playwright primitive. Returns screenshot bytes for 'screenshot'
    primitive; raises on assertion failures or browser errors."""
    p = cmd.get("primitive", "")
    if p == "navigate":
        await page.goto(cmd["url"], wait_until="networkidle", timeout=30000)
    elif p == "waitForSelector":
        await page.wait_for_selector(cmd["selector"], timeout=10000)
    elif p == "click":
        await page.click(cmd["selector"], timeout=10000)
    elif p == "fill":
        await page.fill(cmd["selector"], cmd.get("value", ""), timeout=10000)
    elif p == "evaluate":
        result = await page.evaluate(cmd["expression"])
        expected = cmd.get("expected")
        if expected is not None and str(result) != str(expected):
            raise AssertionError(
                f"evaluate '{cmd['expression']}' → {result!r}, expected {expected!r}"
            )
    elif p == "screenshot":
        return await page.screenshot(full_page=True)
    return None


def _skipped_result(tc: dict, reason: str) -> dict:
    return {
        "tc_id": tc["id"],
        "hls_id": tc.get("hls_id", ""),
        "status": "failed",
        "duration_ms": 0,
        "failed_step": {"index": -1, "action": "", "expected": "", "actual": reason},
        "console_errors": [],
        "artifact_urls": [],
    }


async def _run_one_tc(page, tc: dict, resolved_data: dict[str, str], run_id: str) -> dict:
    """Execute all steps of one TC. Returns a result dict."""
    tc_id = tc["id"]
    hls_id = tc.get("hls_id", "")
    steps = tc.get("steps") or []
    console_errors: list[str] = []
    artifact_urls: list[str] = []
    t0 = time.monotonic()

    page.on(
        "console",
        lambda msg: console_errors.append(msg.text) if msg.type == "error" else None,
    )

    try:
        commands = await _plan_execution_commands(tc, resolved_data)
    except Exception as exc:
        return _skipped_result(tc, f"execution plan failed: {exc}")

    async def _capture_screenshot(label: str = "failure") -> None:
        try:
            shot = await page.screenshot(full_page=True)
            s3_uri = await upload_artifact(run_id, tc_id, f"{label}.png", shot)
            presigned = await generate_presigned_url(s3_uri)
            artifact_urls.append(presigned)
        except Exception:
            pass  # artifact capture must never abort the result recording

    for cmd in commands:
        step_index: int = cmd.get("step_index", 0)
        step = steps[step_index] if step_index < len(steps) else {}
        try:
            shot_bytes = await _execute_primitive(page, cmd)
            if shot_bytes:
                label = cmd.get("label", f"step_{step_index}")
                try:
                    s3_uri = await upload_artifact(run_id, tc_id, f"{label}.png", shot_bytes)
                    presigned = await generate_presigned_url(s3_uri)
                    artifact_urls.append(presigned)
                except Exception:
                    pass
        except Exception as exc:
            await _capture_screenshot("failure")
            return {
                "tc_id": tc_id,
                "hls_id": hls_id,
                "status": "failed",
                "duration_ms": int((time.monotonic() - t0) * 1000),
                "failed_step": {
                    "index": step_index,
                    "action": step.get("action", ""),
                    "expected": step.get("expected", ""),
                    "actual": str(exc),
                },
                "console_errors": console_errors,
                "artifact_urls": artifact_urls,
            }

    return {
        "tc_id": tc_id,
        "hls_id": hls_id,
        "status": "passed",
        "duration_ms": int((time.monotonic() - t0) * 1000),
        "failed_step": None,
        "console_errors": console_errors,
        "artifact_urls": artifact_urls,
    }


async def _workflow_b(
    automated_tcs: list[dict],
    test_data_by_tc: dict[str, dict],
    run_id: str,
) -> list[dict]:
    """Workflow B — live browser execution of all automated TCs."""
    if not automated_tcs:
        return []

    if not _HAS_PLAYWRIGHT:
        return [_skipped_result(tc, "playwright package not installed") for tc in automated_tcs]

    ws_endpoint = os.getenv("PLAYWRIGHT_WS_ENDPOINT", "ws://localhost:9222")
    record_video = os.getenv("RECORD", "").lower() == "true"
    results: list[dict] = []

    async with async_playwright() as pw:
        try:
            browser = await pw.chromium.connect(ws_endpoint)
        except Exception as exc:
            return [_skipped_result(tc, f"browser unavailable: {exc}") for tc in automated_tcs]

        for tc in automated_tcs:
            tc_id = tc["id"]
            td = test_data_by_tc.get(tc_id, {})
            resolved_data = _resolve_test_data(td.get("fields", []))

            ctx_kwargs: dict = {}
            if record_video:
                video_dir = f"/tmp/sdet_videos/{run_id}/{tc_id}"
                os.makedirs(video_dir, exist_ok=True)
                ctx_kwargs["record_video_dir"] = video_dir

            context = await browser.new_context(**ctx_kwargs)
            page = await context.new_page()
            result = await _run_one_tc(page, tc, resolved_data, run_id)

            # Video upload on failure when recording
            if record_video and result["status"] == "failed":
                try:
                    video = page.video
                    await page.close()
                    if video:
                        video_path = await video.path()
                        with open(video_path, "rb") as vf:
                            video_bytes = vf.read()
                        s3_uri = await upload_artifact(run_id, tc_id, "video.mp4", video_bytes)
                        presigned = await generate_presigned_url(s3_uri)
                        result["artifact_urls"].append(presigned)
                except Exception:
                    pass

            await context.close()
            results.append(result)

        await browser.close()

    return results


# ── Page-object extraction (Workflow A) ───────────────────────────────────────

def _extract_page_objects(
    ts_content: str, pages_dir: str, github_base: str
) -> tuple[str, list[dict]]:
    """Extract POM classes from a generated spec, save them to pages_dir, and
    replace inline definitions with import statements.

    Returns (updated_spec_content, list_of_page_dicts).
    Each page dict: {class_name, file, github_path, content}.
    """
    saved: list[dict] = []
    updated = ts_content

    for m in re.finditer(r'(?:export\s+)?class\s+(\w+(?:Page|Component))\b', ts_content):
        class_name = m.group(1)
        brace_start = ts_content.find("{", m.end())
        if brace_start == -1:
            continue
        depth, end = 0, -1
        for i in range(brace_start, len(ts_content)):
            if ts_content[i] == "{":
                depth += 1
            elif ts_content[i] == "}":
                depth -= 1
                if depth == 0:
                    end = i
                    break
        if end == -1:
            continue  # unmatched braces — skip
        full_class = ts_content[m.start(): end + 1]
        page_file = f"{class_name}.ts"
        page_path = os.path.join(pages_dir, page_file)
        exported = full_class if full_class.startswith("export") else f"export {full_class}"
        page_content = f"import {{ Page }} from '@playwright/test';\n\n{exported}\n"
        try:
            with open(page_path, "w", encoding="utf-8") as fh:
                fh.write(page_content)
        except Exception:
            continue
        saved.append({
            "class_name": class_name,
            "file": page_file,
            "github_path": f"{github_base}/pages/{page_file}",
            "content": page_content,
        })
        import_line = f"import {{ {class_name} }} from '../pages/{class_name}';"
        updated = updated.replace(full_class, import_line, 1)

    return updated, saved


# ── Batch GitHub commit (Workflow A) ──────────────────────────────────────────

async def _commit_files_batch(
    client: httpx.AsyncClient,
    files: list[dict],
    branch: str,
    message: str,
) -> str:
    """Commit multiple files in a single Git commit via the Git Data API.

    Each entry in files: {"path": str, "content": str}.
    Returns the new commit SHA.
    """
    repo = _gh_repo()

    # 1. Get branch HEAD SHA
    ref_resp = await client.get(
        f"https://api.github.com/repos/{repo}/git/ref/heads/{branch}",
        headers=_gh_headers(),
    )
    ref_resp.raise_for_status()
    head_sha = ref_resp.json()["object"]["sha"]

    # 2. Get base tree SHA from HEAD commit
    commit_resp = await client.get(
        f"https://api.github.com/repos/{repo}/git/commits/{head_sha}",
        headers=_gh_headers(),
    )
    commit_resp.raise_for_status()
    base_tree_sha = commit_resp.json()["tree"]["sha"]

    # 3. Create blobs and build tree items
    tree_items: list[dict] = []
    for f in files:
        blob_resp = await client.post(
            f"https://api.github.com/repos/{repo}/git/blobs",
            headers=_gh_headers(),
            json={"content": f["content"], "encoding": "utf-8"},
        )
        blob_resp.raise_for_status()
        tree_items.append({
            "path": f["path"],
            "mode": "100644",
            "type": "blob",
            "sha": blob_resp.json()["sha"],
        })

    # 4. Create new tree
    tree_resp = await client.post(
        f"https://api.github.com/repos/{repo}/git/trees",
        headers=_gh_headers(),
        json={"base_tree": base_tree_sha, "tree": tree_items},
    )
    tree_resp.raise_for_status()

    # 5. Create commit
    new_commit_resp = await client.post(
        f"https://api.github.com/repos/{repo}/git/commits",
        headers=_gh_headers(),
        json={"message": message, "tree": tree_resp.json()["sha"], "parents": [head_sha]},
    )
    new_commit_resp.raise_for_status()
    new_commit_sha = new_commit_resp.json()["sha"]

    # 6. Advance branch ref
    await client.patch(
        f"https://api.github.com/repos/{repo}/git/refs/heads/{branch}",
        headers=_gh_headers(),
        json={"sha": new_commit_sha},
    )
    return new_commit_sha


# ── Node ───────────────────────────────────────────────────────────────────────

async def playwright_execution_node(state: AgentState) -> AgentState:
    t0 = time.monotonic()

    tc_list: list[dict] = state.get("tc_list") or []
    classifications: dict[str, dict] = {
        c["tc_id"]: c for c in (state.get("tc_classifications") or [])
    }
    test_data_by_tc: dict[str, dict] = {
        td["tc_id"]: td for td in (state.get("test_data_requirements") or [])
    }
    automated_tcs = [
        tc for tc in tc_list
        if classifications.get(tc["id"], {}).get("mode") == "automated"
    ]

    run_id: str = state["run_id"]
    ticket_id: str = state.get("ticket_id", "")
    feature_slug: str = ""
    branch_name: str = ""

    input_hash = compute_input_hash({
        "tc_ids": [tc["id"] for tc in automated_tcs],
        "run_id": run_id,
    })

    # ── Workflow A: Script Generation ──────────────────────────────────────────
    scripts_written: list[dict] = []
    wf_a_error: Optional[str] = None

    if automated_tcs:
        # Step 1 — project_name
        project_name = (state.get("project_name") or "default").lower().strip().replace(" ", "-")

        # Step 2 — feature_slug via LLM
        reqs = (state.get("requirements_analysis") or {}).get("requirements") or []
        req_summary = reqs[0]["text"] if reqs else "feature"
        slug_prompt = (
            "Based on these requirements generate a short kebab-case slug "
            "describing the feature being tested.\n"
            "Max 4 words, lowercase, hyphens only. No punctuation.\n"
            "Examples: 'landing-page-header', 'user-authentication', 'search-functionality'\n"
            f"Requirements summary: {req_summary}\n"
            "Return ONLY the slug string, nothing else."
        )
        try:
            raw_slug = (await run_agent(slug_prompt, provider="groq", max_tokens=20)).strip().lower()
            feature_slug = re.sub(r"[^a-z0-9-]", "-", raw_slug).strip("-") or "feature"
        except Exception:
            feature_slug = "feature"

        # Step 3 — Resolve paths
        local_base  = os.path.join("scripts", "generated", project_name, feature_slug)
        github_base = f"tests/generated/{project_name}/{feature_slug}"
        specs_dir   = os.path.join(local_base, "specs")
        pages_dir   = os.path.join(local_base, "pages")
        branch_name = f"sdet-agent/{project_name}/{feature_slug}"
        os.makedirs(specs_dir, exist_ok=True)
        os.makedirs(pages_dir, exist_ok=True)

        # Step 4 — Check for existing shared page objects
        existing_page_files = os.listdir(pages_dir) if os.path.exists(pages_dir) else []

        # Step 5-7 — Generate scripts, extract page objects, batch commit
        repo = _gh_repo()
        if not repo:
            wf_a_error = "GITHUB_REPO not set — skipping GitHub commits"

        batch_files: list[dict] = []

        async with httpx.AsyncClient(timeout=30.0) as client:
            if repo:
                try:
                    await _ensure_branch(client, branch_name)
                except Exception as exc:
                    wf_a_error = f"Branch creation failed: {exc}"
                    repo = ""

            for tc in automated_tcs:
                tc_id = tc["id"]
                td = test_data_by_tc.get(tc_id, {})
                filename = _ts_filename(tc_id)
                local_path = os.path.join(specs_dir, filename)
                github_path = f"{github_base}/specs/{filename}"

                existing_pages_hint = ""
                if existing_page_files:
                    imports = "\n".join(
                        f"import {{ {f.replace('.ts', '')} }} from '../pages/{f.replace('.ts', '')}';"
                        for f in existing_page_files
                    )
                    existing_pages_hint = (
                        f"\n\nThese Page Object files already exist for this project/feature:\n"
                        f"{existing_page_files}\n"
                        f"Import them instead of redefining:\n{imports}"
                    )

                try:
                    prompt = (
                        pw_prompts.USER_TEMPLATE.format(
                            tc=json.dumps(tc, indent=2),
                            test_data=json.dumps(td, indent=2),
                        )
                        + existing_pages_hint
                    )
                    raw = await run_agent(
                        prompt=prompt,
                        provider="claude",
                        system=pw_prompts.SYSTEM,
                        calling_node="playwright_execution_node",
                    )
                    ts_content = _extract_typescript(raw)
                except Exception as exc:
                    wf_a_error = f"LLM generation failed for {tc_id}: {exc}"
                    continue

                ts_content, new_pages = _extract_page_objects(ts_content, pages_dir, github_base)
                for pg in new_pages:
                    existing_page_files.append(pg["file"])
                    if repo:
                        batch_files.append({"path": pg["github_path"], "content": pg["content"]})

                try:
                    with open(local_path, "w", encoding="utf-8") as fh:
                        fh.write(ts_content)
                except Exception as exc:
                    wf_a_error = f"Local disk write failed for {tc_id}: {exc}"

                if repo:
                    batch_files.append({"path": github_path, "content": ts_content})

                scripts_written.append({
                    "tc_id": tc_id,
                    "project_name": project_name,
                    "feature_slug": feature_slug,
                    "local_path": local_path,
                    "github_path": github_path,
                    "branch": branch_name,
                    "commit_sha": None,
                    "content_preview": ts_content[:200],
                })

            if repo and batch_files:
                commit_msg = (
                    f"feat({project_name}): {feature_slug} — "
                    f"{len(automated_tcs)} specs [{ticket_id}]"
                )
                try:
                    commit_sha = await _commit_files_batch(
                        client, batch_files, branch_name, commit_msg
                    )
                    for entry in scripts_written:
                        entry["commit_sha"] = commit_sha
                except Exception as exc:
                    wf_a_error = f"GitHub batch commit failed: {exc}"

        # Step 6 — summary.json
        summary_path = os.path.join(local_base, "summary.json")
        try:
            with open(summary_path, "w", encoding="utf-8") as fh:
                json.dump({
                    "project_name": project_name,
                    "feature_slug": feature_slug,
                    "ticket_id": ticket_id,
                    "run_id": run_id,
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "scripts": [
                        {
                            "tc_id": s["tc_id"],
                            "local_path": s["local_path"],
                            "github_path": s["github_path"],
                        }
                        for s in scripts_written
                    ],
                }, fh, indent=2)
        except Exception as exc:
            wf_a_error = f"Summary write failed: {exc}"

    # ── Workflow B: Live Execution ─────────────────────────────────────────────
    execution_results = await _workflow_b(automated_tcs, test_data_by_tc, run_id)

    # ── Log combined summary ───────────────────────────────────────────────────
    passed = sum(1 for r in execution_results if r.get("status") == "passed")
    failed = sum(1 for r in execution_results if r.get("status") == "failed")
    error_summary = wf_a_error  # last error wins; B errors are per-TC in results

    latency_ms = int((time.monotonic() - t0) * 1000)
    await log_node_event(
        run_id=run_id,
        node="playwright_execution",
        attempt=0,
        provider="claude",
        input_hash=input_hash,
        output_json={
            "scripts_count": len(scripts_written),
            "branch": branch_name,
            "feature_slug": feature_slug,
            "tc_ids": [s["tc_id"] for s in scripts_written],
            "execution": {"total": len(execution_results), "passed": passed, "failed": failed},
        },
        latency_ms=latency_ms,
        error=error_summary,
    )

    return {
        **state,
        "scripts_written": scripts_written,
        "execution_results": execution_results,
        "feature_slug": feature_slug or None,
        "error": error_summary,
    }
