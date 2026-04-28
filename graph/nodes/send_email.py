import os
import time
from datetime import datetime, timezone

import httpx

from agent.node_logger import compute_input_hash, log_node_event
from graph.state import AgentState

_SENDGRID_SEND_URL = "https://api.sendgrid.com/v3/mail/send"


def _build_html(state: AgentState) -> str:
    ticket_id = state["ticket_id"]
    run_id = state["run_id"]
    report = state.get("report") or {}
    summary = report.get("summary") or {}

    total = summary.get("total", 0)
    passed = summary.get("passed", 0)
    failed = summary.get("failed", 0)
    manual_passed = summary.get("manual_passed", 0)
    manual_failed = summary.get("manual_failed", 0)
    skipped = summary.get("skipped", 0)

    jira_url = os.getenv("JIRA_URL", "").rstrip("/")
    jira_link = f"{jira_url}/browse/{ticket_id}" if jira_url else "#"
    pr_url = report.get("pr_url") or "#"
    langsmith_url = report.get("langsmith_trace_url") or "#"
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>SDET Agent Report</title></head>
<body style="font-family:sans-serif;color:#1a1a2e;background:#f5f7ff;padding:24px;margin:0;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.12);">

    <div style="background:#1a1a2e;padding:24px 32px;">
      <h1 style="color:#e0e0ff;margin:0;font-size:20px;">SDET Multi-Agent Pipeline</h1>
      <p style="color:#a0a8d0;margin:8px 0 0;font-size:13px;">Automated QA Report</p>
    </div>

    <div style="padding:24px 32px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="color:#666;padding:4px 0;width:110px;font-size:13px;">Ticket</td><td style="font-weight:600;">{ticket_id}</td></tr>
        <tr><td style="color:#666;padding:4px 0;font-size:13px;">Run ID</td><td style="font-family:monospace;font-size:12px;">{run_id}</td></tr>
        <tr><td style="color:#666;padding:4px 0;font-size:13px;">Timestamp</td><td style="font-size:13px;">{timestamp}</td></tr>
      </table>

      <h2 style="font-size:15px;margin:0 0 10px;color:#1a1a2e;border-bottom:2px solid #e8e8f0;padding-bottom:6px;">Test Summary</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <thead>
          <tr style="background:#f0f0fa;">
            <th style="padding:9px 14px;text-align:left;font-size:12px;color:#555;font-weight:600;border:1px solid #e8e8f0;">Metric</th>
            <th style="padding:9px 14px;text-align:right;font-size:12px;color:#555;font-weight:600;border:1px solid #e8e8f0;">Count</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style="padding:8px 14px;border:1px solid #e8e8f0;font-size:13px;">Total</td><td style="padding:8px 14px;text-align:right;font-weight:600;border:1px solid #e8e8f0;">{total}</td></tr>
          <tr style="background:#f9f9fd;"><td style="padding:8px 14px;border:1px solid #e8e8f0;font-size:13px;">&#x2705; Passed (automated)</td><td style="padding:8px 14px;text-align:right;color:#2d7a2d;font-weight:600;border:1px solid #e8e8f0;">{passed}</td></tr>
          <tr><td style="padding:8px 14px;border:1px solid #e8e8f0;font-size:13px;">&#x274C; Failed (automated)</td><td style="padding:8px 14px;text-align:right;color:#c0392b;font-weight:600;border:1px solid #e8e8f0;">{failed}</td></tr>
          <tr style="background:#f9f9fd;"><td style="padding:8px 14px;border:1px solid #e8e8f0;font-size:13px;">&#x2705; Manual passed</td><td style="padding:8px 14px;text-align:right;color:#2d7a2d;border:1px solid #e8e8f0;">{manual_passed}</td></tr>
          <tr><td style="padding:8px 14px;border:1px solid #e8e8f0;font-size:13px;">&#x274C; Manual failed</td><td style="padding:8px 14px;text-align:right;color:#c0392b;border:1px solid #e8e8f0;">{manual_failed}</td></tr>
          <tr style="background:#f9f9fd;"><td style="padding:8px 14px;border:1px solid #e8e8f0;font-size:13px;">&#x23ED; Skipped</td><td style="padding:8px 14px;text-align:right;color:#888;border:1px solid #e8e8f0;">{skipped}</td></tr>
        </tbody>
      </table>

      <h2 style="font-size:15px;margin:0 0 10px;color:#1a1a2e;border-bottom:2px solid #e8e8f0;padding-bottom:6px;">Links</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:7px 0;font-size:13px;"><a href="{jira_link}" style="color:#5558af;text-decoration:none;">&#x1F517; JIRA Ticket &mdash; {ticket_id}</a></td></tr>
        <tr><td style="padding:7px 0;font-size:13px;"><a href="{pr_url}" style="color:#5558af;text-decoration:none;">&#x1F419; GitHub Pull Request</a></td></tr>
        <tr><td style="padding:7px 0;font-size:13px;"><a href="{langsmith_url}" style="color:#5558af;text-decoration:none;">&#x1F50D; LangSmith Trace</a></td></tr>
      </table>
    </div>

    <div style="background:#f0f0fa;padding:14px 32px;text-align:center;">
      <p style="color:#999;font-size:11px;margin:0;">Generated by SDET Multi-Agent Pipeline v1.1</p>
    </div>
  </div>
</body>
</html>"""


async def send_email_node(state: AgentState) -> AgentState:
    t0 = time.monotonic()
    run_id = state["run_id"]
    ticket_id = state["ticket_id"]
    input_hash = compute_input_hash({"run_id": run_id, "ticket_id": ticket_id})

    report = state.get("report") or {}
    summary = report.get("summary") or {}
    passed = summary.get("passed", 0) + summary.get("manual_passed", 0)
    total = summary.get("total", 0)
    subject = f"[SDET Agent] {ticket_id} — {passed}/{total} tests passed"

    api_key = os.getenv("SENDGRID_API_KEY", "")
    from_email = os.getenv("SENDGRID_FROM_EMAIL", "")
    recipients_raw = os.getenv("NOTIFICATION_EMAILS", "")
    recipients = [r.strip() for r in recipients_raw.split(",") if r.strip()]

    if not api_key or not recipients or not from_email:
        missing = []
        if not api_key:
            missing.append("SENDGRID_API_KEY")
        if not from_email:
            missing.append("SENDGRID_FROM_EMAIL")
        if not recipients:
            missing.append("NOTIFICATION_EMAILS")
        error_msg = f"Email skipped — missing env vars: {', '.join(missing)}"
        await log_node_event(
            run_id=run_id, node="send_email", attempt=0, provider="sendgrid",
            input_hash=input_hash, output_json={}, latency_ms=0, error=error_msg,
        )
        return {**state, "error": error_msg}

    html_body = _build_html(state)
    error_msg: str | None = None

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                _SENDGRID_SEND_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "personalizations": [
                        {"to": [{"email": r} for r in recipients]}
                    ],
                    "from": {"email": from_email, "name": "SDET Agent"},
                    "subject": subject,
                    "content": [{"type": "text/html", "value": html_body}],
                },
            )
            resp.raise_for_status()
    except Exception as exc:
        error_msg = str(exc)[:300]

    latency_ms = int((time.monotonic() - t0) * 1000)
    await log_node_event(
        run_id=run_id,
        node="send_email",
        attempt=0,
        provider="sendgrid",
        input_hash=input_hash,
        output_json={"recipients": recipients, "subject": subject},
        latency_ms=latency_ms,
        error=error_msg,
    )

    return state
