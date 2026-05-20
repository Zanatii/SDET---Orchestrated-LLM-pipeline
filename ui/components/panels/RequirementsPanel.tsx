"use client";

import { useEffect, useState } from "react";
import { REQItem } from "@/types";

interface RequirementsPanelProps {
  requirements: REQItem[];
  ambiguities: Record<string, unknown>[];
  contradictions: Record<string, unknown>[];
  assumptions: Record<string, unknown>[];
  editMode: boolean;
  onItemsChange: (items: REQItem[]) => void;
  showValidation?: boolean;
  draftSaved?: boolean;
}

const TYPE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  functional:       { bg: "rgba(29,200,184,0.1)",  color: "#1dc8b8", border: "rgba(29,200,184,0.25)" },
  non_functional:   { bg: "rgba(157,110,247,0.1)", color: "#9d6ef7", border: "rgba(157,110,247,0.25)" },
  "non-functional": { bg: "rgba(157,110,247,0.1)", color: "#9d6ef7", border: "rgba(157,110,247,0.25)" },
  constraint:       { bg: "rgba(245,158,11,0.1)",  color: "#f59e0b", border: "rgba(245,158,11,0.25)" },
};

function typeStyle(type: string) {
  return TYPE_COLORS[type.toLowerCase()] ?? { bg: "rgba(107,114,128,0.1)", color: "#6b7280", border: "rgba(107,114,128,0.2)" };
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="flex flex-col gap-1 rounded-xl p-4"
      style={{ background: "#0e1726", border: "1px solid rgba(255,255,255,0.06)", borderTop: "1px solid rgba(255,255,255,0.08)" }}
    >
      <span className="text-2xl font-bold" style={{ color }}>{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

function safeParse(item: unknown): Record<string, unknown> {
  if (typeof item === "string") {
    try { return JSON.parse(item); } catch { return { description: item }; }
  }
  if (typeof item === "object" && item !== null) return item as Record<string, unknown>;
  return { description: String(item) };
}

const SECTION_META = {
  assumption:    { dot: "#f59e0b", badge: "#f59e0b" },
  ambiguity:     { dot: "#f97316", badge: "#f97316" },
  contradiction: { dot: "#ef4444", badge: "#ef4444" },
} as const;

function CollapsibleSection({ title, items, type }: { title: string; items: unknown[]; type: keyof typeof SECTION_META }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const meta = SECTION_META[type];
  const prefix = type === "assumption" ? "NOTE" : type === "ambiguity" ? "AMB" : "CON";

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted transition-colors"
        style={{ background: "rgba(15,24,41,0.6)" }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(17,24,39,0.9)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(17,24,39,0.6)"; }}
      >
        <span className="font-medium text-text/70">
          {title}
          <span className="ml-2 text-xs text-muted/60">({items.length})</span>
        </span>
        <svg className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-3 pt-2 flex flex-col gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(8,13,20,0.3)" }}>
          {items.map((raw, i) => {
            const item = safeParse(raw);
            const id = String(item.id ?? `${prefix}-${String(i + 1).padStart(3, "0")}`);
            const displayId = type === "assumption" ? id.replace(/^ASS-/i, "NOTE-") : id;
            const description = String(item.description ?? item.text ?? item.detail ?? "");
            const linkedReq = type === "ambiguity" ? (item.linked_req ?? item.linked_requirement ?? null) : null;
            return (
              <div key={i} className="flex items-start gap-3 rounded-md" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(31,41,55,1)", padding: "10px 14px" }}>
                <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{ background: meta.dot }} />
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded self-start" style={{ background: `${meta.badge}15`, color: meta.badge, border: `1px solid ${meta.badge}30` }}>
                    {displayId}
                  </span>
                  <p className="text-[13px] leading-relaxed" style={{ color: "rgba(221,228,239,0.75)" }}>{description}</p>
                  {linkedReq && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded self-start" style={{ background: "rgba(29,200,184,0.1)", color: "#1dc8b8", border: "1px solid rgba(29,200,184,0.2)" }}>
                      {String(linkedReq)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
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

export default function RequirementsPanel({
  requirements,
  ambiguities,
  contradictions,
  assumptions,
  editMode,
  onItemsChange,
  showValidation,
  draftSaved,
}: RequirementsPanelProps) {
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const current = new Set(requirements.map((r) => r.id));
    setNewIds((prev) => {
      const stale = [...prev].filter((id) => !current.has(id));
      if (stale.length === 0) return prev;
      return new Set([...prev].filter((id) => current.has(id)));
    });
  }, [requirements]);

  // Clear checkboxes when leaving edit mode
  useEffect(() => {
    if (!editMode) setCheckedIds(new Set());
  }, [editMode]);

  const funcCount       = requirements.filter((r) => r.type.toLowerCase() === "functional").length;
  const nonFuncCount    = requirements.filter((r) => ["non_functional", "non-functional"].includes(r.type.toLowerCase())).length;
  const constraintCount = requirements.filter((r) => r.type.toLowerCase() === "constraint").length;

  const allChecked = requirements.length > 0 && requirements.every((r) => checkedIds.has(r.id));

  function handleToggleCheck(id: string) {
    setCheckedIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  function handleSelectAll() {
    if (allChecked) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(requirements.map((r) => r.id)));
    }
  }

  function handleBulkDelete() {
    onItemsChange(requirements.filter((r) => !checkedIds.has(r.id)));
    setCheckedIds(new Set());
  }

  function nextId(): string {
    const nums = requirements
      .map((r) => r.id.match(/^REQ-(\d+)$/i))
      .filter(Boolean)
      .map((m) => parseInt(m![1], 10));
    return `REQ-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0")}`;
  }

  function handleAdd() {
    const id = nextId();
    onItemsChange([...requirements, { id, text: "", source: "description", type: "functional" }]);
    setNewIds((prev) => new Set([...prev, id]));
  }

  function handleDelete(id: string) {
    onItemsChange(requirements.filter((r) => r.id !== id));
    setNewIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    setConfirming(null);
  }

  function handleTextChange(index: number, value: string) {
    onItemsChange(requirements.map((r, i) => (i === index ? { ...r, text: value } : r)));
  }

  function handleTypeChange(index: number, value: string) {
    onItemsChange(requirements.map((r, i) => (i === index ? { ...r, type: value } : r)));
  }

  function handleSourceChange(index: number, value: string) {
    onItemsChange(requirements.map((r, i) => (i === index ? { ...r, source: value } : r)));
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-up">
      {/* Draft saved banner */}
      {draftSaved && (
        <div
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg"
          style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.22)" }}
        >
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#f59e0b" }} />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#f59e0b" }}>Draft Saved</span>
          <span className="text-xs" style={{ color: "rgba(245,158,11,0.6)" }}>— review below and click Approve when ready</span>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total"          value={requirements.length} color="#f9fafb" />
        <StatCard label="Functional"     value={funcCount}           color="#1dc8b8" />
        <StatCard label="Non-functional" value={nonFuncCount}        color="#9d6ef7" />
        <StatCard label="Constraints"    value={constraintCount}     color="#f59e0b" />
      </div>

      {/* Requirements list */}
      <div className="flex flex-col gap-2.5">
        {/* Bulk delete toolbar */}
        {editMode && (
          <div className="flex items-center gap-2 pb-1">
            <button
              onClick={handleSelectAll}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
              style={{
                background: allChecked ? "rgba(29,200,184,0.15)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${allChecked ? "rgba(29,200,184,0.35)" : "rgba(255,255,255,0.1)"}`,
                color: allChecked ? "#1dc8b8" : "#8896a8",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(29,200,184,0.12)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = allChecked ? "rgba(29,200,184,0.15)" : "rgba(255,255,255,0.04)"; }}
            >
              {allChecked ? "Deselect All" : "Select All"}
            </button>

            {checkedIds.size > 0 && (
              <button
                onClick={handleBulkDelete}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors"
                style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  color: "#ef4444",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.18)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; }}
              >
                Delete Selected ({checkedIds.size})
              </button>
            )}
          </div>
        )}

        {requirements.map((req, i) => {
          const isNew        = newIds.has(req.id);
          const style        = typeStyle(req.type);
          const textInvalid  = showValidation && isNew && !req.text.trim();
          const isConfirming = confirming === req.id;
          const isChecked    = checkedIds.has(req.id);

          return (
            <div
              key={req.id}
              className="rounded-xl p-4 flex flex-col gap-2.5 transition-all"
              style={{
                background:  isNew ? "rgba(34,197,94,0.03)" : "#0e1726",
                border:      "1px solid rgba(255,255,255,0.06)",
                borderLeft:  isChecked
                  ? "3px solid rgba(239,68,68,0.6)"
                  : isNew
                    ? "3px solid rgba(34,197,94,0.5)"
                    : `3px solid ${style.color}`,
                borderTop:   "1px solid rgba(255,255,255,0.08)",
                opacity:     isChecked ? 0.7 : 1,
              }}
            >
              {/* Header row */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Bulk delete checkbox */}
                {editMode && (
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggleCheck(req.id)}
                    className="shrink-0 w-3.5 h-3.5 rounded cursor-pointer accent-red-500"
                    style={{ accentColor: "#ef4444" }}
                  />
                )}

                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded" style={{ background: "rgba(29,200,184,0.1)", color: "#1dc8b8", border: "1px solid rgba(29,200,184,0.2)" }}>
                  {req.id}
                </span>

                {editMode && isNew ? (
                  <select
                    value={req.type}
                    onChange={(e) => handleTypeChange(i, e.target.value)}
                    className="text-[11px] px-2 py-0.5 rounded font-medium focus:outline-none"
                    style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
                  >
                    <option value="functional">functional</option>
                    <option value="non_functional">non-functional</option>
                    <option value="constraint">constraint</option>
                  </select>
                ) : (
                  <span className="text-[11px] px-2 py-0.5 rounded font-medium" style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}>
                    {req.type}
                  </span>
                )}

                {editMode && isNew ? (
                  <select
                    value={req.source}
                    onChange={(e) => handleSourceChange(i, e.target.value)}
                    className="text-[11px] px-2 py-0.5 rounded focus:outline-none"
                    style={{ border: "1px solid rgba(107,114,128,0.3)", color: "#6b7280" }}
                  >
                    <option value="description">description</option>
                    <option value="AC">AC</option>
                    <option value="constraint">constraint</option>
                  </select>
                ) : (
                  req.source && (
                    <span className="text-[11px] px-2 py-0.5 rounded" style={{ background: "rgba(107,114,128,0.1)", color: "#6b7280", border: "1px solid rgba(107,114,128,0.15)" }}>
                      {req.source}
                    </span>
                  )
                )}

                {isNew && <NewBadge />}

                {editMode && (
                  <button
                    onClick={() => isNew ? handleDelete(req.id) : setConfirming(isConfirming ? null : req.id)}
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
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <span className="text-xs flex-1" style={{ color: "rgba(239,68,68,0.8)" }}>Delete this requirement?</span>
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
                    onClick={() => handleDelete(req.id)}
                    className="text-xs px-3 py-1 rounded-md font-medium transition-colors"
                    style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.2)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.12)"; }}
                  >
                    Confirm Delete
                  </button>
                </div>
              )}

              {editMode ? (
                <textarea
                  className="text-sm text-text rounded-lg px-3 py-2 resize-none focus:outline-none w-full"
                  style={{
                    background: "rgba(8,13,20,0.5)",
                    border: textInvalid ? "1px solid rgba(239,68,68,0.7)" : "1px solid rgba(29,200,184,0.3)",
                  }}
                  rows={3}
                  value={req.text}
                  placeholder={isNew ? "Requirement text…" : undefined}
                  onChange={(e) => handleTextChange(i, e.target.value)}
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus={isNew && req.text === ""}
                />
              ) : (
                <p className="text-sm text-text/80 leading-relaxed">{req.text}</p>
              )}
            </div>
          );
        })}

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
            Add Requirement
          </button>
        )}
      </div>

      {/* Collapsible sections */}
      {(ambiguities.length > 0 || contradictions.length > 0 || assumptions.length > 0) && (
        <div className="flex flex-col gap-2">
          <CollapsibleSection title="Ambiguities"         items={Array.isArray(ambiguities)    ? ambiguities    : []} type="ambiguity" />
          <CollapsibleSection title="Contradictions"      items={Array.isArray(contradictions) ? contradictions : []} type="contradiction" />
          <CollapsibleSection title="Notes & Assumptions" items={Array.isArray(assumptions)    ? assumptions    : []} type="assumption" />
        </div>
      )}
    </div>
  );
}
