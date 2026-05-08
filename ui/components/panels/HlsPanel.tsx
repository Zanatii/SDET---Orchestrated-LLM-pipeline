"use client";

import { useEffect, useState } from "react";
import { HLSItem } from "@/types";

interface HlsPanelProps {
  hlsList: HLSItem[];
  editMode: boolean;
  onItemsChange: (items: HLSItem[]) => void;
  reqIds?: string[];
  showValidation?: boolean;
}

const TYPE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  functional:     { bg: "rgba(29,200,184,0.1)",  color: "#1dc8b8", border: "rgba(29,200,184,0.25)" },
  non_functional: { bg: "rgba(157,110,247,0.1)", color: "#9d6ef7", border: "rgba(157,110,247,0.25)" },
  positive:       { bg: "rgba(29,200,184,0.1)",  color: "#1dc8b8", border: "rgba(29,200,184,0.25)" },
  negative:       { bg: "rgba(239,68,68,0.1)",   color: "#ef4444", border: "rgba(239,68,68,0.25)"  },
  edge:           { bg: "rgba(245,158,11,0.1)",  color: "#f59e0b", border: "rgba(245,158,11,0.25)" },
  exploratory:    { bg: "rgba(157,110,247,0.1)", color: "#9d6ef7", border: "rgba(157,110,247,0.25)" },
};

function typeStyle(type: string) {
  return TYPE_COLORS[type.toLowerCase()] ?? { bg: "rgba(107,114,128,0.1)", color: "#6b7280", border: "rgba(107,114,128,0.2)" };
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  );
}

function NewBadge() {
  return (
    <span style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e", fontSize: 10, padding: "2px 6px", borderRadius: 3, fontWeight: 600, letterSpacing: "0.04em" }}>
      NEW
    </span>
  );
}

export default function HlsPanel({ hlsList, editMode, onItemsChange, reqIds, showValidation }: HlsPanelProps) {
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    const current = new Set(hlsList.map((h) => h.id));
    setNewIds((prev) => {
      const stale = [...prev].filter((id) => !current.has(id));
      if (stale.length === 0) return prev;
      return new Set([...prev].filter((id) => current.has(id)));
    });
  }, [hlsList]);

  function nextId(): string {
    const nums = hlsList
      .map((h) => h.id.match(/^HLS-(\d+)$/i))
      .filter(Boolean)
      .map((m) => parseInt(m![1], 10));
    return `HLS-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0")}`;
  }

  function handleAdd() {
    const id = nextId();
    onItemsChange([...hlsList, { id, title: "", description: "", type: "positive", linked_requirements: [] }]);
    setNewIds((prev) => new Set([...prev, id]));
  }

  function handleDelete(id: string) {
    onItemsChange(hlsList.filter((h) => h.id !== id));
    setNewIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    setConfirming(null);
  }

  function handleChange(index: number, field: "title" | "description", value: string) {
    onItemsChange(hlsList.map((h, i) => (i === index ? { ...h, [field]: value } : h)));
  }

  function handleTypeChange(index: number, value: string) {
    onItemsChange(hlsList.map((h, i) => (i === index ? { ...h, type: value } : h)));
  }

  function handleLinkedReqToggle(index: number, reqId: string) {
    const hls = hlsList[index];
    const linked = hls.linked_requirements.includes(reqId)
      ? hls.linked_requirements.filter((r) => r !== reqId)
      : [...hls.linked_requirements, reqId];
    onItemsChange(hlsList.map((h, i) => (i === index ? { ...h, linked_requirements: linked } : h)));
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-up">
      <div className="grid grid-cols-2 gap-3">
        {hlsList.map((hls, i) => {
          const isNew        = newIds.has(hls.id);
          const isExp        = hls.id === "HLS-EXP";
          const style        = typeStyle(hls.type);
          const idColor      = isExp ? "#f59e0b" : "#1dc8b8";
          const idBg         = isExp ? "rgba(245,158,11,0.1)" : "rgba(29,200,184,0.1)";
          const idBorder     = isExp ? "rgba(245,158,11,0.25)" : "rgba(29,200,184,0.25)";
          const titleInvalid = showValidation && isNew && !hls.title.trim();
          const isConfirming = confirming === hls.id;

          return (
            <div
              key={hls.id}
              className="rounded-xl p-4 flex flex-col gap-3 transition-all"
              style={{
                background: isNew ? "rgba(34,197,94,0.03)" : "#0e1726",
                border:    isExp ? "1px solid rgba(245,158,11,0.15)" : "1px solid rgba(255,255,255,0.06)",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                ...(isNew ? { borderLeft: "3px solid rgba(34,197,94,0.5)" } : {}),
              }}
            >
              {/* Header row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded" style={{ background: idBg, color: idColor, border: `1px solid ${idBorder}` }}>
                  {hls.id}
                </span>

                {editMode && isNew ? (
                  <select
                    value={hls.type}
                    onChange={(e) => handleTypeChange(i, e.target.value)}
                    className="text-[11px] px-2 py-0.5 rounded font-medium focus:outline-none"
                    style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
                  >
                    <option value="positive">positive</option>
                    <option value="negative">negative</option>
                    <option value="edge">edge</option>
                    <option value="exploratory">exploratory</option>
                  </select>
                ) : isExp ? (
                  <span className="text-[11px] px-2 py-0.5 rounded font-medium" style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)" }}>
                    Exploratory
                  </span>
                ) : (
                  <span className="text-[11px] px-2 py-0.5 rounded font-medium" style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}>
                    {hls.type}
                  </span>
                )}

                {isNew && <NewBadge />}

                {/* Trash on all items except HLS-EXP */}
                {editMode && !isExp && (
                  <button
                    onClick={() => isNew ? handleDelete(hls.id) : setConfirming(isConfirming ? null : hls.id)}
                    className="ml-auto shrink-0 transition-colors"
                    style={{ color: isConfirming ? "rgba(239,68,68,0.9)" : "rgba(239,68,68,0.5)" }}
                    title="Remove"
                    onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(239,68,68,0.9)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = isConfirming ? "rgba(239,68,68,0.9)" : "rgba(239,68,68,0.5)"; }}
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>

              {/* Inline confirmation bar for existing items */}
              {isConfirming && (
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg -mt-1" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <span className="text-xs flex-1" style={{ color: "rgba(239,68,68,0.8)" }}>Delete this scenario?</span>
                  <button
                    onClick={() => setConfirming(null)}
                    className="text-xs px-3 py-1 rounded-md font-medium transition-colors"
                    style={{ background: "rgba(107,114,128,0.12)", color: "#8896a8", border: "1px solid rgba(107,114,128,0.2)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(107,114,128,0.2)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(107,114,128,0.12)"; }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDelete(hls.id)}
                    className="text-xs px-3 py-1 rounded-md font-medium transition-colors"
                    style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.2)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.12)"; }}
                  >
                    Confirm Delete
                  </button>
                </div>
              )}

              {/* Content */}
              {editMode ? (
                <div className="flex flex-col gap-2">
                  <input
                    className="text-sm font-medium text-text rounded-lg px-3 py-2 focus:outline-none w-full"
                    style={{
                      background: "rgba(8,13,20,0.5)",
                      border: titleInvalid ? "1px solid rgba(239,68,68,0.7)" : "1px solid rgba(29,200,184,0.3)",
                    }}
                    value={hls.title}
                    placeholder={isNew ? "Scenario title…" : undefined}
                    onChange={(e) => handleChange(i, "title", e.target.value)}
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus={isNew && hls.title === ""}
                  />
                  <textarea
                    className="text-sm text-muted rounded-lg px-3 py-2 resize-none focus:outline-none w-full"
                    style={{ background: "rgba(8,13,20,0.5)", border: "1px solid rgba(29,200,184,0.3)" }}
                    rows={3}
                    value={hls.description}
                    placeholder={isNew ? "Scenario description…" : undefined}
                    onChange={(e) => handleChange(i, "description", e.target.value)}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm font-semibold text-text leading-snug">{hls.title}</p>
                  <p className="text-xs text-muted leading-relaxed">{hls.description}</p>
                </div>
              )}

              {/* Linked requirements: toggle chips for new items, read-only chips otherwise */}
              {editMode && isNew && reqIds && reqIds.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(107,114,128,0.6)" }}>
                    Linked Requirements
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {reqIds.map((reqId) => {
                      const selected = hls.linked_requirements.includes(reqId);
                      return (
                        <button
                          key={reqId}
                          onClick={() => handleLinkedReqToggle(i, reqId)}
                          className="text-[10px] font-mono px-2 py-0.5 rounded-full transition-all"
                          style={{
                            background: selected ? "rgba(29,200,184,0.15)" : "rgba(8,13,20,0.4)",
                            color:      selected ? "#1dc8b8" : "rgba(107,114,128,0.7)",
                            border:     selected ? "1px solid rgba(29,200,184,0.35)" : "1px solid rgba(29,200,184,0.2)",
                          }}
                        >
                          {reqId}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : hls.linked_requirements.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {hls.linked_requirements.map((req) => (
                    <span key={req} className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: "rgba(8,13,20,0.4)", color: "rgba(107,114,128,0.8)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      {req}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {editMode && (
        <button
          onClick={handleAdd}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-colors"
          style={{ background: "rgba(20,184,166,0.08)", border: "1px dashed rgba(20,184,166,0.3)", color: "#14b8a6" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(20,184,166,0.15)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(20,184,166,0.08)"; }}
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Add Scenario
        </button>
      )}
    </div>
  );
}
