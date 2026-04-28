"use client";

interface HeaderProps {
  provider: "claude" | "grok";
  onProviderChange: (p: "claude" | "grok") => void;
}

export default function Header({ provider, onProviderChange }: HeaderProps) {
  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-surface shrink-0 z-10">
      <span className="text-lg font-bold tracking-tight text-text">
        <span className="text-teal">SDET</span> Agent
      </span>

      <div className="flex items-center gap-2">
        {provider === "grok" && (
          <span title="Grok has no MCP support — some nodes will fall back to Claude">
            <svg className="w-4 h-4 text-amber" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          </span>
        )}

        <div className="flex rounded-full border border-border overflow-hidden text-sm font-medium">
          <button
            onClick={() => onProviderChange("claude")}
            className={`px-4 py-1 transition-colors ${
              provider === "claude"
                ? "bg-teal text-white"
                : "bg-surface text-muted hover:text-text"
            }`}
          >
            Claude
          </button>
          <button
            onClick={() => onProviderChange("grok")}
            className={`px-4 py-1 transition-colors ${
              provider === "grok"
                ? "bg-amber text-bg font-semibold"
                : "bg-surface text-muted hover:text-text"
            }`}
          >
            Grok
          </button>
        </div>
      </div>
    </header>
  );
}
