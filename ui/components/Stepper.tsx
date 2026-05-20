"use client";

import { useState, useEffect } from "react";
import { AgentState, PIPELINE_STEPS, PipelineStep, StepStatus } from "@/types";

// ── Status helpers ────────────────────────────────────────────────────────────

function getStepStatus(
  step: PipelineStep,
  state: AgentState | null,
  currentGate: string | null
): StepStatus {
  if (!state) return "pending";

  if (step.gate) {
    const review = state[step.gate as keyof AgentState] as { action?: string; approved?: boolean } | null;
    const isApproved = review?.action === "approve" || review?.approved === true;
    const isRejected = review?.action === "reject" || review?.approved === false;
    if (isApproved) {
      return state._auto_approved_reason && currentGate !== step.gate
        ? "auto-approved"
        : "approved";
    }
    if (isRejected) return "rejected";
    if (currentGate === step.gate) {
      return state._auto_approved_reason ? "auto-approved" : "active";
    }
  }

  if (step.outputKey) {
    const val = state[step.outputKey];
    if (val !== null && val !== undefined) return "approved";
  }

  return "pending";
}

function getCurrentPhase(state: AgentState | null, currentGate: string | null): 1 | 2 {
  if (!state) return 1;
  const phase2Steps = PIPELINE_STEPS.filter((s) => s.phase === 2);
  for (const step of phase2Steps) {
    if (getStepStatus(step, state, currentGate) !== "pending") return 2;
  }
  return 1;
}

function feedbackCount(state: AgentState, nodeKey: string | null): number {
  if (!nodeKey || !state.feedback_injected) return 0;
  const text = state.feedback_injected[nodeKey];
  if (!text) return 0;
  const matches = text.match(/# Example/g);
  return matches ? matches.length : 1;
}

function CheckIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// Gates that have browsable panel content
const VIEWABLE_GATES = new Set([
  "review_requirements",
  "review_hls",
  "review_tcs",
  "review_coverage",
  "review_jira",
  "review_classifications",
  "review_scripts",
  "review_report",
]);

// ── Stepper ───────────────────────────────────────────────────────────────────

interface StepperProps {
  state: AgentState | null;
  currentGate: string | null;
  completedNodes: string[];
  isProcessing?: boolean;
  viewingGate?: string | null;
  onStepClick?: (gate: string) => void;
}

export default function Stepper({
  state,
  currentGate,
  isProcessing = false,
  viewingGate,
  onStepClick,
}: StepperProps) {
  const currentPhase = getCurrentPhase(state, currentGate);
  const phase2Reached = currentPhase === 2;

  const [selectedTab, setSelectedTab] = useState<1 | 2>(currentPhase);

  useEffect(() => {
    setSelectedTab(currentPhase);
  }, [currentPhase]);

  const tealColor = "#1dc8b8";
  const purpleColor = "#9d6ef7";

  const tabColor = selectedTab === 1 ? tealColor : purpleColor;
  const isLocked = selectedTab === 2 && !phase2Reached;

  const tabSteps = PIPELINE_STEPS.filter((s) => s.phase === selectedTab);
  const currentPhaseSteps = PIPELINE_STEPS.filter((s) => s.phase === currentPhase);

  const doneCount = tabSteps.filter((s) => {
    const st = getStepStatus(s, state, currentGate);
    return st === "approved" || st === "auto-approved";
  }).length;

  const displayStepNum = Math.min(doneCount + 1, tabSteps.length);

  let shimmerStepId: string | null = null;
  if (isProcessing) {
    for (const step of currentPhaseSteps) {
      if (getStepStatus(step, state, currentGate) === "pending") {
        shimmerStepId = step.id;
        break;
      }
    }
  }

  return (
    <nav className="flex flex-col select-none h-full">
      {/* Phase tabs */}
      <div className="flex shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {([1, 2] as const).map((ph) => {
          const isTabActive = selectedTab === ph;
          const color = ph === 1 ? tealColor : purpleColor;
          return (
            <button
              key={ph}
              onClick={() => setSelectedTab(ph)}
              className="flex-1 py-3 text-[11px] font-bold tracking-widest uppercase transition-all"
              style={
                isTabActive
                  ? {
                      color,
                      background: ph === 1 ? "rgba(29,200,184,0.06)" : "rgba(157,110,247,0.06)",
                      borderBottom: `2px solid ${color}`,
                    }
                  : {
                      color: "rgba(136,150,168,0.45)",
                      background: "transparent",
                      borderBottom: "2px solid transparent",
                    }
              }
            >
              PHASE {ph}
            </button>
          );
        })}
      </div>

      {/* Step count */}
      <div className="px-4 py-2 shrink-0">
        <span className="text-[10px] font-mono tabular-nums" style={{ color: "rgba(107,114,128,0.5)" }}>
          {isLocked
            ? `${tabSteps.length} STEPS · LOCKED`
            : `STEP ${displayStepNum} OF ${tabSteps.length}`}
        </span>
      </div>

      {/* Step list */}
      <div key={`tab-${selectedTab}`} className="flex flex-col pb-3 animate-fade-up overflow-y-auto flex-1">
        {tabSteps.map((step, idx) => {
          const num = idx + 1;

          // ── Locked Phase 2 ──────────────────────────────────────────────────
          if (isLocked) {
            return (
              <div
                key={step.id}
                className="flex items-center gap-3 rounded-lg mb-0.5"
                style={{ padding: "8px 12px" }}
                title="Complete Phase 1 to unlock"
              >
                <div
                  className="shrink-0 flex items-center justify-center font-mono font-bold"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    fontSize: 11,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    color: "rgba(107,114,128,0.25)",
                  }}
                >
                  {num}
                </div>
                <span className="text-[13px] font-medium" style={{ color: "#475569" }}>
                  {step.label}
                </span>
              </div>
            );
          }

          // ── Normal step ─────────────────────────────────────────────────────
          const status = getStepStatus(step, state, currentGate);
          const isActive = status === "active";
          const isDone = status === "approved" || status === "auto-approved";
          const isRejected = status === "rejected";
          const isShimmer = shimmerStepId === step.id;
          const fbCount = state ? feedbackCount(state, step.feedbackNodeKey) : 0;
          const isViewing = step.gate !== null && step.gate === viewingGate;
          const isSkipped = !!(step.skipKey && state?.skip_steps?.includes(step.skipKey));
          const isClickable = !isSkipped && !!onStepClick && step.gate !== null && !isProcessing && (
            (isDone && VIEWABLE_GATES.has(step.gate)) ||
            (isActive && viewingGate != null)
          );

          // ── Skipped step ────────────────────────────────────────────────────
          if (isSkipped) {
            return (
              <div
                key={step.id}
                className="flex items-center gap-3 rounded-lg mb-0.5"
                style={{ padding: "8px 12px" }}
              >
                <div
                  className="shrink-0 flex items-center justify-center font-mono font-bold"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    fontSize: 14,
                    background: "rgba(245,158,11,0.1)",
                    border: "1px solid rgba(245,158,11,0.2)",
                    color: "#f59e0b",
                  }}
                >
                  —
                </div>
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <span className="text-[13px] font-medium leading-tight" style={{ color: "#475569" }}>
                    {step.label}
                  </span>
                  <span
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded self-start"
                    style={{ border: "1px solid rgba(245,158,11,0.35)", color: "#f59e0b", background: "rgba(245,158,11,0.06)" }}
                  >
                    SKIPPED
                  </span>
                </div>
              </div>
            );
          }

          // Badge style based on status
          const isPurple = selectedTab === 2;
          const badgeStyle: React.CSSProperties = isActive
            ? {
                width: 28,
                height: 28,
                borderRadius: 6,
                fontSize: 11,
                background: isPurple ? "rgba(157,110,247,0.2)" : "rgba(29,200,184,0.2)",
                border: `1px solid ${isPurple ? "rgba(157,110,247,0.5)" : "rgba(29,200,184,0.5)"}`,
                color: tabColor,
                boxShadow: isPurple ? "0 0 8px rgba(157,110,247,0.3)" : "0 0 8px rgba(29,200,184,0.3)",
                animation: isPurple ? "border-pulse-purple 2s ease-in-out infinite" : "border-pulse 2s ease-in-out infinite",
              }
            : isDone
            ? {
                width: 28,
                height: 28,
                borderRadius: 6,
                fontSize: 11,
                background: isPurple ? "rgba(157,110,247,0.15)" : "rgba(29,200,184,0.15)",
                border: "1px solid transparent",
                color: tabColor,
              }
            : isRejected
            ? {
                width: 28,
                height: 28,
                borderRadius: 6,
                fontSize: 11,
                background: "rgba(239,68,68,0.15)",
                border: "1px solid rgba(239,68,68,0.4)",
                color: "#ef4444",
              }
            : {
                width: 28,
                height: 28,
                borderRadius: 6,
                fontSize: 11,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                color: "rgba(107,114,128,0.5)",
              };

          const nameColor = isActive ? "#e2e8f0" : isDone ? "#64748b" : "#475569";

          return (
            <div
              key={step.id}
              className={`flex items-center gap-3 rounded-lg mb-0.5 transition-all${isShimmer ? " animate-shimmer" : ""}`}
              style={{
                padding: "8px 12px",
                background: isViewing
                  ? (isPurple ? "rgba(157,110,247,0.08)" : "rgba(29,200,184,0.08)")
                  : isActive
                  ? (isPurple ? "rgba(157,110,247,0.05)" : "rgba(29,200,184,0.05)")
                  : "transparent",
                cursor: isClickable ? "pointer" : "default",
              }}
              onClick={() => isClickable && step.gate && onStepClick(step.gate)}
              onMouseEnter={(e) => {
                if (isClickable && !isViewing && !isActive) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                }
              }}
              onMouseLeave={(e) => {
                if (isClickable && !isViewing && !isActive) {
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              {/* Status badge */}
              <div
                className="shrink-0 flex items-center justify-center font-mono font-bold"
                style={badgeStyle}
              >
                {isDone ? <CheckIcon /> : isRejected ? "✕" : num}
              </div>

              {/* Label + tags */}
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[13px] font-medium leading-tight" style={{ color: nameColor }}>
                    {step.label}
                  </span>
                  {isViewing && (
                    <span
                      className="text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                      style={{ background: `${tabColor}10`, color: tabColor, border: `1px solid ${tabColor}20` }}
                    >
                      VIEWING
                    </span>
                  )}
                </div>

                {(isActive || status === "auto-approved" || isRejected || fbCount > 0) && (
                  <div className="flex flex-wrap gap-1">
                    {isActive && (
                      <span
                        className="text-[9px] font-bold font-mono rounded"
                        style={{
                          padding: "1px 6px",
                          background: "rgba(29,200,184,0.1)",
                          color: "#1dc8b8",
                          borderRadius: 3,
                        }}
                      >
                        ACTIVE
                      </span>
                    )}
                    {status === "auto-approved" && (
                      <span
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                        style={{ border: "1px solid rgba(245,158,11,0.4)", color: "#f59e0b" }}
                      >
                        auto
                      </span>
                    )}
                    {isRejected && (
                      <span
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                        style={{ border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444" }}
                      >
                        rejected
                      </span>
                    )}
                    {fbCount > 0 && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded"
                        style={{ border: "1px solid rgba(245,158,11,0.3)", color: "rgba(245,158,11,0.7)" }}
                      >
                        📚 {fbCount}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Chevron hint for clickable steps */}
              {isClickable && (
                <svg
                  className="w-3 h-3 shrink-0"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  style={{ color: `${tabColor}60` }}
                >
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
