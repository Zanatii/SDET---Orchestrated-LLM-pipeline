"use client";

import { useEffect, useState } from "react";

export interface ToastItem {
  id: string;
  title: string;
  message: string;
  rawError?: string;
  variant?: "error" | "warning";
}

const DISMISS_MS = 6000;

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const [showDetails, setShowDetails] = useState(false);
  const isWarn = toast.variant === "warning";
  const accentColor = isWarn ? "#f59e0b" : "#ef4444";

  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), DISMISS_MS);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  return (
    <div
      className="animate-slide-in relative overflow-hidden rounded-xl w-80 flex flex-col"
      style={{
        background: "#111827",
        border: "1px solid rgba(255,255,255,0.07)",
        borderLeft: `3px solid ${accentColor}`,
        boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
      }}
    >
      {/* Progress bar */}
      <div
        className="absolute bottom-0 left-0 h-[2px] animate-toast-progress"
        style={{ background: accentColor }}
      />

      <div className="px-4 pt-3 pb-4 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm font-semibold text-text leading-tight">{toast.title}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            className="shrink-0 text-muted/50 hover:text-muted transition-colors mt-0.5"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <p className="text-xs text-muted leading-relaxed">{toast.message}</p>

        {toast.rawError && (
          <div className="mt-0.5">
            <button
              onClick={() => setShowDetails((s) => !s)}
              className="text-[10px] text-muted/50 hover:text-muted/80 transition-colors"
            >
              {showDetails ? "hide details ▲" : "show details ▼"}
            </button>
            {showDetails && (
              <pre
                className="mt-1.5 text-[10px] text-muted/70 font-mono overflow-x-auto max-h-24 rounded-lg p-2.5"
                style={{ background: "rgba(8,13,20,0.6)", border: "1px solid rgba(255,255,255,0.05)" }}
              >
                {toast.rawError}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (!toasts.length) return null;
  return (
    <div className="fixed top-14 right-4 z-50 flex flex-col gap-2.5 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastCard toast={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
