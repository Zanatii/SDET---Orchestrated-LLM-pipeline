"use client";

import { useState } from "react";

interface CoveragePanelProps {
  coverageReport: Record<string, unknown>;
}

function DonutChart({ percentage }: { percentage: number }) {
  const r = 38;
  const cx = 50;
  const cy = 50;
  const circumference = 2 * Math.PI * r;
  const clipped = Math.max(0, Math.min(100, percentage));
  const dashoffset = circumference * (1 - clipped / 100);

  const color = clipped >= 80 ? "#1dc8b8" : clipped >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>
      <svg width="120" height="120" viewBox="0 0 100 100">
        {/* Track */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="10"
        />
        {/* Progress */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          transform="rotate(-90 50 50)"
          style={{ filter: `drop-shadow(0 0 6px ${color}60)` }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-xl font-bold" style={{ color }}>{clipped}%</span>
        <span className="text-[10px]" style={{ color: "rgba(107,114,128,0.7)" }}>covered</span>
      </div>
    </div>
  );
}

function StatBadge({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div
      className="flex flex-col gap-1 rounded-xl p-4"
      style={{ background: "#0e1726", border: "1px solid rgba(255,255,255,0.06)", borderTop: "1px solid rgba(255,255,255,0.08)" }}
    >
      <span className="text-xl font-bold" style={{ color }}>{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

export default function CoveragePanel({ coverageReport }: CoveragePanelProps) {
  const [showRaw, setShowRaw] = useState(false);

  const pct = typeof coverageReport.coverage_percentage === "number"
    ? coverageReport.coverage_percentage
    : typeof coverageReport.coverage_percent === "number"
    ? coverageReport.coverage_percent
    : null;

  const covered = coverageReport.covered_count ?? coverageReport.covered ?? null;
  const total   = coverageReport.total_count ?? coverageReport.total ?? null;
  const uncoveredList = Array.isArray(coverageReport.uncovered_requirements)
    ? coverageReport.uncovered_requirements as string[]
    : [];

  const displayPct = pct ?? (total && covered
    ? Math.round((Number(covered) / Number(total)) * 100)
    : 0);

  const isComplete = displayPct >= 100;

  return (
    <div className="flex flex-col gap-5 animate-fade-up">
      {/* Main stats row */}
      <div className="flex items-center gap-6">
        <DonutChart percentage={displayPct} />
        <div className="grid grid-cols-3 gap-3 flex-1">
          {pct !== null && <StatBadge label="Coverage" value={`${displayPct}%`} color="#1dc8b8" />}
          {covered !== null && <StatBadge label="Covered" value={Number(covered)} color="#22c55e" />}
          {total !== null && <StatBadge label="Total" value={Number(total)} color="#f9fafb" />}
          {uncoveredList.length > 0 && (
            <StatBadge label="Uncovered" value={uncoveredList.length} color="#ef4444" />
          )}
        </div>
      </div>

      {/* Phase 2 unlock banner */}
      {isComplete ? (
        <div
          className="rounded-xl p-4 flex items-center gap-3"
          style={{
            background: "rgba(29,200,184,0.06)",
            border: "1px solid rgba(29,200,184,0.2)",
          }}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "rgba(29,200,184,0.15)" }}
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="#1dc8b8">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: "#1dc8b8" }}>Full coverage achieved</p>
            <p className="text-xs text-muted">Ready to unlock Phase 2 — Automation</p>
          </div>
        </div>
      ) : (
        <div
          className="rounded-xl p-4 flex items-center gap-3"
          style={{
            background: "rgba(245,158,11,0.05)",
            border: "1px solid rgba(245,158,11,0.15)",
          }}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "rgba(245,158,11,0.12)" }}
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="#f59e0b">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: "#f59e0b" }}>Partial coverage</p>
            <p className="text-xs text-muted">Approve to continue — some requirements may lack test cases</p>
          </div>
        </div>
      )}

      {/* Uncovered requirements */}
      {uncoveredList.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold tracking-wider uppercase mb-2" style={{ color: "rgba(107,114,128,0.6)" }}>
            Uncovered Requirements
          </p>
          <div className="flex flex-wrap gap-2">
            {uncoveredList.map((req, i) => (
              <span
                key={i}
                className="font-mono text-xs px-2.5 py-1 rounded-lg"
                style={{
                  background: "rgba(239,68,68,0.08)",
                  color: "#ef4444",
                  border: "1px solid rgba(239,68,68,0.2)",
                }}
              >
                {req}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Raw data toggle */}
      <div>
        <button
          onClick={() => setShowRaw((s) => !s)}
          className="text-xs transition-colors"
          style={{ color: "rgba(107,114,128,0.5)" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(107,114,128,0.8)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(107,114,128,0.5)"; }}
        >
          {showRaw ? "▲ hide raw data" : "▼ show raw data"}
        </button>
        {showRaw && (
          <pre
            className="mt-2 text-xs font-mono overflow-x-auto rounded-xl p-4 max-h-64"
            style={{
              background: "rgba(8,13,20,0.6)",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "rgba(107,114,128,0.8)",
            }}
          >
            {JSON.stringify(coverageReport, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
