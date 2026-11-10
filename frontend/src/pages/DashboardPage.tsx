import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Globe, Gauge, Link2Off, Network, Clock3, ArrowRight, FileWarning, Files, Activity, Plug, CheckCircle2, CircleDashed, Zap } from "lucide-react";
import { api } from "../api";
import NewCrawlModal from "../components/NewCrawlModal";
import Sparkline from "../components/Sparkline";
import CountUp from "../components/CountUp";
import { LineChart, Donut } from "../components/charts";
import { timeAgo, parseTs, fmtDate, healthColor } from "../lib/format";

export const SERIES_COLORS = ["var(--accent)", "var(--notice)", "var(--ok)", "var(--warning)", "var(--accent-hover)", "var(--text-dim)"];
const ACTIVITY_ICON: Record<string, any> = { crawl: Globe, lighthouse: Gauge, outlinks: Link2Off, backlinks: Network };

function QuickActions() {
  const nav = useNavigate();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const go = async (kind: string) => {
    const u = url.trim();
    if (!u) { setError("Enter a domain or URL first — a path is fine, it'll be filed under its domain."); return; }
    setError(""); setBusy(kind);
    try {
      if (kind === "crawl") { const r = await api.crawls.create({ seeds: [u], preset: "quick", config: {}, checks_config: {} }); nav(`/crawls/${r.id}`); }
      if (kind === "lighthouse") { const r = await api.lighthouse.create({ url: u, strategy: "mobile" }); nav(`/lighthouse?run=${r.id}`); }
      if (kind === "links") { const r = await api.outlinks.create({ url: u }); nav(`/outlinks?run=${r.id}`); }
      if (kind === "backlinks") { const r = await api.backlinks.create({ target: u }); nav(`/backlinks?run=${r.id}`); }
    } catch (e: any) { setError(e.message); setBusy(""); }
  };
  const actions = [
    { id: "crawl", label: "Crawl site", icon: Globe, primary: true }, { id: "lighthouse", label: "Lighthouse", icon: Gauge },
    { id: "links", label: "Check links", icon: Link2Off }, { id: "backlinks", label: "Backlinks", icon: Network },
  ];
  return (
    <div className="quick-actions">
      <div className="qa-row">
        <input className="input qa-input" placeholder="Paste a domain or any URL — e.g. example.com/blog/post" value={url}
          onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go("crawl")} />
        {actions.map((a) => (
          <button key={a.id} className={`btn ${a.primary ? "btn-primary" : ""}`} onClick={() => go(a.id)} disabled={!!busy}>
            {busy === a.id ? <span className="spinner" /> : <a.icon size={14} />} {a.label}
          </button>
        ))}
      </div>
      {error ? <div className="qa-hint" style={{ color: "var(--error)" }}>{error}</div>
        : <div className="qa-hint">One box, every tool. Whatever you run is filed under the URL's domain, so it all shows up together on that site's page.</div>}
    </div>
  );
}

export default function DashboardPage() {
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);
  const [modal, setModal] = useState(false);
  const [error, setError] = useState("");

  const load = () => api.dashboard.summary().then((d: any) => { setData(d); setError(""); }).catch((e: any) => setError(e.message));
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  const trendSeries = useMemo(() => (data?.health_trend || []).map((s: any, i: number) => ({
    name: s.host, color: SERIES_COLORS[i % SERIES_COLORS.length],
    points: s.points.map((p: any) => ({ x: parseTs(p.t)!.getTime(), y: p.score })),
  })), [data]);

  if (error && !data) return <div className="quota-error"><div className="quota-error-head">Couldn't load the dashboard</div><p>{error}</p></div>;
  if (!data) return <div className="empty"><span className="spinner" /></div>;

  const t = data.totals, sev = data.severity, g = data.integrations.gsc;
  const providersOn = data.integrations.backlink_providers.filter((p: any) => p.configured).length;
  const kpis = [
    { label: "Sites tracked", value: t.sites, icon: Globe, note: `${t.crawled_sites} crawled` },
    { label: "Pages crawled", value: t.pages, icon: Files, note: "latest crawl per site" },
    { label: "Open issues", value: t.issues, icon: FileWarning, note: `${sev.error} errors · ${sev.warning} warnings` },
    { label: "Avg health score", value: t.avg_health, icon: Activity, note: "across crawled sites", color: healthColor(t.avg_health) },
    { label: "Broken links", value: t.broken_links, icon: Link2Off, note: `${t.outlink_runs} link scans`, color: t.broken_links ? "var(--error)" : undefined },
    { label: "Lighthouse audits", value: t.lighthouse_runs, icon: Gauge, note: "on-demand" },
    { label: "Backlink lookups", value: t.backlink_lookups, icon: Network, note: `${providersOn + 1} of 3 sources on` },
    { label: "Schedules", value: t.schedules, icon: Clock3, note: "recurring crawls" },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">Everything you've scanned, measured and connected — in one place.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setModal(true)}><Plus size={14} /> New crawl</button>
      </div>

      <QuickActions />

      <div className="kpi-grid">
        {kpis.map((k) => (
          <div key={k.label} className="kpi">
            <div className="kpi-label"><k.icon size={13} /> {k.label}</div>
            <div className="kpi-value" style={{ color: k.color }}>{k.value == null ? "—" : <CountUp value={k.value} decimals={k.label.startsWith("Avg") ? 1 : 0} />}</div>
            <div className="kpi-note">{k.note}</div>
          </div>
        ))}
      </div>

      <div className="grid-21">
        <div className="panel">
          <div className="panel-head"><div><div className="panel-title">Health score over time</div><div className="panel-sub">One line per site, one point per completed crawl</div></div></div>
          {trendSeries.length > 0 && <div className="chart-legend">{trendSeries.map((s: any) => <span key={s.name}><span className="dot" style={{ background: s.color }} /> {s.name}</span>)}</div>}
          <LineChart series={trendSeries} height={230} yMin={0} yMax={100} empty="Run at least two crawls of a site to see its trend" xFormat={(x) => fmtDate(new Date(x).toISOString())} />
        </div>
        <div className="panel">
          <div className="panel-head"><div><div className="panel-title">Open issues</div><div className="panel-sub">From each site's latest crawl</div></div></div>
          <Donut center={{ value: String(t.issues), label: "issues" }} segments={[
            { label: "Errors", value: sev.error, color: "var(--error)" }, { label: "Warnings", value: sev.warning, color: "var(--warning)" }, { label: "Notices", value: sev.notice, color: "var(--notice)" }]} />
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16, padding: 0 }}>
        <div className="panel-head" style={{ padding: "17px 19px 0" }}><div><div className="panel-title"><Globe size={15} /> Sites</div><div className="panel-sub">Click a site for its full dashboard — crawls, Lighthouse, links, backlinks and Search Console</div></div></div>
        {data.sites.length === 0 ? (
          <div className="empty"><Zap size={26} /><div className="empty-title">Nothing scanned yet</div><div>Paste a URL in the box above and pick a tool to get started.</div></div>
        ) : (
          <table>
            <thead><tr><th>Site</th><th>Health</th><th>Trend</th><th>Issues</th><th className="num">Pages</th><th>Coverage</th><th>Last activity</th><th></th></tr></thead>
            <tbody>
              {data.sites.map((s: any) => {
                const lc = s.last_crawl, lh = s.lighthouse.latest, ol = s.outlinks.latest, bk = s.backlinks.latest;
                return (
                  <tr key={s.host} className="site-row" onClick={() => nav(`/sites/${s.host}`)}>
                    <td><div className="site-name">{s.running && <span className="health-dot pulse" style={{ background: "var(--accent)" }} />}{s.host}</div>
                      <div className="faint" style={{ fontSize: 12 }}>{s.crawl_count} crawl{s.crawl_count === 1 ? "" : "s"}</div></td>
                    <td>{lc?.health_score != null ? <span className="score" style={{ color: healthColor(lc.health_score) }}>{Math.round(lc.health_score)}</span> : <span className="faint">—</span>}</td>
                    <td><Sparkline values={s.trend.map((x: any) => x.score)} width={64} height={20} /></td>
                    <td>{lc ? <div style={{ display: "flex", gap: 5 }}>
                      {lc.errors > 0 && <span className="badge badge-error">{lc.errors}</span>}{lc.warnings > 0 && <span className="badge badge-warning">{lc.warnings}</span>}
                      {lc.errors + lc.warnings === 0 && <span className="badge badge-ok">clean</span>}</div> : <span className="faint">—</span>}</td>
                    <td className="num mono">{lc?.pages ?? "—"}</td>
                    <td><div className="module-chips">
                      <span className={`module-chip ${lc ? "on" : "off"}`}><Globe size={11} /> Crawl</span>
                      <span className={`module-chip ${lh ? "on" : "off"}`}><Gauge size={11} /> {lh?.scores?.performance != null ? lh.scores.performance : "Lighthouse"}</span>
                      <span className={`module-chip ${ol ? (ol.broken ? "warn" : "on") : "off"}`}><Link2Off size={11} /> {ol ? (ol.broken ? `${ol.broken} broken` : "links ok") : "Links"}</span>
                      <span className={`module-chip ${bk ? "on" : "off"}`}><Network size={11} /> {bk ? bk.total ?? 0 : "Backlinks"}</span>
                      {s.schedules > 0 && <span className="module-chip on"><Clock3 size={11} /> {s.schedules}</span>}
                    </div></td>
                    <td className="faint" style={{ whiteSpace: "nowrap" }}>{timeAgo(s.last_activity)}</td>
                    <td><ArrowRight size={14} className="faint" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid-21">
        <div className="panel">
          <div className="panel-head"><div className="panel-title"><Activity size={15} /> Recent activity</div></div>
          {data.activity.length === 0 ? <div className="faint" style={{ fontSize: 13 }}>Nothing yet.</div> : (
            <div className="activity">
              {data.activity.map((a: any) => {
                const Icon = ACTIVITY_ICON[a.type] || Globe;
                return (
                  <div key={`${a.type}-${a.id}`} className="activity-item" onClick={() => nav(a.href)}>
                    <div className="activity-icon"><Icon size={14} /></div>
                    <div className="activity-main">
                      <div className="activity-title">{a.title}</div>
                      <div className="activity-detail">{a.type === "crawl" && a.host ? `${a.host} · ` : ""}{a.detail}</div>
                    </div>
                    <div className="activity-time">{timeAgo(a.ts)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          {data.running.length > 0 && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-head"><div className="panel-title"><span className="spinner" /> Running now</div></div>
              {data.running.map((r: any) => (
                <div key={`${r.type}-${r.id}`} className="running-item" onClick={() => nav(r.href)}>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
                  <span className="faint" style={{ fontSize: 12.5 }}>{r.progress}</span>
                </div>
              ))}
            </div>
          )}
          <div className="panel">
            <div className="panel-head"><div className="panel-title"><Plug size={15} /> Integrations</div></div>
            <div className="integration-row">
              {g.connected ? <CheckCircle2 size={16} color="var(--ok)" /> : <CircleDashed size={16} color="var(--text-faint)" />}
              <div className="grow"><div>Search Console</div><div className="sub">{g.connected ? g.email || "Connected" : g.configured ? "Ready to connect" : "Not set up"}</div></div>
              <button className="btn btn-sm" onClick={() => nav("/gsc")}>{g.connected ? "Open" : "Set up"}</button>
            </div>
            <div className="integration-row">
              {providersOn > 0 ? <CheckCircle2 size={16} color="var(--ok)" /> : <CircleDashed size={16} color="var(--text-faint)" />}
              <div className="grow"><div>Backlink sources</div><div className="sub">{providersOn + 1} of 3 active (your crawls{providersOn ? " + keys" : ""})</div></div>
              <button className="btn btn-sm" onClick={() => nav("/backlinks")}>Open</button>
            </div>
            <div className="integration-row">
              <Clock3 size={16} color={t.schedules ? "var(--ok)" : "var(--text-faint)"} />
              <div className="grow"><div>Scheduled crawls</div><div className="sub">{t.schedules} active</div></div>
              <button className="btn btn-sm" onClick={() => nav("/schedules")}>Manage</button>
            </div>
          </div>
        </div>
      </div>

      {modal && <NewCrawlModal onClose={() => setModal(false)} onCreated={(id) => { setModal(false); nav(`/crawls/${id}`); }} />}
    </div>
  );
}
