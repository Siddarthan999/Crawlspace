import { useEffect, useMemo, useRef, useState } from "react";

/* Small SVG charts. No chart library on purpose: the app needs four chart shapes, a library
   would add more weight than these ~250 lines, and everything here reads colours from the
   same CSS variables as the rest of the UI. Pass colours as "var(--ok)" etc. */

export function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(el.clientWidth);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (!isFinite(min) || !isFinite(max)) return [0, 1];
  if (min === max) max = min + 1;
  const step0 = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.5; v += step) out.push(+v.toFixed(10));
  return out;
}

export interface Pt { x: number; y: number | null }
export interface Series { name: string; color: string; points: Pt[]; dashed?: boolean; area?: boolean }

export function LineChart({ series, height = 220, yFormat = (v: number) => String(Math.round(v * 10) / 10),
  xFormat = (x: number) => new Date(x).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  yMin, yMax, invertY = false, empty = "Not enough data yet" }:
  { series: Series[]; height?: number; yFormat?: (v: number) => string; xFormat?: (x: number) => string;
    yMin?: number; yMax?: number; invertY?: boolean; empty?: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const width = w || 640;
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 46, r: 14, t: 12, b: 26 };

  const all = useMemo(() => series.flatMap((s) => s.points.filter((p) => p.y != null)), [series]);
  const geo = useMemo(() => {
    if (all.length < 2) return null;
    const xs = all.map((p) => p.x), ys = all.map((p) => p.y as number);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    let y0 = yMin ?? Math.min(...ys), y1 = yMax ?? Math.max(...ys);
    if (y0 === y1) { y0 -= 1; y1 += 1; }
    const ticks = niceTicks(y0, y1);
    y0 = Math.min(y0, ticks[0]); y1 = Math.max(y1, ticks[ticks.length - 1]);
    const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
    const sx = (x: number) => pad.l + (x1 === x0 ? iw / 2 : ((x - x0) / (x1 - x0)) * iw);
    const sy = (y: number) => { const t = (y - y0) / (y1 - y0); return pad.t + (invertY ? t : 1 - t) * ih; };
    return { x0, x1, ticks, sx, sy, iw, ih };
  }, [all, width, height, yMin, yMax, invertY]);

  if (!geo) return <div ref={ref} className="chart-empty" style={{ height }}>{empty}</div>;
  const { x0, x1, ticks, sx, sy } = geo;
  const nT = Math.min(5, all.length);
  const xTicks = Array.from({ length: nT }, (_, i) => x0 + ((x1 - x0) * i) / Math.max(1, nT - 1));

  const path = (pts: Pt[]) => {
    let d = "", pen = false;
    for (const p of pts) {
      if (p.y == null) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`;
      pen = true;
    }
    return d;
  };

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const r = (e.target as SVGRectElement).getBoundingClientRect();
    const px = x0 + ((e.clientX - r.left) / r.width) * (x1 - x0);
    let best = all[0].x;
    for (const p of all) if (Math.abs(p.x - px) < Math.abs(best - px)) best = p.x;
    setHover(best);
  };
  const atHover = hover == null ? [] : series.map((s) => {
    const p = s.points.reduce<Pt | null>((b, q) => (q.y == null ? b : !b || Math.abs(q.x - hover) < Math.abs(b.x - hover) ? q : b), null);
    return { s, p };
  }).filter((r) => r.p && Math.abs(r.p.x - hover!) <= (x1 - x0) / 2);

  return (
    <div ref={ref} className="chart-wrap" style={{ height }}>
      <svg width={width} height={height} role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={sy(t)} y2={sy(t)} stroke="var(--border-soft)" strokeWidth="1" />
            <text x={pad.l - 8} y={sy(t)} dy="0.32em" textAnchor="end" className="chart-tick">{yFormat(t)}</text>
          </g>
        ))}
        {xTicks.map((x, i) => (
          <text key={i} x={sx(x)} y={height - 7} textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"} className="chart-tick">{xFormat(x)}</text>
        ))}
        {series.map((s) => (
          <g key={s.name}>
            {s.area && <path d={`${path(s.points)}L${sx(x1)},${sy(ticks[0])}L${sx(x0)},${sy(ticks[0])}Z`} fill={s.color} opacity="0.09" />}
            <path d={path(s.points)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
                  strokeDasharray={s.dashed ? "4 4" : undefined} opacity={s.dashed ? 0.55 : 1} />
            {s.points.filter((p) => p.y != null).length <= 24 && !s.dashed &&
              s.points.filter((p) => p.y != null).map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y as number)} r="2.6" fill="var(--panel)" stroke={s.color} strokeWidth="1.6" />)}
          </g>
        ))}
        {hover != null && <line x1={sx(hover)} x2={sx(hover)} y1={pad.t} y2={height - pad.b} stroke="var(--border-hover)" strokeDasharray="3 3" />}
        {atHover.map(({ s, p }) => <circle key={s.name} cx={sx(p!.x)} cy={sy(p!.y as number)} r="4" fill={s.color} stroke="var(--panel)" strokeWidth="2" />)}
        <rect x={pad.l} y={pad.t} width={width - pad.l - pad.r} height={height - pad.t - pad.b} fill="transparent"
              onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hover != null && atHover.length > 0 && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(sx(hover) + 12, 8), width - 190), top: 8 }}>
          <div className="chart-tip-head">{xFormat(hover)}</div>
          {atHover.map(({ s, p }) => (
            <div key={s.name} className="chart-tip-row"><span className="dot" style={{ background: s.color }} /><span>{s.name}</span><b>{yFormat(p!.y as number)}</b></div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StackedBars({ data, names, colors, height = 200 }:
  { data: { label: string; values: number[] }[]; names: string[]; colors: string[]; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const width = w || 640;
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <div ref={ref} className="chart-empty" style={{ height }}>Not enough data yet</div>;
  const pad = { l: 40, r: 8, t: 10, b: 24 };
  const max = Math.max(1, ...data.map((d) => d.values.reduce((a, b) => a + b, 0)));
  const ticks = niceTicks(0, max, 4);
  const top = ticks[ticks.length - 1];
  const ih = height - pad.t - pad.b, iw = width - pad.l - pad.r;
  const slot = iw / data.length, bw = Math.min(36, slot * 0.62);
  return (
    <div ref={ref} className="chart-wrap" style={{ height }}>
      <svg width={width} height={height}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={pad.t + ih - (t / top) * ih} y2={pad.t + ih - (t / top) * ih} stroke="var(--border-soft)" />
            <text x={pad.l - 8} y={pad.t + ih - (t / top) * ih} dy="0.32em" textAnchor="end" className="chart-tick">{t}</text>
          </g>
        ))}
        {data.map((d, i) => {
          let y = pad.t + ih;
          const x = pad.l + slot * i + (slot - bw) / 2;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} opacity={hover == null || hover === i ? 1 : 0.55}>
              <rect x={pad.l + slot * i} y={pad.t} width={slot} height={ih} fill="transparent" />
              {d.values.map((v, k) => {
                const h = (v / top) * ih; y -= h;
                return h > 0 ? <rect key={k} x={x} y={y} width={bw} height={h} fill={colors[k]} rx="2" /> : null;
              })}
              {(data.length <= 8 || i % Math.ceil(data.length / 8) === 0) &&
                <text x={x + bw / 2} y={height - 7} textAnchor="middle" className="chart-tick">{d.label}</text>}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(pad.l + slot * hover + slot / 2 + 12, 8), width - 180), top: 8 }}>
          <div className="chart-tip-head">{data[hover].label}</div>
          {names.map((n, k) => <div key={n} className="chart-tip-row"><span className="dot" style={{ background: colors[k] }} /><span>{n}</span><b>{data[hover].values[k]}</b></div>)}
        </div>
      )}
    </div>
  );
}

export function Donut({ segments, size = 148, center }: { segments: { label: string; value: number; color: string }[]; size?: number; center?: { value: string; label: string } }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = size / 2 - 11, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="donut">
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--panel-alt)" strokeWidth="14" />
          {total > 0 && segments.filter((s) => s.value > 0).map((s) => {
            const len = (s.value / total) * c;
            const el = <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth="14"
              strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-acc} />;
            acc += len;
            return el;
          })}
        </svg>
        {center && <div className="donut-center"><b>{center.value}</b><span>{center.label}</span></div>}
      </div>
      <div className="donut-legend">
        {segments.map((s) => (
          <div key={s.label} className="donut-legend-row">
            <span className="dot" style={{ background: s.color }} /><span>{s.label}</span>
            <b className="mono">{s.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HBars({ items, color = "var(--accent)", format = (v: number) => String(v) }:
  { items: { label: string; value: number; sub?: string; color?: string }[]; color?: string; format?: (v: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <div className="faint" style={{ fontSize: 13 }}>No data</div>;
  return (
    <div className="hbars">
      {items.map((i) => (
        <div key={i.label} className="hbar">
          <div className="hbar-top"><span className="hbar-label" title={i.label}>{i.label}</span><b className="mono">{format(i.value)}</b></div>
          <div className="hbar-track"><div className="hbar-fill" style={{ width: `${(i.value / max) * 100}%`, background: i.color || color }} /></div>
          {i.sub && <div className="hbar-sub">{i.sub}</div>}
        </div>
      ))}
    </div>
  );
}
