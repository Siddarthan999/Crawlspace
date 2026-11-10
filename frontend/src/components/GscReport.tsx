import { useEffect, useMemo, useState } from "react";
import { MousePointerClick, Eye, Percent, ListOrdered, RefreshCw } from "lucide-react";
import { api } from "../api";
import { LineChart, HBars } from "./charts";
import ExternalLinkButton from "./ExternalLinkButton";
import { compact, pct, delta, pathOf } from "../lib/format";

type Metric = "clicks" | "impressions" | "ctr" | "position";
const METRICS: Record<Metric, { label: string; icon: any; fmt: (v: number) => string; lowerIsBetter?: boolean }> = {
  clicks: { label: "Total clicks", icon: MousePointerClick, fmt: (v) => compact(v) },
  impressions: { label: "Total impressions", icon: Eye, fmt: (v) => compact(v) },
  ctr: { label: "Average CTR", icon: Percent, fmt: (v) => pct(v) },
  position: { label: "Average position", icon: ListOrdered, fmt: (v) => v.toFixed(1), lowerIsBetter: true },
};

function Delta({ metric, cur, prev }: { metric: Metric; cur: number | null; prev: number | null }) {
  if (cur == null || prev == null) return null;
  const m = METRICS[metric];
  let text: string, change: number;
  if (metric === "position") { change = cur - prev; text = (change > 0 ? "+" : "") + change.toFixed(1); }
  else { const d = delta(cur, prev); if (d == null) return null; change = d; text = (d > 0 ? "+" : "") + (d * 100).toFixed(1) + "%"; }
  const good = m.lowerIsBetter ? change < 0 : change > 0;
  const cls = Math.abs(change) < 0.0005 ? "flat" : good ? "up" : "down";
  return <span className={`delta ${cls}`}>{text}</span>;
}

export default function GscReport({ siteUrl }: { siteUrl: string }) {
  const [days, setDays] = useState(28);
  const [metric, setMetric] = useState<Metric>("clicks");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = (refresh = false) => {
    setLoading(true); setError("");
    api.gsc.overview(siteUrl, days, refresh).then(setData).catch((e: any) => { setData(null); setError(e.message); }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [siteUrl, days]);

  const series = useMemo(() => {
    if (!data) return [];
    const shift = days * 86400000;
    const toPts = (rows: any[], offset = 0) => rows.map((r) => ({ x: Date.parse(r.date) + offset, y: metric === "position" ? r.position : r[metric] }));
    return [
      { name: "This period", color: "var(--accent)", points: toPts(data.series), area: metric !== "position" },
      { name: "Previous period", color: "var(--text-faint)", points: toPts(data.previous_series, shift), dashed: true },
    ];
  }, [data, metric, days]);

  if (error) return (
    <div className="quota-error"><div className="quota-error-head">Couldn't load Search Console data</div><p>{error}</p>
      <button className="btn btn-sm" onClick={() => load(true)}><RefreshCw size={12} /> Try again</button></div>
  );
  if (loading && !data) return <div className="empty"><span className="spinner" /></div>;
  if (!data) return null;

  const fm = METRICS[metric].fmt;
  const table = (rows: any[], isPage = false) => (
    <table>
      <thead><tr><th>{isPage ? "Page" : "Query"}</th><th className="num">Clicks</th><th className="num">Impr.</th><th className="num">CTR</th><th className="num">Pos.</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td style={{ maxWidth: 280 }}>
              <div className="url-row"><span className={isPage ? "url-cell" : ""} title={r.key} style={isPage ? undefined : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{isPage ? pathOf(r.key) : r.key}</span>{isPage && <ExternalLinkButton url={r.key} />}</div>
            </td>
            <td className="num mono">{compact(r.clicks)}</td><td className="num mono">{compact(r.impressions)}</td>
            <td className="num mono">{pct(r.ctr)}</td><td className="num mono">{r.position.toFixed(1)}</td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={5} className="faint" style={{ textAlign: "center", padding: 24 }}>No data in this range</td></tr>}
      </tbody>
    </table>
  );

  return (
    <div>
      <div className="filter-row">
        <div className="strategy-toggle">
          {[7, 28, 90, 180].map((d) => <button key={d} className={days === d ? "active" : ""} onClick={() => setDays(d)}>{d}d</button>)}
        </div>
        <span className="faint" style={{ fontSize: 12.5 }}>{data.range.start} → {data.range.end} · Google data trails by ~2 days</span>
        <button className="btn btn-sm btn-ghost" style={{ marginLeft: "auto" }} onClick={() => load(true)}><RefreshCw size={12} /> Refresh</button>
      </div>

      <div className="kpi-grid">
        {(Object.keys(METRICS) as Metric[]).map((k) => {
          const Icon = METRICS[k].icon;
          const cur = data.totals[k], prev = data.previous[k];
          return (
            <button key={k} className={`kpi selectable ${metric === k ? "active" : ""}`} onClick={() => setMetric(k)}>
              <div className="kpi-label"><Icon size={13} /> {METRICS[k].label}</div>
              <div className="kpi-value">{cur == null ? "—" : METRICS[k].fmt(cur)} <Delta metric={k} cur={cur} prev={prev} /></div>
              <div className="kpi-note">vs {prev == null ? "—" : METRICS[k].fmt(prev)} previous {days} days</div>
            </button>
          );
        })}
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><div className="panel-title">{METRICS[metric].label.replace("Total ", "").replace("Average ", "")} over time</div></div>
        <div className="chart-legend"><span><span className="dot" style={{ background: "var(--accent)" }} /> This period</span><span><span className="dot" style={{ background: "var(--text-faint)" }} /> Previous period</span></div>
        <LineChart series={series} height={240} yFormat={fm} yMin={metric === "position" ? undefined : 0} invertY={metric === "position"}
          xFormat={(x) => new Date(x).toLocaleDateString(undefined, { month: "short", day: "numeric" })} />
      </div>

      <div className="grid-2">
        <div className="card"><div className="panel-head" style={{ padding: "15px 18px 0" }}><div className="panel-title">Top queries</div></div>{table(data.queries)}</div>
        <div className="card"><div className="panel-head" style={{ padding: "15px 18px 0" }}><div className="panel-title">Top pages</div></div>{table(data.pages, true)}</div>
      </div>
      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="panel"><div className="panel-head"><div className="panel-title">Countries</div></div>
          <HBars items={data.countries.map((c: any) => ({ label: c.key.toUpperCase(), value: c.clicks, sub: `${compact(c.impressions)} impressions` }))} format={compact} /></div>
        <div className="panel"><div className="panel-head"><div className="panel-title">Devices</div></div>
          <HBars items={data.devices.map((c: any) => ({ label: c.key.charAt(0) + c.key.slice(1).toLowerCase(), value: c.clicks, sub: `${compact(c.impressions)} impressions` }))} format={compact} /></div>
      </div>
    </div>
  );
}
