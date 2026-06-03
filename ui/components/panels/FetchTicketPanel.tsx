"use client";

import { ReactNode, useState } from "react";
import { DescriptionBlock, TicketComment } from "@/types";

interface TicketData {
  summary?: string;
  description?: DescriptionBlock[];
  acceptance_criteria?: string;
  type?: string;
  priority?: string;
  comments?: TicketComment[];
}

interface FetchTicketPanelProps {
  ticketId: string;
  data: TicketData;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days !== 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months !== 1 ? "s" : ""} ago`;
}

function priorityStyle(priority: string): { bg: string; color: string; border: string } {
  const p = priority.toLowerCase();
  if (p === "high" || p === "critical")
    return { bg: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" };
  if (p === "medium")
    return { bg: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)" };
  return { bg: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" };
}

// ── Shared collapsible wrapper ─────────────────────────────────────────────────

function CollapsibleSection({
  label,
  defaultOpen = true,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors"
        style={{ background: open ? "rgba(15,24,41,0.7)" : "rgba(8,13,20,0.4)" }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(17,24,39,0.9)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = open ? "rgba(15,24,41,0.7)" : "rgba(8,13,20,0.4)"; }}
      >
        <span
          className="text-[11px] font-bold tracking-widest uppercase"
          style={{ color: "rgba(136,150,168,0.65)" }}
        >
          {label}
        </span>
        <svg
          className={`w-4 h-4 transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          style={{ color: "rgba(107,114,128,0.45)" }}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          className="px-4 py-4"
          style={{ background: "rgba(8,13,20,0.3)", borderTop: "1px solid rgba(255,255,255,0.05)" }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ── Wiki markup → block parser (for Acceptance Criteria strings) ─────────────

function parseAcBlocks(text: string): DescriptionBlock[] {
  if (!text.trim()) return [];
  const blocks: DescriptionBlock[] = [];
  const textLines: string[] = [];
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];
  let inTable = false;

  for (const line of text.split("\n")) {
    const stripped = line.trim();
    if (stripped.startsWith("||")) {
      if (textLines.length > 0) {
        const content = textLines.join("\n").trim();
        if (content) blocks.push({ type: "text", content });
        textLines.length = 0;
      }
      inTable = true;
      tableHeaders = stripped.split("||").filter((p) => p.trim()).map((p) => p.trim());
      tableRows = [];
    } else if (inTable && stripped.startsWith("|")) {
      tableRows.push(stripped.split("|").filter((p) => p.trim()).map((p) => p.trim()));
    } else {
      if (inTable) {
        blocks.push({ type: "table", headers: tableHeaders, rows: tableRows });
        tableHeaders = [];
        tableRows = [];
        inTable = false;
      }
      textLines.push(line);
    }
  }

  if (inTable) {
    blocks.push({ type: "table", headers: tableHeaders, rows: tableRows });
  } else if (textLines.length > 0) {
    const content = textLines.join("\n").trim();
    if (content) blocks.push({ type: "text", content });
  }

  return blocks;
}

// ── Description block renderer ────────────────────────────────────────────────

function DescriptionBlockRenderer({ blocks }: { blocks: DescriptionBlock[] }) {
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) => {
        if (block.type === "text") {
          return (
            <p
              key={i}
              className="text-sm leading-relaxed whitespace-pre-wrap"
              style={{ color: "rgba(221,228,239,0.78)" }}
            >
              {block.content}
            </p>
          );
        }

        // table block
        if (!block.headers.length && !block.rows.length) return null;
        return (
          <div
            key={i}
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              {block.headers.length > 0 && (
                <thead>
                  <tr style={{ background: "rgba(8,13,20,0.7)" }}>
                    {block.headers.map((h, j) => (
                      <th
                        key={j}
                        className="text-left px-4 py-2.5 text-[11px] font-semibold tracking-wider"
                        style={{
                          color: "rgba(107,114,128,0.75)",
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {block.rows.map((row, ri) => (
                  <tr key={ri} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className="px-4 py-2.5 text-xs"
                        style={{ color: "rgba(221,228,239,0.75)" }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ── Comments renderer ─────────────────────────────────────────────────────────

function CommentsRenderer({ comments }: { comments: TicketComment[] }) {
  return (
    <div className="flex flex-col">
      {comments.map((c, i) => (
        <div key={i}>
          {i > 0 && (
            <div
              style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "14px 0" }}
            />
          )}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold" style={{ color: "#dde4ef" }}>
                {c.author}
              </span>
              {c.created && (
                <span className="text-[11px]" style={{ color: "rgba(107,114,128,0.55)" }}>
                  {relativeTime(c.created)}
                </span>
              )}
            </div>
            <p
              className="text-sm leading-relaxed whitespace-pre-wrap"
              style={{ color: "rgba(221,228,239,0.7)" }}
            >
              {c.body}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function FetchTicketPanel({ ticketId, data }: FetchTicketPanelProps) {
  const { summary, description, acceptance_criteria, type, priority, comments } = data;
  const pStyle = priority ? priorityStyle(priority) : null;

  const hasDescription = Array.isArray(description) && description.length > 0;
  const hasAC = !!acceptance_criteria?.trim();
  const hasComments = Array.isArray(comments) && comments.length > 0;

  return (
    <div className="flex flex-col gap-4 animate-fade-up">
      {/* 1. Header card */}
      <div
        className="rounded-2xl p-5 flex flex-col gap-3"
        style={{
          background: "#0e1726",
          border: "1px solid rgba(255,255,255,0.07)",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
        }}
      >
        {/* Ticket ID + type + priority + status */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="font-mono text-xs font-bold px-2.5 py-1 rounded"
            style={{
              background: "rgba(38,132,255,0.12)",
              color: "#2684FF",
              border: "1px solid rgba(38,132,255,0.25)",
            }}
          >
            {ticketId}
          </span>
          {type && (
            <span
              className="font-mono text-[10px] px-2 py-0.5 rounded"
              style={{
                background: "rgba(29,200,184,0.1)",
                color: "#1dc8b8",
                border: "1px solid rgba(29,200,184,0.2)",
              }}
            >
              {type}
            </span>
          )}
          {priority && pStyle && (
            <span
              className="font-mono text-[10px] px-2 py-0.5 rounded"
              style={{ background: pStyle.bg, color: pStyle.color, border: pStyle.border }}
            >
              {priority}
            </span>
          )}
          <span
            className="ml-auto text-[10px] font-semibold px-2.5 py-1 rounded"
            style={{
              background: "rgba(34,197,94,0.1)",
              color: "#22c55e",
              border: "1px solid rgba(34,197,94,0.2)",
            }}
          >
            Fetched ✓
          </span>
        </div>

        {/* 2. Summary */}
        {summary && (
          <h2 className="text-base font-semibold leading-snug" style={{ color: "#dde4ef" }}>
            {summary}
          </h2>
        )}
      </div>

      {/* 3. Acceptance Criteria */}
      {hasAC && (
        <CollapsibleSection label="Acceptance Criteria" defaultOpen>
          <DescriptionBlockRenderer blocks={parseAcBlocks(acceptance_criteria!)} />
        </CollapsibleSection>
      )}

      {/* 4. Description */}
      {hasDescription && (
        <CollapsibleSection label="Description" defaultOpen>
          <DescriptionBlockRenderer blocks={description!} />
        </CollapsibleSection>
      )}

      {/* 5. Comments */}
      {hasComments && (
        <CollapsibleSection label={`Comments (${comments!.length})`} defaultOpen={false}>
          <CommentsRenderer comments={comments!} />
        </CollapsibleSection>
      )}
    </div>
  );
}
