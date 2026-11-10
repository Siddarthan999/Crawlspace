export default function Sparkline({ values, width = 72, height = 24 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) {
    return <div style={{ width, height, display: "flex", alignItems: "center" }}><span className="faint" style={{ fontSize: 12.5 }}>no trend yet</span></div>;
  }
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const pts = values.map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 4) - 2}`).join(" ");
  const last = values[values.length - 1];
  const color = last >= 80 ? "var(--ok)" : last >= 50 ? "var(--warning)" : "var(--error)";
  return (
    <svg width={width} height={height}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(values.length - 1) * step} cy={height - ((last - min) / range) * (height - 4) - 2} r="2" fill={color} />
    </svg>
  );
}
