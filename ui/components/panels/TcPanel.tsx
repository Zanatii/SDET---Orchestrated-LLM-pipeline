"use client";

import { useState } from "react";
import { TCItem, TCStep } from "@/types";

interface TcPanelProps {
  tcList: TCItem[];
  editMode: boolean;
  onItemsChange: (items: TCItem[]) => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red/20 text-red border-red/30",
  high:     "bg-amber/20 text-amber border-amber/30",
  medium:   "bg-teal/20 text-teal border-teal/30",
  low:      "bg-muted/20 text-muted border-border",
};

function priorityColor(priority: string) {
  return PRIORITY_COLORS[priority.toLowerCase()] ?? "bg-muted/20 text-muted border-border";
}

function TcCard({
  tc,
  index,
  editMode,
  onChange,
}: {
  tc: TCItem;
  index: number;
  editMode: boolean;
  onChange: (updated: TCItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  function handleStepChange(stepIdx: number, field: keyof TCStep, value: string) {
    const updatedSteps = tc.steps.map((s, i) =>
      i === stepIdx ? { ...s, [field]: value } : s
    );
    onChange({ ...tc, steps: updatedSteps });
  }

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      {/* Header row — always visible */}
      <button
        onClick={() => setExpanded((o) => !o)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-bg/30 transition-colors"
      >
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <span className="font-mono text-xs font-bold text-purple bg-purple/10 border border-purple/30 rounded px-2 py-0.5">
            {tc.id}
          </span>
          <span className={`text-[11px] px-2 py-0.5 rounded border font-medium ${priorityColor(tc.priority)}`}>
            {tc.priority}
          </span>
          <span className="text-sm text-text leading-snug">{tc.title}</span>
        </div>
        <svg
          className={`w-4 h-4 text-muted shrink-0 mt-0.5 transition-transform ${expanded ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 flex flex-col gap-4">
          {/* Linked chips */}
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-teal/10 border border-teal/30 text-teal">
              {tc.hls_id}
            </span>
            {tc.linked_requirements.map((req) => (
              <span
                key={req}
                className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-bg border border-border text-muted"
              >
                {req}
              </span>
            ))}
          </div>

          {/* Preconditions */}
          {tc.preconditions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted uppercase tracking-wider mb-1.5">Preconditions</p>
              <ul className="flex flex-col gap-1">
                {tc.preconditions.map((pre, i) => (
                  <li key={i} className="text-sm text-text flex gap-2">
                    <span className="text-muted">•</span>
                    <span>{typeof pre === "string" ? pre : JSON.stringify(pre)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Steps table */}
          <div>
            <p className="text-xs font-medium text-muted uppercase tracking-wider mb-1.5">Steps</p>
            <div className="rounded border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-bg/60 text-muted text-xs">
                    <th className="text-left px-3 py-2 w-6 font-medium">#</th>
                    <th className="text-left px-3 py-2 font-medium">Action</th>
                    <th className="text-left px-3 py-2 font-medium">Expected</th>
                  </tr>
                </thead>
                <tbody>
                  {tc.steps.map((step, si) => (
                    <tr key={si} className="border-t border-border">
                      <td className="px-3 py-2 text-muted text-xs">{si + 1}</td>
                      <td className="px-3 py-2">
                        {editMode ? (
                          <input
                            className="w-full bg-bg border border-teal/50 rounded px-2 py-1 text-text text-xs focus:outline-none focus:border-teal"
                            value={step.action}
                            onChange={(e) => handleStepChange(si, "action", e.target.value)}
                          />
                        ) : (
                          <span className="text-text">{step.action}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editMode ? (
                          <input
                            className="w-full bg-bg border border-teal/50 rounded px-2 py-1 text-text text-xs focus:outline-none focus:border-teal"
                            value={step.expected}
                            onChange={(e) => handleStepChange(si, "expected", e.target.value)}
                          />
                        ) : (
                          <span className="text-muted">{step.expected}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TcPanel({ tcList, editMode, onItemsChange }: TcPanelProps) {
  function handleChange(index: number, updated: TCItem) {
    onItemsChange(tcList.map((tc, i) => (i === index ? updated : tc)));
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-text">
        Test Cases
        <span className="ml-2 text-sm font-normal text-muted">({tcList.length})</span>
      </h2>

      <div className="flex flex-col gap-2.5">
        {tcList.map((tc, i) => (
          <TcCard
            key={tc.id}
            tc={tc}
            index={i}
            editMode={editMode}
            onChange={(updated) => handleChange(i, updated)}
          />
        ))}
      </div>
    </div>
  );
}
