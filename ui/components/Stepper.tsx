"use client";

import { AgentState, PIPELINE_STEPS, PipelineStep, StepStatus } from "@/types";

interface StepperProps {
  state: AgentState | null;
  currentGate: string | null;
}

function getStepStatus(step: PipelineStep, state: AgentState | null, currentGate: string | null): StepStatus {
  if (!state) return "pending";

  // Gate-bearing steps: check the review decision
  if (step.gate) {
    const review = state[step.gate as keyof AgentState] as { action?: string } | null;
    if (review?.action === "approve") {
      // Was this the gate that triggered auto-approval? We can only infer if
      // _auto_approved_reason is set AND the gate is now past current.
      return state._auto_approved_reason && currentGate !== step.gate
        ? "auto-approved"
        : "approved";
    }
    if (review?.action === "reject") return "rejected";
    if (currentGate === step.gate) {
      return state._auto_approved_reason ? "auto-approved" : "active";
    }
  }

  // Non-gate steps: show approved style if output exists
  if (step.outputKey) {
    const val = state[step.outputKey];
    if (val !== null && val !== undefined) return "approved";
  }

  return "pending";
}

function feedbackCount(state: AgentState, nodeKey: string | null): number {
  if (!nodeKey || !state.feedback_injected) return 0;
  const text = state.feedback_injected[nodeKey];
  if (!text) return 0;
  // Count "# Example" markers; fall back to 1 if present but no markers
  const matches = text.match(/# Example/g);
  return matches ? matches.length : 1;
}

const STATUS_STYLES: Record<StepStatus, string> = {
  pending:       "text-muted border-border",
  active:        "text-teal border-teal animate-pulse-ring",
  approved:      "text-green border-green",
  rejected:      "text-red border-red",
  "auto-approved": "text-amber border-amber",
};

const STATUS_LABELS: Record<StepStatus, string> = {
  pending:         "pending",
  active:          "active",
  approved:        "approved",
  rejected:        "rejected",
  "auto-approved": "auto",
};

export default function Stepper({ state, currentGate }: StepperProps) {
  let lastPhase: number | null = null;

  return (
    <nav className="py-4 px-3 flex flex-col gap-0.5 select-none">
      {PIPELINE_STEPS.map((step) => {
        const showDivider = lastPhase !== null && step.phase !== lastPhase;
        lastPhase = step.phase;
        const status = getStepStatus(step, state, currentGate);
        const phaseColor = step.phase === 1 ? "teal" : "purple";
        const fbCount = state ? feedbackCount(state, step.feedbackNodeKey) : 0;
        const autoReason = status === "auto-approved" && state?._auto_approved_reason
          ? state._auto_approved_reason
          : null;

        return (
          <div key={step.id}>
            {showDivider && (
              <div className="my-3 border-t border-border" />
            )}
            <div
              className={`flex items-start gap-2.5 rounded-md px-2 py-2 transition-colors ${
                status === "active" ? "bg-surface" : "hover:bg-surface/50"
              }`}
            >
              {/* Phase dot */}
              <div
                className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                  step.phase === 1 ? "bg-teal" : "bg-purple"
                } ${status === "pending" ? "opacity-30" : "opacity-100"}`}
              />

              {/* Label + badges */}
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <span
                  className={`text-sm leading-tight truncate ${
                    status === "pending" ? "text-muted" : "text-text"
                  }`}
                >
                  {step.label}
                </span>

                <div className="flex flex-wrap gap-1">
                  {/* Status badge */}
                  <span
                    className={`inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded border ${STATUS_STYLES[status]}`}
                    title={autoReason ?? undefined}
                  >
                    {status === "auto-approved" && (
                      <svg className="w-2.5 h-2.5 mr-0.5 text-amber" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                    )}
                    {STATUS_LABELS[status]}
                  </span>

                  {/* Feedback injection badge */}
                  {fbCount > 0 && (
                    <span
                      className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border border-amber/40 text-amber/80"
                      title={`Feedback from past reviews was injected into this node's prompt`}
                    >
                      📚 {fbCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
