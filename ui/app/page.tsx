"use client";

import { useEffect, useRef, useState } from "react";
import { AgentState, HLSItem, REQItem, TCItem } from "@/types";
import Header from "@/components/Header";
import Stepper from "@/components/Stepper";
import GateActionBar from "@/components/GateActionBar";
import RequirementsPanel from "@/components/panels/RequirementsPanel";
import HlsPanel from "@/components/panels/HlsPanel";
import TcPanel from "@/components/panels/TcPanel";

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiStart(ticketId: string, provider: "claude" | "grok") {
  const res = await fetch("/api/runs/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticket_id: ticketId, provider }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ gate: string | null; state: AgentState }>;
}

async function apiResume(
  runId: string,
  action: "approve" | "reject",
  feedback: string,
  edits?: { items: unknown[] }
) {
  const res = await fetch(`/api/runs/${runId}/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, feedback, edits }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ gate: string | null; state: AgentState }>;
}

async function apiGetState(runId: string): Promise<AgentState> {
  const res = await fetch(`/api/runs/${runId}/state`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Page() {
  const [provider, setProvider] = useState<"claude" | "grok">("claude");
  const [ticketInput, setTicketInput] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [runState, setRunState] = useState<AgentState | null>(null);
  const [currentGate, setCurrentGate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Edit mode — lifted so GateActionBar and panels share it
  const [editMode, setEditMode] = useState(false);
  const [editedReqs, setEditedReqs] = useState<REQItem[] | null>(null);
  const [editedHls, setEditedHls] = useState<HLSItem[] | null>(null);
  const [editedTcs, setEditedTcs] = useState<TCItem[] | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling(id: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const state = await apiGetState(id);
        setRunState(state);
      } catch {
        // non-fatal — keep polling
      }
    }, 5000);
  }

  // Reset edit state on gate change
  useEffect(() => {
    setEditMode(false);
    setEditedReqs(null);
    setEditedHls(null);
    setEditedTcs(null);
  }, [currentGate]);

  useEffect(() => () => stopPolling(), []);

  async function handleStart() {
    if (!ticketInput.trim()) return;
    setLoading(true);
    setApiError(null);
    setRunState(null);
    setCurrentGate(null);
    stopPolling();
    try {
      const { gate, state } = await apiStart(ticketInput.trim(), provider);
      setRunId(state.run_id);
      setRunState(state);
      setCurrentGate(gate);
      startPolling(state.run_id);
    } catch (e) {
      setApiError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function buildEdits(): { items: unknown[] } | undefined {
    if (!editMode) return undefined;
    if (currentGate === "review_requirements" && editedReqs) return { items: editedReqs };
    if (currentGate === "review_hls" && editedHls) return { items: editedHls };
    if (currentGate === "review_tcs" && editedTcs) return { items: editedTcs };
    return undefined;
  }

  async function handleApprove() {
    if (!runId) return;
    setLoading(true);
    try {
      const { gate, state } = await apiResume(runId, "approve", "", buildEdits());
      setRunState(state);
      setCurrentGate(gate);
    } catch (e) {
      setApiError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleReject(feedback: string) {
    if (!runId) return;
    setLoading(true);
    try {
      const { gate, state } = await apiResume(runId, "reject", feedback);
      setRunState(state);
      setCurrentGate(gate);
    } catch (e) {
      setApiError(String(e));
    } finally {
      setLoading(false);
    }
  }

  // Resolve display data (edited takes precedence over polled state)
  const reqs = (editedReqs ?? runState?.requirements_analysis?.requirements) as REQItem[] | undefined;
  const hlsList = (editedHls ?? runState?.hls_list) as HLSItem[] | undefined;
  const tcList = (editedTcs ?? runState?.tc_list) as TCItem[] | undefined;

  return (
    <div className="h-screen flex flex-col bg-bg text-text overflow-hidden">
      <Header provider={provider} onProviderChange={setProvider} />

      {/* Input section */}
      <div className="shrink-0 border-b border-border px-6 py-4 flex items-center gap-3 bg-surface/30">
        <input
          type="text"
          className="flex-1 max-w-sm bg-surface border border-border rounded-md px-3 py-2 text-sm text-text placeholder-muted focus:outline-none focus:border-teal transition-colors font-mono"
          placeholder="JIRA ticket ID  (e.g. PROJ-123)"
          value={ticketInput}
          onChange={(e) => setTicketInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && handleStart()}
          disabled={loading}
        />
        <button
          onClick={handleStart}
          disabled={loading || !ticketInput.trim()}
          className="px-5 py-2 text-sm font-semibold text-white bg-teal rounded-md disabled:opacity-40 hover:bg-teal/80 transition-colors"
        >
          {loading ? "Running…" : "Start Pipeline"}
        </button>

        {runId && (
          <span className="font-mono text-xs text-muted border border-border rounded px-2 py-1 shrink-0">
            run: {runId.slice(0, 8)}…
          </span>
        )}

        {apiError && (
          <span className="text-xs text-red truncate max-w-xs" title={apiError}>
            {apiError}
          </span>
        )}
      </div>

      {/* Main two-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Stepper — 260 px fixed */}
        <div className="w-[260px] shrink-0 border-r border-border overflow-y-auto bg-surface/20">
          <Stepper state={runState} currentGate={currentGate} />
        </div>

        {/* Active panel */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {!runId && (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center">
                <svg className="w-6 h-6 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
                </svg>
              </div>
              <p className="text-muted text-sm">Enter a JIRA ticket ID above to start the pipeline.</p>
            </div>
          )}

          {currentGate === "review_requirements" && reqs && (
            <RequirementsPanel
              requirements={reqs}
              ambiguities={runState?.requirements_analysis?.ambiguities ?? []}
              contradictions={runState?.requirements_analysis?.contradictions ?? []}
              assumptions={runState?.requirements_analysis?.assumptions ?? []}
              editMode={editMode}
              onItemsChange={setEditedReqs}
            />
          )}

          {currentGate === "review_hls" && hlsList && (
            <HlsPanel
              hlsList={hlsList}
              editMode={editMode}
              onItemsChange={setEditedHls}
            />
          )}

          {currentGate === "review_tcs" && tcList && (
            <TcPanel
              tcList={tcList}
              editMode={editMode}
              onItemsChange={setEditedTcs}
            />
          )}

          {currentGate === "review_coverage" && runState?.coverage_report && (
            <div className="flex flex-col gap-4">
              <h2 className="text-base font-semibold text-text">Coverage Report</h2>
              <pre className="bg-surface border border-border rounded-lg p-5 text-xs text-muted overflow-x-auto font-mono leading-relaxed">
                {JSON.stringify(runState.coverage_report, null, 2)}
              </pre>
            </div>
          )}

          {runId && !currentGate && runState && (
            <div className="h-full flex items-center justify-center">
              <p className="text-muted text-sm">
                {runState.error
                  ? `Pipeline error: ${runState.error}`
                  : "Pipeline running — polling for gate…"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Gate action bar */}
      {currentGate && (
        <GateActionBar
          gate={currentGate}
          editMode={editMode}
          onEditModeToggle={() => setEditMode((m) => !m)}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}
    </div>
  );
}
