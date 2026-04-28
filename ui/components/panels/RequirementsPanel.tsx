"use client";

import { useState } from "react";
import { REQItem } from "@/types";

interface RequirementsPanelProps {
  requirements: REQItem[];
  ambiguities: Record<string, unknown>[];
  contradictions: Record<string, unknown>[];
  assumptions: Record<string, unknown>[];
  editMode: boolean;
  onItemsChange: (items: REQItem[]) => void;
}

const TYPE_COLORS: Record<string, string> = {
  functional:    "bg-teal/20 text-teal border-teal/30",
  non_functional:"bg-purple/20 text-purple border-purple/30",
  constraint:    "bg-amber/20 text-amber border-amber/30",
};

function typeColor(type: string) {
  return TYPE_COLORS[type.toLowerCase()] ?? "bg-muted/20 text-muted border-border";
}

function CollapsibleSection({ title, items }: { title: string; items: unknown[] }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-muted hover:text-text hover:bg-surface/50 transition-colors"
      >
        <span className="font-medium">{title} ({items.length})</span>
        <svg
          className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-3 pt-1 flex flex-col gap-2 border-t border-border">
          {(items as Record<string, unknown>[]).map((item, i) => (
            <div key={i} className="text-sm text-muted bg-bg/40 rounded px-3 py-2">
              {typeof item === "string" ? item : JSON.stringify(item)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RequirementsPanel({
  requirements,
  ambiguities,
  contradictions,
  assumptions,
  editMode,
  onItemsChange,
}: RequirementsPanelProps) {
  function handleTextChange(index: number, value: string) {
    const updated = requirements.map((r, i) => i === index ? { ...r, text: value } : r);
    onItemsChange(updated);
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-text">
        Requirements
        <span className="ml-2 text-sm font-normal text-muted">({requirements.length})</span>
      </h2>

      <div className="flex flex-col gap-3">
        {requirements.map((req, i) => (
          <div
            key={req.id}
            className="rounded-lg border border-border bg-surface p-4 flex flex-col gap-2"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold text-teal bg-teal/10 border border-teal/30 rounded px-2 py-0.5">
                {req.id}
              </span>
              <span className={`text-[11px] px-2 py-0.5 rounded border font-medium ${typeColor(req.type)}`}>
                {req.type}
              </span>
              {req.source && (
                <span className="text-[11px] px-2 py-0.5 rounded border border-border text-muted">
                  {req.source}
                </span>
              )}
            </div>

            {editMode ? (
              <textarea
                className="text-sm text-text bg-bg border border-teal/50 rounded px-3 py-2 resize-none focus:outline-none focus:border-teal w-full"
                rows={3}
                value={req.text}
                onChange={(e) => handleTextChange(i, e.target.value)}
              />
            ) : (
              <p className="text-sm text-text leading-relaxed">{req.text}</p>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <CollapsibleSection title="Ambiguities" items={ambiguities} />
        <CollapsibleSection title="Contradictions" items={contradictions} />
        <CollapsibleSection title="Assumptions" items={assumptions} />
      </div>
    </div>
  );
}
