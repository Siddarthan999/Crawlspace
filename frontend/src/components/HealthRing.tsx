import { useCountUp } from "../hooks/useCountUp";

export function HealthRing({ score }: { score: number | null | undefined }) {
  const animated = useCountUp(score);
  const v = animated ?? 0;
  const color = v >= 80 ? "var(--ok)" : v >= 50 ? "var(--warning)" : "var(--error)";
  const r = 34, c = 2 * Math.PI * r;
  const offset = c - (v / 100) * c;
  return (
    <div className="health-ring">
      <svg width="84" height="84">
        <circle cx="42" cy="42" r={r} stroke="var(--border)" strokeWidth="7" fill="none" />
        <circle cx="42" cy="42" r={r} stroke={color} strokeWidth="7" fill="none"
                strokeDasharray={c} strokeDashoffset={animated == null ? c : offset} strokeLinecap="round"
                style={{ transition: "stroke 0.3s" }} />
      </svg>
      <div className="val">{animated == null ? "—" : Math.round(animated)}</div>
    </div>
  );
}
