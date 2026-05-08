"use client";

import { ProviderIcon, PROVIDER_COLORS } from "@/components/ProviderIcons";

export type Provider = "claude" | "groq" | "grok";

export type ProviderStatus = "home" | "running" | "gate" | "done";

const PROVIDER_META: Record<Provider, { label: string; sublabel?: string }> = {
  claude: { label: "Claude"                  },
  groq:   { label: "Groq",  sublabel: "free" },
  grok:   { label: "Grok",  sublabel: "xAI"  },
};

interface HeaderProps {
  provider: Provider;
  onProviderChange: (p: Provider) => void;
  runId?: string | null;
  onNewRun?: () => void;
  providerStatus?: ProviderStatus;
}

export default function Header({
  provider,
  onProviderChange,
  runId,
  onNewRun,
  providerStatus = "home",
}: HeaderProps) {
  const isSelectable = providerStatus === "home" || providerStatus === "gate";

  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 h-11 flex items-center px-4 shrink-0"
      style={{
        background: "rgba(7,13,24,0.94)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(29,200,184,0.15)",
        boxShadow: "0 1px 20px rgba(29,200,184,0.05)",
      }}
    >
      {/* Left: logo */}
      <div className="w-[220px] shrink-0 flex items-center">
        <span className="font-mono text-sm font-bold tracking-tight">
          <span style={{ color: "#1dc8b8", textShadow: "0 0 12px rgba(29,200,184,0.5)" }}>SDET</span>
          <span style={{ color: "rgba(249,250,251,0.4)" }}>·AGENT</span>
        </span>
      </div>

      {/* Center: new-run button + run ID badge */}
      <div className="flex-1 flex items-center justify-center gap-2">
        {runId && onNewRun && (
          <button
            onClick={onNewRun}
            className="flex items-center gap-1 text-xs transition-all"
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(136,150,168,0.7)",
              padding: "4px 12px",
              borderRadius: 6,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
              e.currentTarget.style.color = "#dde4ef";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
              e.currentTarget.style.color = "rgba(136,150,168,0.7)";
            }}
          >
            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
            </svg>
            New Run
          </button>
        )}
        {runId ? (
          <span
            className="font-mono text-[11px] tracking-widest px-3 py-1 rounded-md"
            style={{
              background: "rgba(29,200,184,0.08)",
              border: "1px solid rgba(29,200,184,0.2)",
              color: "#1dc8b8",
            }}
          >
            RUN {runId.slice(0, 8).toUpperCase()}
          </span>
        ) : (
          <span className="font-mono text-[11px] tracking-widest" style={{ color: "rgba(107,114,128,0.35)" }}>
            NO ACTIVE RUN
          </span>
        )}
      </div>

      {/* Right: provider selector */}
      <div className="w-[220px] shrink-0 flex items-center justify-end gap-0.5">
          {(["claude", "groq", "grok"] as Provider[]).map((p) => {
            const meta = PROVIDER_META[p];
            const clr = PROVIDER_COLORS[p];
            const isActive = provider === p;

            // Compute per-button style
            let buttonStyle: React.CSSProperties;
            if (!isSelectable) {
              if (isActive) {
                // Show which model is active, dimmed
                buttonStyle = {
                  background: clr.bg,
                  color: clr.color,
                  border: `1px solid ${clr.border}`,
                  opacity: 0.55,
                  cursor: "not-allowed",
                };
              } else {
                buttonStyle = {
                  background: "transparent",
                  color: "rgba(107,114,128,0.2)",
                  border: "1px solid transparent",
                  cursor: "not-allowed",
                };
              }
            } else {
              buttonStyle = isActive
                ? { background: clr.bg, color: clr.color, border: `1px solid ${clr.border}` }
                : { background: "transparent", color: "rgba(107,114,128,0.55)", border: "1px solid transparent" };
            }

            return (
              <button
                key={p}
                onClick={() => isSelectable && onProviderChange(p)}
                disabled={!isSelectable}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                style={buttonStyle}
              >
                {/* Running indicator */}
                {isActive && providerStatus === "running" && (
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
                    style={{ background: clr.color }}
                  />
                )}
                {/* Done indicator */}
                {isActive && providerStatus === "done" && (
                  <svg className="w-2.5 h-2.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" style={{ opacity: 0.7 }}>
                    <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                  </svg>
                )}
                <ProviderIcon p={p} size={13} />
                <span>{meta.label}</span>
                {meta.sublabel && (
                  <span
                    className="text-[9px] font-normal"
                    style={{ opacity: isActive ? 0.65 : 0.4 }}
                  >
                    {meta.sublabel}
                  </span>
                )}
              </button>
            );
          })}
      </div>
    </header>
  );
}
