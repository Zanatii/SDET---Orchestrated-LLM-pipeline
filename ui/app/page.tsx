"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AgentState, HLSItem, REQItem, TCItem } from "@/types";
import Header, { Provider } from "@/components/Header";
import Stepper from "@/components/Stepper";
import GateActionBar from "@/components/GateActionBar";
import RequirementsPanel from "@/components/panels/RequirementsPanel";
import HlsPanel from "@/components/panels/HlsPanel";
import TcPanel from "@/components/panels/TcPanel";
import CoveragePanel from "@/components/panels/CoveragePanel";
import ToastContainer, { ToastItem } from "@/components/Toast";

// ── AI node names (for global-toggle sync) ────────────────────────────────────

const AI_NODES = [
  "requirements_analysis_node",
  "generate_hls_node",
  "generate_tcs_node",
  "classify_tcs_node",
  "test_data_planning_node",
  "hybrid_execution_node",
  "report_generation_node",
];

// ── Gate → content metadata ───────────────────────────────────────────────────

const GATE_META: Record<string, { step: number; phase: 1 | 2; title: string; subtitle: string }> = {
  review_requirements:    { step: 2, phase: 1, title: "Requirements Analysis",  subtitle: "Review and optionally edit extracted requirements" },
  review_hls:             { step: 3, phase: 1, title: "High-Level Scenarios",   subtitle: "Review generated test scenarios before creating test cases" },
  review_tcs:             { step: 4, phase: 1, title: "Test Cases",             subtitle: "Review test cases and optionally edit steps or priorities" },
  review_coverage:        { step: 5, phase: 1, title: "Coverage Validation",    subtitle: "Verify requirement coverage before proceeding" },
  review_jira:            { step: 5, phase: 1, title: "Write Test Cases to JIRA", subtitle: "These test cases will be created in JIRA" },
  review_classifications: { step: 6, phase: 2, title: "TC Classifications",     subtitle: "Review how test cases have been categorized for execution" },
  review_scripts:         { step: 7, phase: 2, title: "Generated Scripts",      subtitle: "Review Playwright scripts before committing to a project" },
  review_report:          { step: 8, phase: 2, title: "Test Report",            subtitle: "Review the final execution report before committing to GitHub" },
};
const TOTAL_STEPS = 8;

// Maps each review gate to the AI node whose output it displays
const GATE_TO_NODE: Record<string, string> = {
  review_requirements:    "requirements_analysis_node",
  review_hls:             "generate_hls_node",
  review_tcs:             "generate_tcs_node",
  review_coverage:        "generate_tcs_node",
  review_jira:            "generate_tcs_node",
  review_classifications: "classify_tcs_node",
  review_scripts:         "test_data_planning_node",
  review_report:          "report_generation_node",
};

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiStart(
  ticketId: string,
  provider: Provider,
  nodeProviders: Record<string, string>
) {
  const res = await fetch("/api/runs/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticket_id: ticketId, provider, node_providers: nodeProviders }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ run_id: string; interrupted_at: string | null; state_snapshot: AgentState }>;
}

async function apiResume(
  runId: string,
  gateNode: string,
  approved: boolean,
  feedback: string | null,
  edits: { items: unknown[] } | null,
  projectName: string | null,
  nodeProviders: Record<string, string>,
  jiraSelectedTcIds?: string[] | null,
) {
  const res = await fetch(`/api/runs/${runId}/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gate_node: gateNode,
      approved,
      feedback,
      edits,
      node_providers: nodeProviders,
      project_name: projectName,
      jira_selected_tc_ids: jiraSelectedTcIds ?? null,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ run_id: string; interrupted_at: string | null; state_snapshot: AgentState }>;
}

async function apiGetState(runId: string): Promise<AgentState> {
  const res = await fetch(`/api/runs/${runId}/state`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isRateLimit(msg: string) {
  return msg.includes("rate_limit") || msg.includes("429") || msg.includes("Rate limit reached");
}

type LaunchError = {
  title: string;
  message: string;
  type: "validation" | "not_found" | "auth" | "rate_limit" | "connection" | "unknown";
};

function extractTicketId(input: string): { ticketId: string | null; isValid: boolean } {
  input = input.trim();
  const urlMatch = input.match(/\/browse\/([A-Za-z]+-\d+)/);
  if (urlMatch) return { ticketId: urlMatch[1].toUpperCase(), isValid: true };
  const idMatch = input.match(/^([A-Za-z]+-\d+)$/);
  if (idMatch) return { ticketId: idMatch[1].toUpperCase(), isValid: true };
  return { ticketId: null, isValid: false };
}

type TicketData = {
  summary?: string;
  type?: string;
  priority?: string;
  description?: string;
};

// ── Activity log ──────────────────────────────────────────────────────────────

interface ActivityEntry {
  id: string;
  ts: string;
  text: string;
  type: "start" | "gate" | "action" | "error" | "info";
}

function nowTs() {
  return new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const ACTIVITY_COLOR: Record<ActivityEntry["type"], string> = {
  start:  "#1dc8b8",
  gate:   "#9d6ef7",
  action: "#22c55e",
  error:  "#ef4444",
  info:   "rgba(107,114,128,0.7)",
};

// ── Platform stages (launch screen) ──────────────────────────────────────────

const PIPELINE_STAGES = ["Fetch", "Analyze", "HLS", "TCs", "Scripts", "Execute", "Report"];

function JiraIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24">
      <defs>
        <linearGradient id="jira-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0052CC" />
          <stop offset="100%" stopColor="#2684FF" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="4" fill="url(#jira-grad)" />
      <path d="M12 4l4 8H8l4-8zm0 16l-4-8h8l-4 8z" fill="white" opacity="0.9" />
    </svg>
  );
}

function AzureIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24">
      <defs>
        <linearGradient id="azure-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0078D4" />
          <stop offset="100%" stopColor="#50E6FF" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="4" fill="url(#azure-grad)" />
      <path d="M4 16L9 6l4 6 3-4 4 8H4z" fill="white" opacity="0.9" />
    </svg>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Page() {
  // --- Existing state (unchanged) ---
  const [provider, setProvider] = useState<Provider>("claude");
  const [nodeProviders, setNodeProviders] = useState<Record<string, string>>({});
  const [ticketInput, setTicketInput] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [runState, setRunState] = useState<AgentState | null>(null);
  const [currentGate, setCurrentGate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const [editMode, setEditMode] = useState(false);
  const [jiraSelectedTcIds, setJiraSelectedTcIds] = useState<string[] | null>(null);
  const [editedReqs, setEditedReqs] = useState<REQItem[] | null>(null);
  const [editedHls, setEditedHls] = useState<HLSItem[] | null>(null);
  const [editedTcs, setEditedTcs] = useState<TCItem[] | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [orphanedTcIds, setOrphanedTcIds] = useState<Set<string>>(new Set());

  const [isLoading, setIsLoading] = useState(false);
  const grokWarnedRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const runIdRef = useRef<string | null>(null);
  const isCompletedRef = useRef<boolean>(false);
  const fallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<LaunchError | null>(null);
  const [launchMsg, setLaunchMsg] = useState<string | null>(null);
  const launchTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // --- New UI state ---
  const [platform, setPlatform] = useState<"jira" | "azure">("jira");
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [viewingGate, setViewingGate] = useState<string | null>(null);
  const [skipSteps, setSkipSteps] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showJiraSettings, setShowJiraSettings] = useState(false);
  const [jiraTcProjectKey, setJiraTcProjectKey] = useState("");
  const [jiraFunctionalArea, setJiraFunctionalArea] = useState("Dubai Justice Platform");
  const [showNewRunModal, setShowNewRunModal] = useState(false);
  const [userCustomizedNodes, setUserCustomizedNodes] = useState<Set<string>>(new Set());

  // --- Toast helpers ---
  const dismissToast = useCallback((id: string) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  function addToast(t: Omit<ToastItem, "id">) {
    setToasts((ts) => [...ts, { ...t, id: crypto.randomUUID() }]);
  }

  function addActivity(text: string, type: ActivityEntry["type"] = "info") {
    setActivityLog((prev) => [
      ...prev,
      { id: crypto.randomUUID(), ts: nowTs(), text, type },
    ]);
  }

  function handleNewRun() {
    setShowNewRunModal(false);
    if (wsRef.current) wsRef.current.close();
    wsRef.current = null;
    runIdRef.current = null;
    isCompletedRef.current = false;
    clearFallback();
    launchTimersRef.current.forEach(clearTimeout);
    launchTimersRef.current = [];
    setRunId(null);
    setRunState(null);
    setCurrentGate(null);
    setActivityLog([]);
    setApiError(null);
    setLaunchError(null);
    setIsLoading(false);
    setLoading(false);
    setEditMode(false);
    setViewingGate(null);
    setUserCustomizedNodes(new Set());
    setOrphanedTcIds(new Set());
    setJiraSelectedTcIds(null);
    setTicketInput("");
  }

  // --- Handlers ---
  function handleResumeError(e: unknown) {
    const msg = String(e);
    if (isRateLimit(msg)) {
      addToast({
        title: "⚠️ Rate Limit Reached",
        message: "AI provider rate limit hit. Please wait and try again.",
        rawError: msg,
        variant: "error",
      });
    } else {
      addToast({ title: "❌ Error", message: msg, variant: "error" });
    }
    addActivity(`Error: ${msg.slice(0, 80)}`, "error");
  }

  function maybeWarnGrok() {
    if (!grokWarnedRef.current) {
      grokWarnedRef.current = true;
      addToast({
        title: "⚠️ Grok requires credits",
        message: "Grok requires credits at console.x.ai",
        variant: "warning",
      });
    }
  }

  function getCompletedNodes(snapshot: AgentState | null): string[] {
    if (!snapshot) return [];
    const completed: string[] = [];
    if (snapshot.requirements_analysis) completed.push("requirements_analysis_node");
    if (snapshot.hls_list)              completed.push("generate_hls_node");
    if (snapshot.tc_list)               completed.push("generate_tcs_node");
    if (snapshot.tc_classifications)    completed.push("classify_tcs_node");
    if (snapshot.test_data_requirements) completed.push("test_data_planning_node");
    if (snapshot.scripts_written)       completed.push("playwright_execution_node");
    if (snapshot.execution_results)     completed.push("hybrid_execution_node");
    if (snapshot.report)                completed.push("report_generation_node");
    return completed;
  }

  function handleProviderChange(p: Provider) {
    setProvider(p);
    if (p === "grok") maybeWarnGrok();
    const completed = getCompletedNodes(runState);
    setNodeProviders((prev) => {
      const updated = { ...prev };
      AI_NODES.forEach((node) => {
        if (!completed.includes(node) && !userCustomizedNodes.has(node)) {
          updated[node] = p;
        }
      });
      return updated;
    });
  }

  function handleNodeProviderChange(nodeName: string, p: Provider) {
    if (p === "grok") maybeWarnGrok();
    setUserCustomizedNodes((prev) => new Set([...prev, nodeName]));
    setNodeProviders((prev) => ({ ...prev, [nodeName]: p }));
  }

  // ── WebSocket helpers ─────────────────────────────────────────────────────

  function clearFallback() {
    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = null;
    }
  }

  async function fetchStateHelper(id: string): Promise<AgentState | null> {
    try {
      const res = await fetch(`/api/runs/${id}/state`);
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }

  function connectWebSocket(id: string) {
    if (wsRef.current) {
      const old = wsRef.current;
      wsRef.current = null;
      old.close();
    }

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
    const ws = new WebSocket(`${wsUrl}/ws/${id}`);
    wsRef.current = ws;

    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send("ping");
      } else {
        clearInterval(pingInterval);
      }
    }, 30000);

    ws.onopen = () => console.log("[WS] Connected for run:", id);

    ws.onmessage = (event) => {
      clearFallback();
      try {
        const data = JSON.parse(event.data as string);
        if (data.type === "gate_reached") {
          setCurrentGate(data.interrupted_at);
          setRunState(data.state_snapshot);
          setIsLoading(false);
        }
        if (data.type === "node_completed") {
          const ts = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
          setActivityLog((prev) => [
            ...prev,
            { id: crypto.randomUUID(), ts, text: `${data.node} completed (${data.latency_ms}ms)`, type: "info" as const },
          ]);
        }
        if (data.type === "error") {
          setApiError(data.message);
          setIsLoading(false);
          isCompletedRef.current = true;
        }
      } catch (e) {
        console.error("[WS] Failed to parse message", e);
      }
    };

    ws.onerror = (err) => console.error("[WS] Error:", err);

    ws.onclose = () => {
      clearInterval(pingInterval);
      if (wsRef.current === ws) {
        wsRef.current = null;
        if (runIdRef.current && !isCompletedRef.current) {
          setTimeout(() => connectWebSocket(runIdRef.current!), 2000);
        }
      }
    };
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
      clearFallback();
      isCompletedRef.current = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setViewingGate(null);
    setEditMode(false);
    setEditedReqs(null);
    setEditedHls(null);
    setEditedTcs(null);
    setOrphanedTcIds(new Set());
    if (currentGate) {
      const meta = GATE_META[currentGate];
      const ts = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setActivityLog((prev) => [
        ...prev,
        { id: crypto.randomUUID(), ts, text: `Gate: ${meta?.title ?? currentGate}`, type: "gate" as const },
      ]);
    }
  }, [currentGate]);

  const completedNodes: string[] = [];
  if (runState?.requirements_analysis) completedNodes.push("requirements_analysis_node");
  if (runState?.hls_list)              completedNodes.push("generate_hls_node");
  if (runState?.tc_list)               completedNodes.push("generate_tcs_node");
  if (runState?.tc_classifications)    completedNodes.push("classify_tcs_node");
  if (runState?.test_data_requirements) completedNodes.push("test_data_planning_node");
  if (runState?.scripts_written)       completedNodes.push("playwright_execution_node");
  if (runState?.execution_results)     completedNodes.push("hybrid_execution_node");
  if (runState?.report)                completedNodes.push("report_generation_node");

  async function handleStart() {
    if (!ticketInput.trim()) return;

    const { ticketId, isValid } = extractTicketId(ticketInput);
    if (!isValid) {
      setLaunchError({
        title: "Invalid Ticket Format",
        message: "Please enter a valid Jira ticket ID (e.g. SCRUM-5) or full Jira URL.",
        type: "validation",
      });
      return;
    }

    launchTimersRef.current.forEach(clearTimeout);
    launchTimersRef.current = [];

    setIsLaunching(true);
    setLaunchError(null);
    setLaunchMsg(null);
    setRunState(null);
    setCurrentGate(null);
    setActivityLog([]);
    setIsLoading(false);
    isCompletedRef.current = false;

    launchTimersRef.current.push(setTimeout(() => setLaunchMsg("Fetching ticket from Jira…"), 5000));
    launchTimersRef.current.push(setTimeout(() => setLaunchMsg("Analysing requirements…"), 15000));

    try {
      const res = await fetch("/api/runs/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket_id: ticketId,
          provider,
          node_providers: nodeProviders,
          skip_steps: skipSteps,
          jira_tc_project_key: jiraTcProjectKey,
          jira_functional_area: jiraFunctionalArea,
        }),
      });

      const data = await res.json();

      // Check for errors in HTTP status OR in state_snapshot.error (200 with error payload)
      const errorMessage: string | null =
        data?.state_snapshot?.error ||
        data?.error ||
        data?.detail ||
        null;

      if (!res.ok || errorMessage) {
        const msg = errorMessage || "Unknown error";
        const msgLower = msg.toLowerCase();
        if (
          msgLower.includes("not found") ||
          msgLower.includes("ticket") ||
          res.status === 404
        ) {
          setLaunchError({
            title: "Ticket Not Found",
            message: `"${ticketId}" does not exist in Jira or you don't have access. Check the ticket ID and try again.`,
            type: "not_found",
          });
        } else if (
          msgLower.includes("rate_limit") ||
          msgLower.includes("429") ||
          msgLower.includes("rate limit")
        ) {
          setLaunchError({
            title: "AI Provider Rate Limit",
            message: "Rate limit reached. Wait a few minutes or switch provider.",
            type: "rate_limit",
          });
        } else if (
          msgLower.includes("401") ||
          msgLower.includes("unauthorized") ||
          msgLower.includes("authentication")
        ) {
          setLaunchError({
            title: "Jira Authentication Failed",
            message: "Could not authenticate with Jira. Check JIRA_API_TOKEN and JIRA_AUTH_TYPE in your .env file.",
            type: "auth",
          });
        } else {
          setLaunchError({
            title: "Pipeline Failed to Start",
            message: msg,
            type: "unknown",
          });
        }
        return; // stay on launch screen
      }

      if (!data?.run_id) {
        setLaunchError({
          title: "Unexpected Response",
          message: "Server responded but returned no run ID. Check backend logs.",
          type: "unknown",
        });
        return;
      }

      // Verified: valid run_id and no error — safe to navigate
      runIdRef.current = data.run_id;
      isCompletedRef.current = false;
      setRunId(data.run_id);
      setRunState(data.state_snapshot);
      setCurrentGate(data.interrupted_at);

      connectWebSocket(data.run_id);

      if (!data.interrupted_at) {
        setIsLoading(true);
        fallbackTimeoutRef.current = setTimeout(async () => {
          const stateData = await fetchStateHelper(data.run_id);
          if (stateData) {
            setRunState(stateData);
            setIsLoading(false);
          }
        }, 30000);
      }

      addActivity(`Pipeline started · ${ticketId} · ${provider}`, "start");
    } catch {
      setLaunchError({ title: "Connection Error", message: "Could not reach the SDET Agent backend. Make sure the server is running on port 8000.", type: "connection" });
    } finally {
      launchTimersRef.current.forEach(clearTimeout);
      launchTimersRef.current = [];
      setIsLaunching(false);
      setLaunchMsg(null);
    }
  }

  function buildEdits(): { items: unknown[] } | undefined {
    if (!editMode) return undefined;
    if (currentGate === "review_requirements" && editedReqs) return { items: editedReqs };
    if (currentGate === "review_hls" && editedHls) return { items: editedHls };
    if (currentGate === "review_tcs" && editedTcs) return { items: editedTcs };
    return undefined;
  }

  function validateEdits(): string | null {
    if (!editMode) return null;
    if (currentGate === "review_requirements" && editedReqs) {
      if (editedReqs.some((r) => !r.text.trim())) return "Requirement text must not be empty.";
    }
    if (currentGate === "review_hls" && editedHls) {
      if (editedHls.some((h) => !h.title.trim())) return "Scenario title must not be empty.";
    }
    if (currentGate === "review_tcs" && editedTcs) {
      if (editedTcs.some((t) => !t.title.trim())) return "Test case title must not be empty.";
      if (editedTcs.some((t) => !t.hls_id.trim())) return "HLS ID must be selected for all test cases.";
    }
    return null;
  }

  function onReqsChange(items: REQItem[]) {
    const prevReqs = (editedReqs ?? runState?.requirements_analysis?.requirements ?? []) as REQItem[];
    if (items.length < prevReqs.length) {
      // A delete happened — detect removed IDs, renumber, cascade to HLS linked_requirements
      const deletedIds = new Set(prevReqs.map((r) => r.id).filter((id) => !items.some((r) => r.id === id)));
      const idMap = new Map<string, string>();
      const renumbered = items.map((r, i) => {
        const newId = `REQ-${String(i + 1).padStart(3, "0")}`;
        idMap.set(r.id, newId);
        return { ...r, id: newId };
      });
      const prevHls = (editedHls ?? runState?.hls_list ?? []) as HLSItem[];
      const updatedHls = prevHls.map((h) => ({
        ...h,
        linked_requirements: h.linked_requirements
          .filter((rid) => !deletedIds.has(rid))
          .map((rid) => idMap.get(rid) ?? rid),
      }));
      setEditedReqs(renumbered);
      setEditedHls(updatedHls);
    } else {
      setEditedReqs(items);
    }
    setShowValidation(false);
  }

  function onHlsChange(items: HLSItem[]) {
    const prevHls = (editedHls ?? runState?.hls_list ?? []) as HLSItem[];
    if (items.length < prevHls.length) {
      // A delete happened — detect removed IDs, renumber (preserve HLS-EXP), cascade to TC hls_id
      const deletedIds = new Set(prevHls.map((h) => h.id).filter((id) => !items.some((h) => h.id === id)));
      let counter = 0;
      const idMap = new Map<string, string>();
      const renumbered = items.map((h) => {
        if (h.id === "HLS-EXP") { idMap.set("HLS-EXP", "HLS-EXP"); return h; }
        counter++;
        const newId = `HLS-${String(counter).padStart(3, "0")}`;
        idMap.set(h.id, newId);
        return { ...h, id: newId };
      });
      const prevTcs = (editedTcs ?? runState?.tc_list ?? []) as TCItem[];
      const orphaned: string[] = [];
      const updatedTcs = prevTcs.map((t) => {
        if (deletedIds.has(t.hls_id)) {
          orphaned.push(t.id);
          return { ...t, hls_id: "HLS-EXP" };
        }
        const newHlsId = idMap.get(t.hls_id);
        return newHlsId && newHlsId !== t.hls_id ? { ...t, hls_id: newHlsId } : t;
      });
      setEditedHls(renumbered);
      setEditedTcs(updatedTcs);
      if (orphaned.length > 0) {
        setOrphanedTcIds((prev) => new Set([...prev, ...orphaned]));
      }
    } else {
      setEditedHls(items);
    }
    setShowValidation(false);
  }

  function onTcsChange(items: TCItem[]) {
    const prevTcs = (editedTcs ?? runState?.tc_list ?? []) as TCItem[];
    if (items.length < prevTcs.length) {
      // A delete happened — renumber TCs, update orphanedTcIds with new IDs
      const idMap = new Map<string, string>();
      const renumbered = items.map((t, i) => {
        const newId = `TC-${String(i + 1).padStart(3, "0")}`;
        idMap.set(t.id, newId);
        return { ...t, id: newId };
      });
      setEditedTcs(renumbered);
      setOrphanedTcIds((prev) => {
        const updated = new Set<string>();
        prev.forEach((id) => { const mapped = idMap.get(id); if (mapped) updated.add(mapped); });
        return updated;
      });
    } else {
      setEditedTcs(items);
    }
    setShowValidation(false);
  }

  async function handleApprove(projectName?: string) {
    if (!runId || !currentGate) return;
    if (editMode) {
      const validErr = validateEdits();
      if (validErr) {
        setShowValidation(true);
        addToast({ title: "Fill in required fields before approving", message: validErr, variant: "warning" });
        return;
      }
    }
    const prevGate = currentGate;
    setLoading(true);
    setIsLoading(true);
    setCurrentGate(null);
    clearFallback();
    try {
      const resolvedProjectName = prevGate === "review_scripts" ? (projectName || null) : null;
      const resolvedJiraIds = prevGate === "review_jira" && editMode ? (jiraSelectedTcIds ?? null) : null;
      const { interrupted_at, state_snapshot } = await apiResume(
        runId,
        prevGate,
        true,
        null,
        buildEdits() ?? null,
        resolvedProjectName,
        nodeProviders,
        resolvedJiraIds,
      );
      addActivity(`Approved ${prevGate.replace("review_", "")}${editMode ? " with edits" : ""}`, "action");
      setIsLoading(false);
      setRunState(state_snapshot);
      setCurrentGate(interrupted_at);
      if (!interrupted_at) isCompletedRef.current = true;
    } catch (e) {
      setIsLoading(false);
      setCurrentGate(prevGate);
      handleResumeError(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleReject(feedback: string) {
    if (!runId || !currentGate) return;
    const prevGate = currentGate;
    setLoading(true);
    setIsLoading(true);
    setCurrentGate(null);
    clearFallback();
    try {
      const { interrupted_at, state_snapshot } = await apiResume(
        runId,
        prevGate,
        false,
        feedback,
        null,
        null,
        nodeProviders
      );
      addActivity(`Rejected ${prevGate.replace("review_", "")} · regenerating`, "action");
      setIsLoading(false);
      setRunState(state_snapshot);
      setCurrentGate(interrupted_at);
      if (!interrupted_at) isCompletedRef.current = true;
    } catch (e) {
      setIsLoading(false);
      setCurrentGate(prevGate);
      handleResumeError(e);
    } finally {
      setLoading(false);
    }
  }

  const reqs     = (editedReqs ?? runState?.requirements_analysis?.requirements) as REQItem[] | undefined;
  const hlsList  = (editedHls ?? runState?.hls_list) as HLSItem[] | undefined;
  const tcList   = (editedTcs ?? runState?.tc_list) as TCItem[] | undefined;
  const ticketData = runState?.ticket_data as TicketData | null | undefined;
  const displayGate = viewingGate ?? currentGate;
  const isViewOnly = viewingGate !== null;
  const displayGateMeta = displayGate ? GATE_META[displayGate] : null;
  const gateMeta = currentGate ? GATE_META[currentGate] : null;

  // ── Launch screen ─────────────────────────────────────────────────────────

  if (!runId) {
    const { ticketId, isValid } = extractTicketId(ticketInput);
    return (
      <div
        className="flex flex-col items-center"
        style={{
          background: "transparent",
          minHeight: "100vh",
          justifyContent: "flex-start",
          paddingTop: 80,
          paddingBottom: 40,
          paddingLeft: 20,
          paddingRight: 20,
          overflowY: "auto",
          boxSizing: "border-box",
        }}
      >
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />

        {/* Card */}
        <div
          className="w-full flex flex-col gap-7 animate-fade-up"
          style={{
            maxWidth: 480,
            background: "rgba(15,24,41,0.88)",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 20,
            padding: "36px 32px",
            boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(29,200,184,0.05)",
          }}
        >
          {/* Icon + title */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: "rgba(29,200,184,0.1)",
                border: "1px solid rgba(29,200,184,0.2)",
                boxShadow: "0 0 24px rgba(29,200,184,0.12)",
              }}
            >
              <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="#1dc8b8" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text tracking-tight">SDET Agent</h1>
              <p className="text-sm text-muted mt-1">AI-powered end-to-end test pipeline</p>
            </div>
          </div>

          {/* Pipeline stage tags */}
          <div className="flex items-center justify-center gap-1 flex-wrap">
            {PIPELINE_STAGES.map((stage, i) => (
              <div key={stage} className="flex items-center gap-1">
                <span
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full"
                  style={{
                    background: "rgba(29,200,184,0.08)",
                    color: "rgba(29,200,184,0.7)",
                    border: "1px solid rgba(29,200,184,0.15)",
                  }}
                >
                  {stage}
                </span>
                {i < PIPELINE_STAGES.length - 1 && (
                  <span style={{ color: "rgba(107,114,128,0.3)", fontSize: 10 }}>→</span>
                )}
              </div>
            ))}
          </div>

          {/* Platform selector */}
          <div className="flex flex-col gap-3">
            <div
              className="flex gap-1"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid #1f2937",
                borderRadius: 10,
                padding: 4,
              }}
            >
              {/* Jira tab */}
              <button
                onClick={() => !isLaunching && setPlatform("jira")}
                disabled={isLaunching}
                className="flex-1 flex flex-col items-center gap-1 transition-all disabled:opacity-40"
                style={{
                  padding: "10px 16px",
                  borderRadius: 7,
                  border: platform === "jira" ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
                  background: platform === "jira" ? "rgba(255,255,255,0.06)" : "transparent",
                  cursor: "pointer",
                }}
              >
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "#2684FF" }} />
                  <span className="text-[13px] font-medium" style={{ color: platform === "jira" ? "#fff" : "#8896a8" }}>
                    Jira
                  </span>
                </div>
                <span className="text-[10px]" style={{ color: "#8896a8" }}>Connected</span>
              </button>

              {/* Azure tab — disabled */}
              <div
                className="flex-1 flex flex-col items-center gap-1 select-none"
                style={{
                  padding: "10px 16px",
                  borderRadius: 7,
                  border: "1px solid transparent",
                  opacity: 0.4,
                  cursor: "not-allowed",
                  pointerEvents: "none",
                }}
              >
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "#0078D4" }} />
                  <span className="text-[13px] font-medium" style={{ color: "#8896a8" }}>Azure DevOps</span>
                </div>
                <span className="text-[10px]" style={{ color: "#8896a8" }}>Coming Soon</span>
              </div>
            </div>

            {/* Ticket input */}
            <div className="flex flex-col gap-2">
              <input
                type="text"
                className="w-full rounded-xl px-4 py-3 text-sm text-text placeholder-muted/40 focus:outline-none font-mono transition-all"
                style={{
                  background: "rgba(8,13,20,0.6)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
                placeholder={
                  platform === "jira"
                    ? "JIRA ticket ID or full URL  (e.g. PROJ-123)"
                    : "Azure work item ID or URL  (e.g. 42)"
                }
                value={ticketInput}
                onChange={(e) => { setTicketInput(e.target.value); setLaunchError(null); }}
                onKeyDown={(e) => e.key === "Enter" && !isLaunching && handleStart()}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(29,200,184,0.35)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                disabled={isLaunching}
              />

              {ticketInput.trim() && (
                isValid ? (
                  <p className="text-[11px]" style={{ color: "#1dc8b8" }}>
                    Ticket ID: {ticketId} ✓
                  </p>
                ) : ticketInput.trim().length > 3 ? (
                  <p className="text-[11px]" style={{ color: "#ef4444" }}>
                    Invalid format — use PROJ-123 or full Jira URL
                  </p>
                ) : null
              )}

            </div>

            {/* Jira Settings */}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowJiraSettings((v) => !v)}
                className="flex items-center gap-1.5 text-[13px] self-start transition-colors"
                style={{ color: "rgba(107,114,128,0.6)", background: "none", border: "none", padding: 0 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(136,150,168,0.9)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(107,114,128,0.6)"; }}
              >
                <span>Jira Settings</span>
                <span style={{ fontSize: 10 }}>{showJiraSettings ? "▲" : "▼"}</span>
              </button>

              <div
                style={{
                  maxHeight: showJiraSettings ? 300 : 0,
                  overflow: "hidden",
                  opacity: showJiraSettings ? 1 : 0,
                  transition: "max-height 0.3s ease-out, opacity 0.2s ease",
                }}
              >
                <div
                  className="flex flex-col gap-3 rounded-lg p-4"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(31,41,55,1)",
                    opacity: isLaunching ? 0.5 : 1,
                    pointerEvents: isLaunching ? "none" : "auto",
                    transition: "opacity 0.2s",
                  }}
                >
                  <div>
                    <p className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: "rgba(107,114,128,0.5)" }}>Jira Configuration</p>
                    <p className="text-[12px] mt-0.5" style={{ color: "rgba(107,114,128,0.5)" }}>Override defaults for test case creation</p>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold" style={{ color: "rgba(107,114,128,0.7)" }}>Test Case Project Key</label>
                    <input
                      type="text"
                      value={jiraTcProjectKey}
                      onChange={(e) => setJiraTcProjectKey(e.target.value)}
                      placeholder="e.g. TRKDJP (leave empty to use ticket's project)"
                      className="w-full rounded-lg px-3 py-2 text-[13px] outline-none"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "#dde4ef",
                      }}
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold" style={{ color: "rgba(107,114,128,0.7)" }}>Functional Area</label>
                    <input
                      type="text"
                      value={jiraFunctionalArea}
                      onChange={(e) => setJiraFunctionalArea(e.target.value)}
                      placeholder="Must match Jira dropdown exactly"
                      className="w-full rounded-lg px-3 py-2 text-[13px] outline-none"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "#dde4ef",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Advanced Settings */}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex items-center gap-1.5 text-[13px] self-start transition-colors"
                style={{ color: "rgba(107,114,128,0.6)", background: "none", border: "none", padding: 0 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(136,150,168,0.9)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(107,114,128,0.6)"; }}
              >
                <span>Advanced Settings</span>
                <span style={{ fontSize: 10 }}>{showAdvanced ? "▲" : "▼"}</span>
              </button>

              <div
                style={{
                  maxHeight: showAdvanced ? 500 : 0,
                  overflow: "hidden",
                  opacity: showAdvanced ? 1 : 0,
                  transition: "max-height 0.3s ease-out, opacity 0.2s ease",
                }}
              >
                <div
                  className="flex flex-col gap-3 rounded-lg p-4"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(31,41,55,1)",
                    opacity: isLaunching ? 0.5 : 1,
                    pointerEvents: isLaunching ? "none" : "auto",
                    transition: "opacity 0.2s",
                  }}
                >
                  <div>
                    <p className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: "rgba(107,114,128,0.5)" }}>Pipeline Steps</p>
                    <p className="text-[12px] mt-0.5" style={{ color: "rgba(107,114,128,0.5)" }}>Toggle steps to skip in this run</p>
                  </div>
                  {([
                    { key: "test_data_planning", label: "Test Data Planning", desc: "Plan data requirements for each TC" },
                    { key: "generate_scripts",   label: "Generate Scripts",   desc: "Generate Playwright .spec.ts files" },
                    { key: "execute_tests",      label: "Execute Tests",      desc: "Run automated tests in browser" },
                  ] as const).map(({ key, label, desc }) => {
                    const isOff = skipSteps.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSkipSteps((prev) =>
                          isOff ? prev.filter((k) => k !== key) : [...prev, key]
                        )}
                        className="flex items-center gap-3 text-left w-full"
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                      >
                        {/* Toggle switch */}
                        <div
                          style={{
                            width: 36, height: 20, borderRadius: 10, flexShrink: 0, position: "relative",
                            background: isOff ? "#1e2d3d" : "#1dc8b8",
                            transition: "background 0.2s",
                          }}
                        >
                          <div
                            style={{
                              width: 14, height: 14, borderRadius: "50%", background: "#fff",
                              position: "absolute", top: 3,
                              left: isOff ? 3 : 19,
                              transition: "left 0.2s",
                            }}
                          />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-semibold" style={{ color: isOff ? "rgba(107,114,128,0.5)" : "#dde4ef" }}>{label}</span>
                          <span className="text-[11px]" style={{ color: "rgba(107,114,128,0.45)" }}>{desc}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Launch button */}
            <div className="relative group">
              <button
                onClick={handleStart}
                disabled={isLaunching || !isValid || !ticketInput.trim()}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
                style={{
                  background: isLaunching
                    ? "rgba(29,200,184,0.3)"
                    : "linear-gradient(135deg, #1dc8b8 0%, #0d9488 100%)",
                  boxShadow: isLaunching ? "none" : "0 4px 20px rgba(29,200,184,0.35)",
                }}
              >
                {isLaunching ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin-slow" />
                    Launching…
                  </span>
                ) : (
                  "Launch Pipeline →"
                )}
              </button>
              {!isLaunching && (!isValid || !ticketInput.trim()) && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg text-[11px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10"
                  style={{ background: "rgba(17,24,39,0.95)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(156,163,175,0.9)" }}
                >
                  Enter a valid Jira ticket ID or URL
                </div>
              )}
            </div>

            {/* Timed launch status */}
            {launchMsg && (
              <p className="text-center text-[11px]" style={{ color: "rgba(107,114,128,0.55)" }}>
                {launchMsg}
              </p>
            )}

            {/* Launch error card */}
            {launchError && (
              <div
                className="relative flex flex-col"
                style={{
                  background: "rgba(15,24,41,0.9)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderLeft: `3px solid ${
                    launchError.type === "not_found" || launchError.type === "rate_limit"
                      ? "#f59e0b"
                      : "#ef4444"
                  }`,
                  borderRadius: 8,
                  padding: "14px 16px",
                }}
              >
                {/* Header: icon + bold title */}
                <div className="flex items-center gap-2 pr-6">
                  <span className="text-sm select-none">
                    {launchError.type === "not_found" ? "🔍" :
                     launchError.type === "auth" ? "🔒" :
                     launchError.type === "rate_limit" ? "⏱️" :
                     launchError.type === "connection" ? "🔌" :
                     launchError.type === "validation" ? "⚠️" : "❌"}
                  </span>
                  <span className="text-sm font-semibold text-text">{launchError.title}</span>
                </div>

                {/* Dismiss */}
                <button
                  onClick={() => setLaunchError(null)}
                  className="absolute top-3 right-3.5 text-[12px] leading-none opacity-40 hover:opacity-80 transition-opacity"
                  style={{ color: "#94a3b8" }}
                >
                  ✕
                </button>

                {/* Message */}
                <p className="text-[13px] leading-relaxed mt-2" style={{ color: "#94a3b8" }}>
                  {launchError.message}
                </p>

                {/* Suggestion */}
                {launchError.type === "not_found" && (
                  <p className="text-[12px] mt-1.5" style={{ color: "#475569" }}>
                    Make sure the ticket exists and your Jira credentials have access to this project.
                  </p>
                )}
                {launchError.type === "auth" && (
                  <p className="text-[12px] mt-1.5" style={{ color: "#475569" }}>
                    Check JIRA_API_TOKEN and JIRA_AUTH_TYPE in your .env file.
                  </p>
                )}
                {launchError.type === "rate_limit" && (
                  <p className="text-[12px] mt-1.5" style={{ color: "#475569" }}>
                    Switch to a different AI provider or wait for the rate limit to reset.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Header shown on launch screen too */}
        <Header provider={provider} onProviderChange={handleProviderChange} runId={null} providerStatus={isLaunching ? "running" : "home"} />
      </div>
    );
  }

  // ── Pipeline layout ───────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col text-text overflow-hidden" style={{ background: "transparent" }}>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* New Run confirmation modal */}
      {showNewRunModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.72)" }}
            onClick={() => setShowNewRunModal(false)}
          />
          <div
            className="relative z-10 flex flex-col gap-4 animate-fade-up"
            style={{
              background: "#0e1726",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding: 24,
              maxWidth: 360,
              width: "calc(100% - 32px)",
            }}
          >
            <h2 className="text-base font-bold text-text">Start a New Run?</h2>
            <p className="text-sm leading-relaxed" style={{ color: "#8896a8" }}>
              This will leave the current run. The run will remain accessible via its Run ID if you need it later.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowNewRunModal(false)}
                className="px-4 py-2 text-sm rounded-lg transition-all"
                style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#8896a8" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; e.currentTarget.style.color = "#dde4ef"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#8896a8"; }}
              >
                Cancel
              </button>
              <button
                onClick={handleNewRun}
                className="px-4 py-2 text-sm font-semibold rounded-lg transition-all"
                style={{ background: "#1dc8b8", color: "#000", boxShadow: "0 2px 12px rgba(29,200,184,0.3)" }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
              >
                Start New Run
              </button>
            </div>
          </div>
        </div>
      )}

      <Header
        provider={(() => {
          if (isViewOnly && viewingGate) {
            const node = GATE_TO_NODE[viewingGate];
            const used = node ? (runState?.node_providers as Record<string, string> | undefined)?.[node] as Provider | undefined : undefined;
            return used ?? provider;
          }
          return provider;
        })()}
        onProviderChange={handleProviderChange}
        runId={runId}
        onNewRun={() => setShowNewRunModal(true)}
        providerStatus={isViewOnly ? "done" : isLoading ? "running" : currentGate ? "gate" : "done"}
      />

      {/* Body below fixed header */}
      <div className="flex flex-1 overflow-hidden" style={{ paddingTop: 44 }}>
        {/* Sidebar */}
        <aside
          className="w-[220px] shrink-0 overflow-y-auto"
          style={{
            background: "rgba(9,15,28,0.6)",
            borderRight: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <Stepper
            state={runState}
            currentGate={currentGate}
            completedNodes={completedNodes}
            isProcessing={isLoading}
            viewingGate={viewingGate}
            onStepClick={(gate) => {
              if (gate === currentGate) setViewingGate(null);
              else setViewingGate((prev) => prev === gate ? null : gate);
            }}
          />
        </aside>

        {/* Main column */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Content header */}
          {displayGateMeta ? (
            <div
              className="shrink-0 px-7 py-4 flex items-center gap-4"
              style={{
                background: "rgba(15,24,41,0.5)",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Phase badge */}
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider"
                    style={
                      displayGateMeta.phase === 1
                        ? { background: "rgba(29,200,184,0.1)", color: "#1dc8b8", border: "1px solid rgba(29,200,184,0.2)" }
                        : { background: "rgba(157,110,247,0.1)", color: "#9d6ef7", border: "1px solid rgba(157,110,247,0.2)" }
                    }
                  >
                    PHASE {displayGateMeta.phase} · {displayGateMeta.phase === 1 ? "ANALYSIS" : "AUTOMATION"}
                  </span>
                  {/* Step counter */}
                  <span className="text-[11px] font-mono" style={{ color: "rgba(107,114,128,0.5)" }}>
                    STEP {displayGateMeta.step} OF {TOTAL_STEPS}
                  </span>
                  {/* Status badge — PROCESSING / VIEW ONLY / AWAITING REVIEW */}
                  {isLoading ? (
                    <span
                      className="text-[11px] font-semibold flex items-center gap-1.5"
                      style={{
                        background: "rgba(245,158,11,0.1)",
                        border: "1px solid rgba(245,158,11,0.3)",
                        color: "#f59e0b",
                        padding: "3px 10px",
                        borderRadius: 4,
                        letterSpacing: "0.05em",
                      }}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full animate-spin shrink-0"
                        style={{ border: "1.5px solid rgba(245,158,11,0.35)", borderTopColor: "#f59e0b" }}
                      />
                      PROCESSING
                    </span>
                  ) : isViewOnly ? (
                    <span
                      className="text-[11px] font-semibold uppercase tracking-wider"
                      style={{
                        background: "rgba(245,158,11,0.1)",
                        color: "#f59e0b",
                        border: "1px solid rgba(245,158,11,0.2)",
                        padding: "3px 10px",
                        borderRadius: 4,
                      }}
                    >
                      VIEW ONLY
                    </span>
                  ) : currentGate ? (
                    <span
                      className="text-[11px] font-semibold flex items-center gap-1.5"
                      style={{
                        background: "rgba(29,200,184,0.1)",
                        border: "1px solid rgba(29,200,184,0.3)",
                        color: "#1dc8b8",
                        padding: "3px 10px",
                        borderRadius: 4,
                        letterSpacing: "0.05em",
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse shrink-0" />
                      AWAITING REVIEW
                    </span>
                  ) : null}
                </div>
                <h1 className="text-xl font-bold text-text leading-tight">{displayGateMeta.title}</h1>
                <p className="text-sm text-muted">{displayGateMeta.subtitle}</p>
              </div>

              {/* Back to current gate button when in view-only mode */}
              {isViewOnly && (
                <button
                  onClick={() => setViewingGate(null)}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ background: "rgba(255,255,255,0.04)", color: "#f9fafb", border: "1px solid rgba(255,255,255,0.1)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
                  </svg>
                  Back to current
                </button>
              )}
            </div>
          ) : (
            <div
              className="shrink-0 px-7 py-4"
              style={{
                background: "rgba(15,24,41,0.5)",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: runState?.error ? "#ef4444" : "#1dc8b8",
                    boxShadow: runState?.error ? "0 0 6px #ef444460" : "0 0 6px #1dc8b860",
                    animation: runState?.error ? "none" : "pulse 2s ease-in-out infinite",
                  }}
                />
                <span className="text-sm font-medium text-text">
                  {runState?.error
                    ? "Pipeline error"
                    : completedNodes.length > 0
                    ? "Pipeline completed"
                    : "Pipeline running"}
                </span>
                <span className="text-sm text-muted">
                  {runState?.error
                    ? `· ${runState.error}`
                    : completedNodes.length > 0
                    ? `· ${completedNodes.length} nodes completed`
                    : "· polling for next gate…"}
                </span>
              </div>
            </div>
          )}

          {/* Scrollable content body */}
          <div className="flex-1 overflow-y-auto px-7 py-6">
            {/* Gate panels — rendered for displayGate (active or viewed) */}
            {displayGate === "review_requirements" && reqs && (
              <RequirementsPanel
                requirements={reqs}
                ambiguities={runState?.requirements_analysis?.ambiguities ?? []}
                contradictions={runState?.requirements_analysis?.contradictions ?? []}
                assumptions={runState?.requirements_analysis?.assumptions ?? []}
                editMode={!isViewOnly && editMode}
                onItemsChange={onReqsChange}
                showValidation={showValidation}
              />
            )}

            {displayGate === "review_hls" && hlsList && (
              <HlsPanel
                hlsList={hlsList}
                editMode={!isViewOnly && editMode}
                onItemsChange={onHlsChange}
                reqIds={runState?.requirements_analysis?.requirements?.map((r) => r.id) ?? []}
                showValidation={showValidation}
              />
            )}

            {displayGate === "review_tcs" && tcList && (
              <TcPanel
                tcList={tcList}
                editMode={!isViewOnly && editMode}
                onItemsChange={onTcsChange}
                reqIds={runState?.requirements_analysis?.requirements?.map((r) => r.id) ?? []}
                hlsItems={runState?.hls_list?.map((h) => ({ id: h.id, title: h.title })) ?? []}
                showValidation={showValidation}
                orphanedTcIds={orphanedTcIds}
              />
            )}

            {displayGate === "review_coverage" && runState?.coverage_report && (
              <CoveragePanel coverageReport={runState.coverage_report} />
            )}

            {displayGate === "review_jira" && runState?.tc_list && (
              <WriteJiraPanel
                tcList={runState.tc_list}
                ticketData={runState.ticket_data as TicketData | null}
                editMode={editMode}
                onSelectionChange={setJiraSelectedTcIds}
                onSkip={() => handleApprove()}
              />
            )}

            {displayGate === "review_classifications" && runState?.tc_classifications && (
              <ClassificationsView
                data={runState.tc_classifications as Record<string, unknown>[]}
                tcList={runState.tc_list as unknown as Record<string, unknown>[] | undefined}
              />
            )}

            {displayGate === "review_scripts" && runState?.scripts_written && (
              <ScriptsView data={runState.scripts_written as Record<string, unknown>[]} />
            )}

            {displayGate === "review_report" && runState?.report && (
              <ReportView data={runState.report} />
            )}

            {/* Running / idle state — only when not viewing a past gate */}
            {!displayGate && (
              <div className="h-full flex items-center justify-center">
                {runState?.error ? (
                  <div
                    className="max-w-md w-full rounded-xl p-6 flex flex-col gap-3"
                    style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)" }}
                  >
                    <p className="text-sm font-semibold text-red">Pipeline Error</p>
                    <p className="text-sm text-muted leading-relaxed">{runState.error}</p>
                  </div>
                ) : isLoading ? (
                  <div className="flex flex-col items-center gap-4 text-center animate-fade-up">
                    <div className="relative w-12 h-12">
                      <div
                        className="absolute inset-0 rounded-full animate-ws-pulse"
                        style={{ border: "2px solid #1dc8b8" }}
                      />
                      <div
                        className="absolute inset-0 rounded-full animate-ws-pulse"
                        style={{ border: "2px solid #1dc8b8", animationDelay: "0.5s" }}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-medium" style={{ color: "#1dc8b8" }}>Processing</p>
                      <p className="text-xs text-muted">Pipeline is running…</p>
                    </div>
                  </div>
                ) : ticketData ? (
                  <TicketCard data={ticketData} />
                ) : (
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div className="w-10 h-10 border-2 border-teal/30 border-t-teal rounded-full animate-spin-slow" />
                    <p className="text-sm text-muted">Waiting for pipeline…</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Activity log drawer */}
          <div
            className="shrink-0 transition-all overflow-hidden"
            style={{
              height: logOpen ? 200 : 32,
              background: "rgba(8,13,20,0.7)",
              borderTop: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            {/* Drawer header */}
            <button
              onClick={() => setLogOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 h-8 text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono tracking-widest" style={{ color: "rgba(107,114,128,0.5)" }}>
                  ACTIVITY LOG
                </span>
                {activityLog.length > 0 && (
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: "rgba(29,200,184,0.1)", color: "#1dc8b8" }}
                  >
                    {activityLog.length}
                  </span>
                )}
              </div>
              <svg
                className={`w-3 h-3 transition-transform ${logOpen ? "rotate-180" : ""}`}
                viewBox="0 0 20 20"
                fill="currentColor"
                style={{ color: "rgba(107,114,128,0.4)" }}
              >
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Log entries */}
            {logOpen && (
              <div className="overflow-y-auto px-4 pb-3 flex flex-col gap-1" style={{ height: 168 }}>
                {activityLog.length === 0 ? (
                  <p className="text-[11px] font-mono" style={{ color: "rgba(107,114,128,0.4)" }}>
                    No activity yet…
                  </p>
                ) : (
                  [...activityLog].reverse().map((entry) => (
                    <div key={entry.id} className="flex items-start gap-2">
                      <span className="font-mono text-[10px] shrink-0" style={{ color: "rgba(107,114,128,0.4)" }}>
                        {entry.ts}
                      </span>
                      <span className="font-mono text-[11px]" style={{ color: ACTIVITY_COLOR[entry.type] }}>
                        {entry.text}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Gate action bar — hidden when browsing past gates */}
          {currentGate && !isViewOnly && (
            <GateActionBar
              gate={currentGate}
              editMode={editMode}
              featureSlug={(runState as Record<string, unknown> | null)?.feature_slug as string | undefined}
              onEditModeToggle={() => { setEditMode((m) => !m); setShowValidation(false); }}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Inline sub-components ─────────────────────────────────────────────────────

function TicketCard({ data }: { data: TicketData }) {
  const [expanded, setExpanded] = useState(false);
  const desc = data.description ?? "";
  const preview = desc.slice(0, 200);
  const hasMore = desc.length > 200;

  return (
    <div
      className="w-full max-w-md flex flex-col gap-4 rounded-2xl p-6 animate-fade-up"
      style={{
        background: "#0e1726",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      <div className="flex items-start gap-3 flex-wrap">
        <span className="text-base font-semibold text-text flex-1 min-w-0">
          {data.summary ?? "Ticket loaded"}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {data.type && (
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded"
              style={{ background: "rgba(29,200,184,0.1)", color: "#1dc8b8", border: "1px solid rgba(29,200,184,0.2)" }}
            >
              {data.type}
            </span>
          )}
          {data.priority && (
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded"
              style={{
                background:
                  data.priority.toLowerCase() === "high" || data.priority.toLowerCase() === "critical"
                    ? "rgba(239,68,68,0.1)"
                    : data.priority.toLowerCase() === "medium"
                    ? "rgba(245,158,11,0.1)"
                    : "rgba(34,197,94,0.1)",
                color:
                  data.priority.toLowerCase() === "high" || data.priority.toLowerCase() === "critical"
                    ? "#ef4444"
                    : data.priority.toLowerCase() === "medium"
                    ? "#f59e0b"
                    : "#22c55e",
                border:
                  data.priority.toLowerCase() === "high" || data.priority.toLowerCase() === "critical"
                    ? "1px solid rgba(239,68,68,0.25)"
                    : data.priority.toLowerCase() === "medium"
                    ? "1px solid rgba(245,158,11,0.25)"
                    : "1px solid rgba(34,197,94,0.25)",
              }}
            >
              {data.priority}
            </span>
          )}
        </div>
      </div>

      {desc && (
        <p className="text-sm text-muted leading-relaxed">
          {expanded ? desc : preview}
          {hasMore && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="ml-1 text-xs"
              style={{ color: "#1dc8b8" }}
            >
              {expanded ? "show less" : "…show more"}
            </button>
          )}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <span
          className="text-[10px] font-semibold px-2.5 py-1 rounded"
          style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)" }}
        >
          Fetched ✓
        </span>
        <span className="text-[11px] text-muted">Pipeline continuing…</span>
      </div>
    </div>
  );
}

type ClassFilter = "all" | "automated" | "manual" | "hybrid";

function ClassificationsView({ data, tcList }: { data: Record<string, unknown>[]; tcList?: Record<string, unknown>[] }) {
  const [filter, setFilter] = useState<ClassFilter>("all");

  function getTitle(tcId: string): string {
    const tc = tcList?.find((t) => t.id === tcId);
    return String(tc?.title ?? "—");
  }

  const filtered = filter === "all" ? data : data.filter((item) => {
    const mode = String(item.mode ?? item.classification ?? item.type ?? "").toLowerCase();
    return mode === filter;
  });

  const FILTERS: ClassFilter[] = ["all", "automated", "manual", "hybrid"];
  const filterLabel = { all: "All", automated: "Automated", manual: "Manual", hybrid: "Hybrid" };

  return (
    <div className="flex flex-col gap-4 animate-fade-up">
      {/* Filter bar */}
      <div className="flex items-center gap-1">
        {FILTERS.map((f) => {
          const isActive = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all"
              style={
                isActive
                  ? { color: "#1dc8b8", borderBottom: "2px solid #1dc8b8", background: "rgba(29,200,184,0.06)", borderRadius: 0, padding: "6px 12px" }
                  : { color: "rgba(107,114,128,0.55)", borderBottom: "2px solid transparent", background: "transparent", borderRadius: 0, padding: "6px 12px" }
              }
            >
              {filterLabel[f]}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "rgba(8,13,20,0.6)" }}>
              <th className="text-left px-4 py-3 text-[11px] font-semibold tracking-wider" style={{ color: "rgba(107,114,128,0.6)" }}>TC ID</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold tracking-wider" style={{ color: "rgba(107,114,128,0.6)", maxWidth: 200 }}>Title</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold tracking-wider" style={{ color: "rgba(107,114,128,0.6)" }}>Mode</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold tracking-wider" style={{ color: "rgba(107,114,128,0.6)" }}>Tool</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold tracking-wider" style={{ color: "rgba(107,114,128,0.6)" }}>Confidence</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold tracking-wider" style={{ color: "rgba(107,114,128,0.6)" }}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, i) => {
              const mode = String(item.mode ?? item.classification ?? item.type ?? "unknown").toLowerCase();
              const modeColor = mode === "automated" ? "#1dc8b8" : mode === "manual" ? "#f59e0b" : mode === "hybrid" ? "#9d6ef7" : mode === "ui" ? "#9d6ef7" : mode === "api" ? "#1dc8b8" : "#6b7280";
              const tcIdStr = String(item.tc_id ?? item.id ?? "");
              const title = getTitle(tcIdStr) !== "—" ? getTitle(tcIdStr) : String(item.title ?? item.name ?? "—");
              const tool = String(item.tool ?? item.automation_tool ?? "—");
              const rawConf = item.confidence ?? item.confidence_score ?? null;
              const confidence = rawConf !== null ? `${Math.round(Number(rawConf) * 100)}%` : "—";
              const reason = String(item.reason ?? item.rationale ?? item.justification ?? "—");
              return (
                <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <td className="px-4 py-3 font-mono text-xs shrink-0" style={{ color: "#9d6ef7" }}>
                    {String(item.tc_id ?? item.id ?? `TC-${i + 1}`)}
                  </td>
                  <td className="px-4 py-3" style={{ maxWidth: 200 }} title={title}>
                    <span
                      style={{ display: "block", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, color: "rgba(136,150,168,0.8)" }}
                    >
                      {title}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-[11px] font-semibold px-2 py-0.5 rounded uppercase"
                      style={{ background: `${modeColor}15`, color: modeColor, border: `1px solid ${modeColor}30` }}
                    >
                      {mode}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "rgba(136,150,168,0.8)" }}>
                    {tool}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: rawConf !== null && Number(rawConf) >= 0.7 ? "#1dc8b8" : rawConf !== null ? "#f59e0b" : "rgba(107,114,128,0.5)" }}>
                    {confidence}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "rgba(136,150,168,0.7)", maxWidth: 240 }}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }} title={reason}>
                      {reason}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScriptsView({ data }: { data: Record<string, unknown>[] }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-3 animate-fade-up">
      {data.map((script, i) => {
        const filename = String(script.filename ?? script.name ?? script.file ?? `script_${i + 1}.spec.ts`);
        const content = String(script.content ?? script.code ?? "");
        const isExpanded = expandedIdx === i;
        return (
          <div
            key={i}
            className="rounded-xl overflow-hidden"
            style={{ background: "#0e1726", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <button
              onClick={() => setExpandedIdx(isExpanded ? null : i)}
              className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors"
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="#1dc8b8" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
                </svg>
                <span className="font-mono text-xs text-text/80">{filename}</span>
              </div>
              <svg
                className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                viewBox="0 0 20 20"
                fill="currentColor"
                style={{ color: "rgba(107,114,128,0.5)" }}
              >
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>
            {isExpanded && content && (
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <pre
                  className="text-xs font-mono overflow-x-auto p-4 max-h-80"
                  style={{
                    background: "rgba(8,13,20,0.5)",
                    color: "rgba(249,250,251,0.75)",
                    lineHeight: 1.6,
                  }}
                >
                  {content}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReportView({ data }: { data: Record<string, unknown> }) {
  const summary = data.summary as Record<string, unknown> | undefined;
  const results = Array.isArray(data.results) ? data.results as Record<string, unknown>[] : [];
  const pct = typeof data.coverage_percentage === "number" ? data.coverage_percentage : null;
  const passed = typeof summary?.passed === "number" ? summary.passed : null;
  const failed = typeof summary?.failed === "number" ? summary.failed : null;
  const skipped = typeof summary?.skipped === "number" ? summary.skipped : null;

  return (
    <div className="flex flex-col gap-5 animate-fade-up">
      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3">
        {pct !== null && (
          <div className="rounded-xl p-4" style={{ background: "#0e1726", border: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="text-2xl font-bold" style={{ color: "#1dc8b8" }}>{pct}%</span>
            <p className="text-xs text-muted mt-1">Coverage</p>
          </div>
        )}
        {passed !== null && (
          <div className="rounded-xl p-4" style={{ background: "#0e1726", border: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="text-2xl font-bold" style={{ color: "#22c55e" }}>{passed}</span>
            <p className="text-xs text-muted mt-1">Passed</p>
          </div>
        )}
        {failed !== null && (
          <div className="rounded-xl p-4" style={{ background: "#0e1726", border: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="text-2xl font-bold" style={{ color: "#ef4444" }}>{failed}</span>
            <p className="text-xs text-muted mt-1">Failed</p>
          </div>
        )}
        {skipped !== null && (
          <div className="rounded-xl p-4" style={{ background: "#0e1726", border: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="text-2xl font-bold" style={{ color: "#6b7280" }}>{skipped}</span>
            <p className="text-xs text-muted mt-1">Skipped</p>
          </div>
        )}
      </div>

      {/* Results list */}
      {results.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {results.map((r, i) => {
            const status = String(r.status ?? r.result ?? "unknown").toLowerCase();
            const statusColor = status === "passed" || status === "pass" ? "#22c55e"
              : status === "failed" || status === "fail" ? "#ef4444"
              : "#6b7280";
            return (
              <div
                key={i}
                className="rounded-xl p-4 flex items-start gap-3"
                style={{
                  background: "#0e1726",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderLeft: `3px solid ${statusColor}`,
                }}
              >
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold" style={{ color: "#9d6ef7" }}>
                      {String(r.tc_id ?? r.id ?? `TC-${i + 1}`)}
                    </span>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded uppercase"
                      style={{
                        background: `${statusColor}15`,
                        color: statusColor,
                        border: `1px solid ${statusColor}30`,
                      }}
                    >
                      {status}
                    </span>
                  </div>
                  {!!r.title && <p className="text-xs text-text/70">{String(r.title)}</p>}
                  {!!r.error && (
                    <p className="text-xs font-mono mt-1" style={{ color: "#ef444480" }}>
                      {String(r.error)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Fallback: raw JSON */}
      {results.length === 0 && !summary && (
        <pre
          className="text-xs font-mono overflow-x-auto rounded-xl p-4"
          style={{
            background: "rgba(8,13,20,0.6)",
            border: "1px solid rgba(255,255,255,0.06)",
            color: "rgba(107,114,128,0.8)",
          }}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function WriteJiraPanel({
  tcList,
  ticketData,
  editMode,
  onSelectionChange,
  onSkip,
}: {
  tcList: unknown[];
  ticketData: TicketData | null;
  editMode: boolean;
  onSelectionChange: (ids: string[]) => void;
  onSkip: () => void;
}) {
  const tcs = tcList as { id?: string; title?: string; priority?: string; type?: string }[];
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Initialize all selected when tc list loads or changes length
  useEffect(() => {
    setSelectedIds(new Set(tcs.map((tc, i) => tc.id ?? `TC-${i + 1}`)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tcs.length]);

  // Reset to all selected whenever edit mode is turned on
  useEffect(() => {
    if (editMode) {
      setSelectedIds(new Set(tcs.map((tc, i) => tc.id ?? `TC-${i + 1}`)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode]);

  // Notify parent of selection changes — in effect, never during render
  useEffect(() => {
    onSelectionChange(Array.from(selectedIds));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);

  function toggleTc(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  const ticketId = (ticketData as Record<string, unknown> | null)?.key as string | undefined
    ?? (ticketData as Record<string, unknown> | null)?.id as string | undefined;
  const summary = ticketData?.summary;

  const PRIORITY_COLOR: Record<string, string> = {
    high: "#ef4444", critical: "#ef4444",
    medium: "#f59e0b",
    low: "#22c55e",
  };

  return (
    <div className="flex flex-col gap-5 animate-fade-up">
      {/* Parent ticket card */}
      {(ticketId || summary) && (
        <div
          className="flex items-center gap-2 flex-wrap rounded-xl p-4"
          style={{ background: "#0e1726", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          {ticketId && (
            <span
              className="font-mono text-xs font-bold px-2 py-0.5 rounded"
              style={{ background: "rgba(38,132,255,0.12)", color: "#2684FF", border: "1px solid rgba(38,132,255,0.25)" }}
            >
              {ticketId}
            </span>
          )}
          {summary && (
            <span className="text-sm font-medium text-text">{summary}</span>
          )}
        </div>
      )}

      {/* Skip JIRA button */}
      <div className="flex justify-start">
        <button
          onClick={onSkip}
          className="px-4 py-2 text-sm rounded-lg transition-all"
          style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: "#8896a8" }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)"; e.currentTarget.style.color = "#dde4ef"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "#8896a8"; }}
        >
          Skip JIRA
        </button>
      </div>

      {/* Selection counter — only in edit mode */}
      {editMode && (
        <div className="flex items-center gap-2 text-xs" style={{ color: "rgba(136,150,168,0.7)" }}>
          <span>
            <span className="font-semibold" style={{ color: selectedIds.size === tcs.length ? "#1dc8b8" : "#f59e0b" }}>
              {selectedIds.size}
            </span>
            {" of "}{tcs.length} selected
          </span>
          {selectedIds.size < tcs.length && (
            <button
              onClick={() => setSelectedIds(new Set(tcs.map((tc, i) => tc.id ?? `TC-${i + 1}`)))}
              className="text-[11px] underline"
              style={{ background: "none", border: "none", padding: 0, color: "rgba(29,200,184,0.7)", cursor: "pointer" }}
            >
              select all
            </button>
          )}
        </div>
      )}

      {/* TC table */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "rgba(8,13,20,0.6)" }}>
              {editMode && <th className="w-10 px-3 py-3" />}
              {["TC ID", "Title", "Priority", "Type", "Action"].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold tracking-wider" style={{ color: "rgba(107,114,128,0.6)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tcs.map((tc, i) => {
              const id = tc.id ?? `TC-${i + 1}`;
              const isChecked = selectedIds.has(id);
              const priority = (tc.priority ?? "medium").toLowerCase();
              const pColor = PRIORITY_COLOR[priority] ?? "#6b7280";
              const type = String(tc.type ?? "functional");
              const rowOpacity = editMode && !isChecked ? 0.35 : 1;
              return (
                <tr
                  key={id}
                  style={{
                    borderTop: "1px solid rgba(255,255,255,0.04)",
                    opacity: rowOpacity,
                    transition: "opacity 0.15s",
                    cursor: editMode ? "pointer" : "default",
                  }}
                  onClick={editMode ? () => toggleTc(id) : undefined}
                >
                  {editMode && (
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleTc(id)}
                        style={{ accentColor: "#1dc8b8", width: 14, height: 14, cursor: "pointer" }}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 font-mono text-xs font-bold" style={{ color: "#1dc8b8", textDecoration: editMode && !isChecked ? "line-through" : "none" }}>
                    {id}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "rgba(221,228,239,0.75)", maxWidth: 280 }}>
                    <span
                      style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={tc.title ?? ""}
                    >
                      {tc.title ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize"
                      style={{ background: `${pColor}15`, color: pColor, border: `1px solid ${pColor}30` }}
                    >
                      {priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs capitalize" style={{ color: "rgba(136,150,168,0.7)" }}>
                    {type}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded"
                      style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)" }}
                    >
                      {editMode && !isChecked ? "Skip" : "Create"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
