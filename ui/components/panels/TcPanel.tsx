"use client";

import { useEffect, useState } from "react";
import { TCItem, TCStep } from "@/types";

interface TcPanelProps {
  tcList: TCItem[];
  editMode: boolean;
  onItemsChange: (items: TCItem[]) => void;
  reqIds?: string[];
  hlsItems?: { id: string; title: string }[];
  showValidation?: boolean;
  orphanedTcIds?: Set<string>;
}

type PriorityFilter = "all" | "critical" | "high" | "medium" | "low";

const PRIORITY_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  critical: { bg: "rgba(239,68,68,0.1)",   color: "#ef4444", border: "rgba(239,68,68,0.25)"  },
  high:     { bg: "rgba(245,158,11,0.1)",  color: "#f59e0b", border: "rgba(245,158,11,0.25)" },
  medium:   { bg: "rgba(29,200,184,0.1)",  color: "#1dc8b8", border: "rgba(29,200,184,0.25)" },
  low:      { bg: "rgba(107,114,128,0.1)", color: "#6b7280", border: "rgba(107,114,128,0.2)" },
};

function priorityStyle(priority: string) {
  return PRIORITY_STYLES[priority.toLowerCase()] ?? PRIORITY_STYLES.low;
}

function TrashIcon({ small }: { small?: boolean }) {
  return (
    <svg className={small ? "w-3 h-3" : "w-4 h-4"} viewBox="0 0 20 20" fill="currentColor">
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

function TcCard({
  tc,
  editMode,
  onChange,
  isNew,
  onDelete,
  hlsItems,
  reqIds,
  showValidation,
  isOrphaned,
}: {
  tc: TCItem;
  editMode: boolean;
  onChange: (updated: TCItem) => void;
  isNew?: boolean;
  onDelete?: () => void;
  hlsItems?: { id: string; title: string }[];
  reqIds?: string[];
  showValidation?: boolean;
  isOrphaned?: boolean;
}) {
  const [expanded, setExpanded] = useState(isNew ?? false);
  const [confirming, setConfirming] = useState(false);

  function handleStepChange(stepIdx: number, field: keyof TCStep, value: string) {
    onChange({ ...tc, steps: tc.steps.map((s, i) => (i === stepIdx ? { ...s, [field]: value } : s)) });
  }

  function handleAddStep() {
    onChange({ ...tc, steps: [...tc.steps, { action: "", expected: "" }] });
  }

  function handleDeleteStep(stepIdx: number) {
    onChange({ ...tc, steps: tc.steps.filter((_, i) => i !== stepIdx) });
  }

  function handlePreconditionChange(idx: number, value: string) {
    onChange({ ...tc, preconditions: tc.preconditions.map((p, i) => (i === idx ? value : p)) });
  }

  function handleAddPrecondition() {
    onChange({ ...tc, preconditions: [...tc.preconditions, ""] });
  }

  function handleDeletePrecondition(idx: number) {
    onChange({ ...tc, preconditions: tc.preconditions.filter((_, i) => i !== idx) });
  }

  function handleLinkedReqToggle(reqId: string) {
    const linked = tc.linked_requirements.includes(reqId)
      ? tc.linked_requirements.filter((r) => r !== reqId)
      : [...tc.linked_requirements, reqId];
    onChange({ ...tc, linked_requirements: linked });
  }

  function handleField<K extends keyof TCItem>(field: K, value: TCItem[K]) {
    onChange({ ...tc, [field]: value });
  }

  const pStyle      = priorityStyle(tc.priority);
  const titleInvalid = showValidation && isNew && !tc.title.trim();
  const hlsInvalid   = showValidation && isNew && !tc.hls_id.trim();

  const hlsOptions = hlsItems && hlsItems.length > 0
    ? hlsItems
    : tc.hls_id ? [{ id: tc.hls_id, title: "" }] : [];

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{
        background: isNew ? "rgba(34,197,94,0.03)" : "#0e1726",
        border:    isOrphaned ? "1px solid rgba(245,158,11,0.4)" : "1px solid rgba(255,255,255,0.06)",
        borderTop: isOrphaned ? "1px solid rgba(245,158,11,0.4)" : "1px solid rgba(255,255,255,0.08)",
        ...(isNew ? { borderLeft: "3px solid rgba(34,197,94,0.5)" } : {}),
      }}
    >
      {/* Header / collapse toggle */}
      <button
        onClick={() => setExpanded((o) => !o)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors"
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <div className="flex items-center gap-2 flex-1 flex-wrap min-w-0">
          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded shrink-0" style={{ background: "rgba(157,110,247,0.1)", color: "#9d6ef7", border: "1px solid rgba(157,110,247,0.2)" }}>
            {tc.id}
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded font-medium shrink-0" style={{ background: pStyle.bg, color: pStyle.color, border: `1px solid ${pStyle.border}` }}>
            {tc.priority}
          </span>
          {isNew && <NewBadge />}
          {isOrphaned && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0" style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)" }}>
              reassigned
            </span>
          )}
          <span className="text-sm text-text/80 leading-snug min-w-0 truncate">
            {tc.title || (isNew ? <span style={{ color: "rgba(107,114,128,0.4)" }}>New Test Case</span> : "")}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {editMode && onDelete && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isNew) {
                  onDelete();
                } else {
                  setConfirming((c) => !c);
                }
              }}
              className="transition-colors"
              style={{ color: confirming ? "rgba(239,68,68,0.9)" : "rgba(239,68,68,0.5)" }}
              title="Remove"
              onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(239,68,68,0.9)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = confirming ? "rgba(239,68,68,0.9)" : "rgba(239,68,68,0.5)"; }}
            >
              <TrashIcon />
            </span>
          )}
          <svg
            className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            style={{ color: "rgba(107,114,128,0.5)" }}
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </div>
      </button>

      {/* Inline confirmation bar for existing items */}
      {confirming && !isNew && (
        <div className="flex items-center gap-2 px-4 py-2" style={{ borderTop: "1px solid rgba(239,68,68,0.15)", background: "rgba(239,68,68,0.06)" }}>
          <span className="text-xs flex-1" style={{ color: "rgba(239,68,68,0.8)" }}>Delete this test case?</span>
          <button
            onClick={() => setConfirming(false)}
            className="text-xs px-3 py-1 rounded-md font-medium transition-colors"
            style={{ background: "rgba(107,114,128,0.12)", color: "#8896a8", border: "1px solid rgba(107,114,128,0.2)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(107,114,128,0.2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(107,114,128,0.12)"; }}
          >
            Cancel
          </button>
          <button
            onClick={() => { onDelete?.(); setConfirming(false); }}
            className="text-xs px-3 py-1 rounded-md font-medium transition-colors"
            style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.12)"; }}
          >
            Confirm Delete
          </button>
        </div>
      )}

      {expanded && (
        <div className="px-4 pb-4 pt-3 flex flex-col gap-4" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>

          {/* New TC: title + metadata fields */}
          {isNew && editMode && (
            <div className="flex flex-col gap-2">
              <input
                className="text-sm font-medium text-text rounded-lg px-3 py-2 focus:outline-none w-full"
                style={{
                  background: "rgba(8,13,20,0.5)",
                  border: titleInvalid ? "1px solid rgba(239,68,68,0.7)" : "1px solid rgba(157,110,247,0.3)",
                }}
                value={tc.title}
                placeholder="Test case title…"
                onChange={(e) => handleField("title", e.target.value)}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus={tc.title === ""}
              />
              <div className="grid grid-cols-3 gap-2">
                {/* HLS ID */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(107,114,128,0.6)" }}>HLS</span>
                  <select
                    value={tc.hls_id}
                    onChange={(e) => handleField("hls_id", e.target.value)}
                    className="text-xs rounded px-2 py-1.5 focus:outline-none w-full"
                    style={{
                      border: hlsInvalid ? "1px solid rgba(239,68,68,0.7)" : "1px solid rgba(29,200,184,0.3)",
                      color: "#1dc8b8",
                    }}
                  >
                    {hlsOptions.map(({ id, title }) => (
                      <option key={id} value={id}>
                        {title ? `${id} — ${title.length > 28 ? title.slice(0, 28) + "…" : title}` : id}
                      </option>
                    ))}
                    {tc.hls_id && !hlsOptions.find((o) => o.id === tc.hls_id) && (
                      <option value={tc.hls_id}>{tc.hls_id}</option>
                    )}
                  </select>
                </div>
                {/* Priority */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(107,114,128,0.6)" }}>Priority</span>
                  <select
                    value={tc.priority}
                    onChange={(e) => handleField("priority", e.target.value)}
                    className="text-xs rounded px-2 py-1.5 focus:outline-none w-full"
                    style={{ border: "1px solid rgba(107,114,128,0.3)", color: priorityStyle(tc.priority).color }}
                  >
                    <option value="high">high</option>
                    <option value="medium">medium</option>
                    <option value="low">low</option>
                  </select>
                </div>
                {/* Type */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(107,114,128,0.6)" }}>Type</span>
                  <select
                    value={tc.type}
                    onChange={(e) => handleField("type", e.target.value)}
                    className="text-xs rounded px-2 py-1.5 focus:outline-none w-full"
                    style={{ border: "1px solid rgba(107,114,128,0.3)", color: "rgba(107,114,128,0.9)" }}
                  >
                    <option value="positive">positive</option>
                    <option value="negative">negative</option>
                    <option value="edge">edge</option>
                    <option value="exploratory">exploratory</option>
                  </select>
                </div>
              </div>

              {/* Linked requirements chip selector for new TCs */}
              {reqIds && reqIds.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(107,114,128,0.6)" }}>
                    Linked Requirements
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {reqIds.map((reqId) => {
                      const selected = tc.linked_requirements.includes(reqId);
                      return (
                        <button
                          key={reqId}
                          onClick={() => handleLinkedReqToggle(reqId)}
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
              )}
            </div>
          )}

          {/* Link chips for existing TCs */}
          {!isNew && (
            <div className="flex flex-wrap gap-1.5">
              <span
                className="text-[11px] font-mono px-2 py-0.5 rounded-full"
                style={
                  isOrphaned
                    ? { background: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)" }
                    : { background: "rgba(29,200,184,0.1)", color: "#1dc8b8", border: "1px solid rgba(29,200,184,0.2)" }
                }
              >
                {tc.hls_id}
              </span>
              {tc.linked_requirements.map((req) => (
                <span key={req} className="text-[11px] font-mono px-2 py-0.5 rounded-full" style={{ background: "rgba(8,13,20,0.4)", color: "rgba(107,114,128,0.8)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  {req}
                </span>
              ))}
            </div>
          )}

          {/* Preconditions */}
          {(tc.preconditions.length > 0 || editMode) && (
            <div>
              <p className="text-[11px] font-semibold tracking-wider uppercase mb-2" style={{ color: "rgba(107,114,128,0.6)" }}>
                Preconditions
              </p>
              <ul className="flex flex-col gap-1">
                {tc.preconditions.map((pre, i) => (
                  <li key={i} className="flex items-start gap-2">
                    {editMode ? (
                      <>
                        <input
                          className="flex-1 text-sm text-text rounded px-2 py-1 focus:outline-none"
                          style={{ background: "rgba(8,13,20,0.5)", border: "1px solid rgba(29,200,184,0.25)" }}
                          value={typeof pre === "string" ? pre : JSON.stringify(pre)}
                          onChange={(e) => handlePreconditionChange(i, e.target.value)}
                        />
                        <button
                          onClick={() => handleDeletePrecondition(i)}
                          className="shrink-0 transition-colors mt-1"
                          style={{ color: "rgba(239,68,68,0.4)" }}
                          title="Remove"
                          onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(239,68,68,0.8)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(239,68,68,0.4)"; }}
                        >
                          <TrashIcon small />
                        </button>
                      </>
                    ) : (
                      <>
                        <span style={{ color: "rgba(107,114,128,0.5)" }}>•</span>
                        <span className="text-sm text-text/70">{typeof pre === "string" ? pre : JSON.stringify(pre)}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {editMode && (
                <button
                  onClick={handleAddPrecondition}
                  className="mt-2 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                  style={{ background: "rgba(20,184,166,0.06)", border: "1px dashed rgba(20,184,166,0.25)", color: "#14b8a6" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(20,184,166,0.1)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(20,184,166,0.06)"; }}
                >
                  <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Add precondition
                </button>
              )}
            </div>
          )}

          {/* Steps table */}
          <div>
            <p className="text-[11px] font-semibold tracking-wider uppercase mb-2" style={{ color: "rgba(107,114,128,0.6)" }}>Steps</p>
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "rgba(8,13,20,0.5)" }}>
                    <th className="text-left px-3 py-2 w-6 text-[11px] font-semibold" style={{ color: "rgba(107,114,128,0.6)" }}>#</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold" style={{ color: "rgba(107,114,128,0.6)" }}>Action</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold" style={{ color: "rgba(107,114,128,0.6)" }}>Expected</th>
                    {editMode && <th className="w-8" />}
                  </tr>
                </thead>
                <tbody>
                  {tc.steps.map((step, si) => (
                    <tr key={si} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                      <td className="px-3 py-2 text-xs" style={{ color: "rgba(107,114,128,0.5)" }}>{si + 1}</td>
                      <td className="px-3 py-2">
                        {editMode ? (
                          <input
                            className="w-full rounded px-2 py-1 text-text text-xs focus:outline-none"
                            style={{ background: "rgba(8,13,20,0.5)", border: "1px solid rgba(29,200,184,0.3)" }}
                            value={step.action}
                            onChange={(e) => handleStepChange(si, "action", e.target.value)}
                          />
                        ) : (
                          <span className="text-xs text-text/80">{step.action}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editMode ? (
                          <input
                            className="w-full rounded px-2 py-1 text-text text-xs focus:outline-none"
                            style={{ background: "rgba(8,13,20,0.5)", border: "1px solid rgba(29,200,184,0.3)" }}
                            value={step.expected}
                            onChange={(e) => handleStepChange(si, "expected", e.target.value)}
                          />
                        ) : (
                          <span className="text-xs" style={{ color: "rgba(107,114,128,0.8)" }}>{step.expected}</span>
                        )}
                      </td>
                      {editMode && (
                        <td className="px-2 py-2">
                          <button
                            onClick={() => handleDeleteStep(si)}
                            className="transition-colors"
                            style={{ color: "rgba(239,68,68,0.4)" }}
                            title="Remove step"
                            onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(239,68,68,0.8)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(239,68,68,0.4)"; }}
                          >
                            <TrashIcon small />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {editMode && (
              <button
                onClick={handleAddStep}
                className="mt-2 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                style={{ background: "rgba(20,184,166,0.06)", border: "1px dashed rgba(20,184,166,0.25)", color: "#14b8a6" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(20,184,166,0.1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(20,184,166,0.06)"; }}
              >
                <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Add step
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TcPanel({ tcList, editMode, onItemsChange, reqIds, hlsItems, showValidation, orphanedTcIds }: TcPanelProps) {
  const [filter, setFilter] = useState<PriorityFilter>("all");
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const current = new Set(tcList.map((t) => t.id));
    setNewIds((prev) => {
      const stale = [...prev].filter((id) => !current.has(id));
      if (stale.length === 0) return prev;
      return new Set([...prev].filter((id) => current.has(id)));
    });
  }, [tcList]);

  function nextId(): string {
    const nums = tcList
      .map((t) => t.id.match(/^TC-(\d+)$/i))
      .filter(Boolean)
      .map((m) => parseInt(m![1], 10));
    return `TC-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0")}`;
  }

  function handleAdd() {
    const id = nextId();
    const firstHlsId = (hlsItems && hlsItems.length > 0)
      ? hlsItems[0].id
      : tcList.find((t) => t.hls_id)?.hls_id ?? "";
    onItemsChange([
      ...tcList,
      { id, title: "", hls_id: firstHlsId, linked_requirements: [], priority: "medium", type: "positive", preconditions: [], steps: [] },
    ]);
    setNewIds((prev) => new Set([...prev, id]));
    setFilter("all");
  }

  function handleDelete(id: string) {
    onItemsChange(tcList.filter((t) => t.id !== id));
    setNewIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
  }

  function handleChange(index: number, updated: TCItem) {
    onItemsChange(tcList.map((tc, i) => (i === index ? updated : tc)));
  }

  const filtered = filter === "all" ? tcList : tcList.filter((tc) => tc.priority.toLowerCase() === filter);

  const counts = {
    all:      tcList.length,
    critical: tcList.filter((t) => t.priority.toLowerCase() === "critical").length,
    high:     tcList.filter((t) => t.priority.toLowerCase() === "high").length,
    medium:   tcList.filter((t) => t.priority.toLowerCase() === "medium").length,
    low:      tcList.filter((t) => t.priority.toLowerCase() === "low").length,
  };

  const filterTabs: { key: PriorityFilter; label: string; color?: string }[] = [
    { key: "all",      label: "All" },
    { key: "critical", label: "Critical", color: "#ef4444" },
    { key: "high",     label: "High",     color: "#f59e0b" },
    { key: "medium",   label: "Medium",   color: "#1dc8b8" },
    { key: "low",      label: "Low",      color: "#6b7280" },
  ];

  return (
    <div className="flex flex-col gap-4 animate-fade-up">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: "rgba(17,24,39,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
        {filterTabs.map(({ key, label, color }) => {
          const isActive = filter === key;
          const cnt = counts[key];
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={
                isActive
                  ? { background: color ? `${color}15` : "rgba(249,250,251,0.08)", color: color ?? "#f9fafb", border: `1px solid ${color ? `${color}30` : "rgba(255,255,255,0.1)"}` }
                  : { color: "rgba(107,114,128,0.6)", border: "1px solid transparent" }
              }
            >
              {label}
              {cnt > 0 && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: isActive && color ? `${color}20` : "rgba(107,114,128,0.15)", color: isActive && color ? color : "rgba(107,114,128,0.7)" }}>
                  {cnt}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TC list */}
      <div className="flex flex-col gap-2">
        {filtered.map((tc) => {
          const originalIndex = tcList.indexOf(tc);
          const isNew = newIds.has(tc.id);
          return (
            <TcCard
              key={tc.id}
              tc={tc}
              editMode={editMode}
              isNew={isNew}
              isOrphaned={!isNew && orphanedTcIds?.has(tc.id)}
              onDelete={editMode ? () => handleDelete(tc.id) : undefined}
              hlsItems={hlsItems}
              reqIds={reqIds}
              showValidation={showValidation}
              onChange={(updated) => handleChange(originalIndex, updated)}
            />
          );
        })}
        {filtered.length === 0 && (
          <p className="text-sm text-muted/50 text-center py-8">No test cases match this filter.</p>
        )}
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
          Add Test Case
        </button>
      )}
    </div>
  );
}
