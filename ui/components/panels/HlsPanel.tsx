"use client";

import { HLSItem } from "@/types";

interface HlsPanelProps {
  hlsList: HLSItem[];
  editMode: boolean;
  onItemsChange: (items: HLSItem[]) => void;
}

const TYPE_COLORS: Record<string, string> = {
  functional:    "bg-teal/20 text-teal border-teal/30",
  non_functional:"bg-purple/20 text-purple border-purple/30",
};

function typeColor(type: string) {
  return TYPE_COLORS[type.toLowerCase()] ?? "bg-muted/20 text-muted border-border";
}

export default function HlsPanel({ hlsList, editMode, onItemsChange }: HlsPanelProps) {
  function handleChange(index: number, field: "title" | "description", value: string) {
    const updated = hlsList.map((h, i) =>
      i === index ? { ...h, [field]: value } : h
    );
    onItemsChange(updated);
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-text">
        High-Level Scenarios
        <span className="ml-2 text-sm font-normal text-muted">({hlsList.length})</span>
      </h2>

      <div className="flex flex-col gap-3">
        {hlsList.map((hls, i) => {
          const isExp = hls.id === "HLS-EXP";
          return (
            <div
              key={hls.id}
              className={`rounded-lg border bg-surface p-4 flex flex-col gap-2 ${
                isExp ? "border-amber/40" : "border-border"
              }`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`font-mono text-xs font-bold rounded px-2 py-0.5 border ${
                    isExp
                      ? "text-amber bg-amber/10 border-amber/30"
                      : "text-teal bg-teal/10 border-teal/30"
                  }`}
                >
                  {hls.id}
                </span>

                {isExp && (
                  <span className="text-[11px] px-2 py-0.5 rounded border border-amber/40 text-amber font-medium">
                    Exploratory
                  </span>
                )}

                {!isExp && (
                  <span className={`text-[11px] px-2 py-0.5 rounded border font-medium ${typeColor(hls.type)}`}>
                    {hls.type}
                  </span>
                )}
              </div>

              {editMode ? (
                <>
                  <input
                    className="text-sm font-medium text-text bg-bg border border-teal/50 rounded px-3 py-1.5 focus:outline-none focus:border-teal w-full"
                    value={hls.title}
                    onChange={(e) => handleChange(i, "title", e.target.value)}
                  />
                  <textarea
                    className="text-sm text-muted bg-bg border border-teal/50 rounded px-3 py-2 resize-none focus:outline-none focus:border-teal w-full"
                    rows={3}
                    value={hls.description}
                    onChange={(e) => handleChange(i, "description", e.target.value)}
                  />
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-text">{hls.title}</p>
                  <p className="text-sm text-muted leading-relaxed">{hls.description}</p>
                </>
              )}

              {/* Linked REQ chips */}
              {hls.linked_requirements.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {hls.linked_requirements.map((req) => (
                    <span
                      key={req}
                      className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-bg border border-border text-muted"
                    >
                      {req}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
