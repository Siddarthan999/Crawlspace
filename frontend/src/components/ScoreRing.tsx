import { useCountUp } from "../hooks/useCountUp";

export function ScoreRing({ score, label, size = 72 }: { score: number | null | undefined; label: string; size?: number }) {
  const v = useCountUp(score);
  const color = v == null ? "var(--text-faint)" : v >= 90 ? "var(--ok)" : v >= 50 ? "var(--warning)" : "var(--error)";
  const r = size / 2 - 6, c = 2 * Math.PI * r;
  const offset = v == null ? c : c - (v / 100) * c;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--border)" strokeWidth="6" fill="none" />
          <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="6" fill="none"
                  strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.26, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {v == null ? "—" : Math.round(v)}
        </div>
      </div>
      <div style={{ fontSize: 13.5, color: "var(--text-dim)", textAlign: "center", fontWeight: 500 }}>{label}</div>
    </div>
  );
}
