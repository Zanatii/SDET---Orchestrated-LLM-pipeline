import type { Provider } from "@/components/Header";

export const ClaudeIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="4" fill="#D97706" />
    <line x1="12" y1="2"  x2="12" y2="6"  stroke="#D97706" strokeWidth="2" strokeLinecap="round" />
    <line x1="12" y1="18" x2="12" y2="22" stroke="#D97706" strokeWidth="2" strokeLinecap="round" />
    <line x1="2"  y1="12" x2="6"  y2="12" stroke="#D97706" strokeWidth="2" strokeLinecap="round" />
    <line x1="18" y1="12" x2="22" y2="12" stroke="#D97706" strokeWidth="2" strokeLinecap="round" />
    <line x1="4.93"  y1="4.93"  x2="7.76"  y2="7.76"  stroke="#D97706" strokeWidth="2" strokeLinecap="round" />
    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" stroke="#D97706" strokeWidth="2" strokeLinecap="round" />
    <line x1="19.07" y1="4.93"  x2="16.24" y2="7.76"  stroke="#D97706" strokeWidth="2" strokeLinecap="round" />
    <line x1="7.76"  y1="16.24" x2="4.93"  y2="19.07" stroke="#D97706" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const GroqIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z"
      fill="#22c55e"
      stroke="#22c55e"
      strokeWidth="1"
      strokeLinejoin="round"
    />
  </svg>
);

export const GrokIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M18 6L6 18M6 6l12 12" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

export function ProviderIcon({ p, size }: { p: Provider; size?: number }) {
  if (p === "claude") return <ClaudeIcon size={size} />;
  if (p === "groq")   return <GroqIcon size={size} />;
  return <GrokIcon size={size} />;
}

export const PROVIDER_COLORS: Record<Provider, { color: string; bg: string; border: string }> = {
  claude: { color: "#D97706", bg: "rgba(217,119,6,0.15)",   border: "rgba(217,119,6,0.35)"   },
  groq:   { color: "#22c55e", bg: "rgba(34,197,94,0.15)",   border: "rgba(34,197,94,0.35)"   },
  grok:   { color: "#3b82f6", bg: "rgba(59,130,246,0.15)",  border: "rgba(59,130,246,0.35)"  },
};
