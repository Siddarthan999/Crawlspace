export function DistBar({ data, colors }: { data: Record<string, number>; colors?: Record<string, string> }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      {entries.map(([k, v]) => (
        <div className="bar-row" key={k}>
          <div style={{ width: 90 }} className="muted mono">{k}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(v / total) * 100}%`, background: (colors && colors[k]) || "var(--accent)" }} />
          </div>
          <div style={{ width: 40, textAlign: "right" }} className="mono">{v}</div>
        </div>
      ))}
    </div>
  );
}
