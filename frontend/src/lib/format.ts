/** Timestamps from the API are naive UTC ("2026-10-05T01:44:48"); make them real Dates. */
export function parseTs(iso?: string | null): Date | null {
  if (!iso) return null;
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
}

export function timeAgo(iso?: string | null): string {
  const d = parseTs(iso);
  if (!d) return "—";
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString();
}

export const fmtDate = (iso?: string | null) => parseTs(iso)?.toLocaleDateString(undefined, { month: "short", day: "numeric" }) ?? "—";
export const fmtDateTime = (iso?: string | null) => parseTs(iso)?.toLocaleString() ?? "—";

export function compact(n: number | null | undefined): string {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M";
  if (a >= 1e4) return (n / 1e3).toFixed(0) + "k";
  if (a >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(Math.round(n));
}

export const pct = (v: number | null | undefined, digits = 1) => (v == null ? "—" : (v * 100).toFixed(digits) + "%");

/** Percentage change, or null when there's nothing to compare against. */
export function delta(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return (cur - prev) / Math.abs(prev);
}

export function healthColor(score?: number | null): string {
  if (score == null) return "var(--text-faint)";
  return score >= 80 ? "var(--ok)" : score >= 50 ? "var(--warning)" : "var(--error)";
}

export function pathOf(url: string): string {
  try { const u = new URL(url); return (u.pathname + u.search) || "/"; } catch { return url; }
}
