import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Globe, Gauge, Link2Off, Network, Search, Clock3, LayoutDashboard, Plus, ChevronRight, Trash2 } from "lucide-react";
import { api } from "../api";
import CrawlHistory from "../components/CrawlHistory";
import GscReport from "../components/GscReport";
import NewCrawlModal from "../components/NewCrawlModal";
import { LineChart, StackedBars, HBars } from "../components/charts";
import { HealthRing } from "../components/HealthRing";
import { ScoreRing } from "../components/ScoreRing";
import CountUp from "../components/CountUp";
import { fmtDate, fmtDateTime, parseTs, timeAgo, healthColor, pathOf, compact } from "../lib/format";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "crawls", label: "Crawls", icon: Globe },
  { id: "lighthouse", label: "Lighthouse", icon: Gauge },
  { id: "links", label: "Outgoing links", icon: Link2Off },
  { id: "backlinks", label: "Backlinks", icon: Network },
  { id: "gsc", label: "Search Console", icon: Search },
  { id: "schedules", label: "Schedules", icon: Clock3 },
] as const;
type TabId = typeof TABS[number]["id"];

const ts = (iso: string) => parseTs(iso)!.getTime();
const xFmt = (x: number) => fmtDate(new Date(x).toISOString());

function Empty({ icon: Icon, title, text, action }: { icon: any; title: string; text: string; action?: React.ReactNode }) {
  return <div className="card empty"><Icon size={26} /><div className="empty-title">{title}</div><div style={{ maxWidth: 480, margin: "0 auto", marginBottom: action ? 14 : 0 }}>{text}</div>{action}</div>;
}

function Overview({ d, go, onCrawl }: { d: any; go: (t: TabId) => void; onCrawl: () => void }) {
  const nav = useNavigate();
  const done = d.crawls.filter((c: any) => c.status === "completed");
  const lc = d.site.last_crawl;
  const healthSeries = [{ name: "Health score", color: "var(--accent)", area: true, points: done.map((c: any) => ({ x: ts(c.created_at), y: c.health_score })) }];
  const pagesSeries = [{ name: "Pages", color: "var(--notice)", area: true, points: done.map((c: any) => ({ x: ts(c.created_at), y: c.pages })) }];
  const msSeries = [{ name: "Avg response (ms)", color: "var(--warning)", points: done.map((c: any) => ({ x: ts(c.created_at), y: c.avg_ms })) }];
  const lhLatest = d.site.lighthouse.latest, olLatest = d.site.outlinks.latest, bkLatest = d.site.backlinks.latest;

  return (
    <div>
      {!lc ? (
        <Empty icon={Globe} title={`${d.host} hasn't been crawled yet`} text="Crawl it to get a health score, issues grouped by category, a site-structure tree and trend charts. Anything you've already run on this domain (Lighthouse, link scans, backlinks) is shown below."
          action={<button className="btn btn-primary" style={{ margin: "0 auto" }} onClick={onCrawl}><Plus size={14} /> Crawl {d.host}</button>} />
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi" style={{ display: "flex", alignItems: "center", gap: 14 }}><HealthRing score={lc.health_score} /><div><div className="kpi-label">Health score</div><div className="kpi-note">crawl #{lc.id} · {timeAgo(lc.created_at)}</div></div></div>
            <div className="kpi"><div className="kpi-label">Pages</div><div className="kpi-value"><CountUp value={lc.pages} /></div><div className="kpi-note">{lc.indexable ?? "—"} indexable · {lc.non_indexable ?? "—"} not</div></div>
            <div className="kpi"><div className="kpi-label">Errors</div><div className="kpi-value" style={{ color: lc.errors ? "var(--error)" : undefined }}><CountUp value={lc.errors} /></div><div className="kpi-note">fix these first</div></div>
            <div className="kpi"><div className="kpi-label">Warnings</div><div className="kpi-value" style={{ color: lc.warnings ? "var(--warning)" : undefined }}><CountUp value={lc.warnings} /></div><div className="kpi-note">{lc.notices} notices</div></div>
            <div className="kpi"><div className="kpi-label">Avg response</div><div className="kpi-value"><CountUp value={lc.avg_ms} /><span className="faint" style={{ fontSize: 13 }}>ms</span></div><div className="kpi-note">server time per page</div></div>
          </div>

          <div className="grid-21">
            <div className="panel"><div className="panel-head"><div><div className="panel-title">Health score over time</div><div className="panel-sub">{done.length} completed crawl{done.length === 1 ? "" : "s"}</div></div></div>
              <LineChart series={healthSeries} height={220} yMin={0} yMax={100} xFormat={xFmt} empty="Run a second crawl to see how health is trending" /></div>
            <div className="panel"><div className="panel-head"><div className="panel-title">Issues per crawl</div></div>
              <StackedBars height={220} names={["Errors", "Warnings", "Notices"]} colors={["var(--error)", "var(--warning)", "var(--notice)"]}
                data={done.slice(-12).map((c: any) => ({ label: fmtDate(c.created_at), values: [c.errors || 0, c.warnings || 0, c.notices || 0] }))} /></div>
          </div>
          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div className="panel"><div className="panel-head"><div className="panel-title">Pages crawled</div></div><LineChart series={pagesSeries} height={170} yMin={0} xFormat={xFmt} yFormat={(v) => compact(v)} /></div>
            <div className="panel"><div className="panel-head"><div className="panel-title">Average response time</div></div><LineChart series={msSeries} height={170} yMin={0} xFormat={xFmt} yFormat={(v) => `${Math.round(v)}ms`} /></div>
          </div>

          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-head"><div><div className="panel-title">Top issues</div><div className="panel-sub">Ranked by severity × pages affected, from the latest crawl</div></div>
              <button className="btn btn-sm" onClick={() => nav(`/crawls/${lc.id}`)}>Open full report <ChevronRight size={12} /></button></div>
            {d.top_issues.length === 0 ? <div className="faint" style={{ fontSize: 13 }}>No issues found.</div> : (
              <HBars items={d.top_issues.map((i: any) => ({ label: i.label, value: i.count, sub: i.category.replace(/_/g, " "),
                color: i.severity === "error" ? "var(--error)" : i.severity === "warning" ? "var(--warning)" : "var(--notice)" }))} />
            )}
          </div>
        </>
      )}

      <div className="section-label">Everything else on {d.host}</div>
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
        <div className="panel" style={{ cursor: "pointer" }} onClick={() => go("lighthouse")}>
          <div className="kpi-label"><Gauge size={13} /> Lighthouse</div>
          {lhLatest ? <div style={{ display: "flex", gap: 8, marginTop: 10 }}>{[["Perf", "performance"], ["SEO", "seo"]].map(([l, k]) => <ScoreRing key={k} size={54} score={lhLatest.scores?.[k]} label={l} />)}</div>
            : <div className="faint" style={{ fontSize: 13, marginTop: 8 }}>No audits yet</div>}
          <div className="kpi-note" style={{ marginTop: 8 }}>{d.site.lighthouse.count} audit{d.site.lighthouse.count === 1 ? "" : "s"}</div>
        </div>
        <div className="panel" style={{ cursor: "pointer" }} onClick={() => go("links")}>
          <div className="kpi-label"><Link2Off size={13} /> Outgoing links</div>
          {olLatest ? <div className="kpi-value" style={{ color: olLatest.broken ? "var(--error)" : "var(--ok)" }}>{olLatest.broken}<span className="faint" style={{ fontSize: 13 }}> broken of {olLatest.total}</span></div> : <div className="faint" style={{ fontSize: 13, marginTop: 8 }}>No link scans yet</div>}
          <div className="kpi-note">{d.site.outlinks.count} scan{d.site.outlinks.count === 1 ? "" : "s"}</div>
        </div>
        <div className="panel" style={{ cursor: "pointer" }} onClick={() => go("backlinks")}>
          <div className="kpi-label"><Network size={13} /> Backlinks</div>
          {bkLatest ? <div className="kpi-value">{compact(bkLatest.total)}<span className="faint" style={{ fontSize: 13 }}> from {bkLatest.referring_domains} domains</span></div> : <div className="faint" style={{ fontSize: 13, marginTop: 8 }}>No lookups yet</div>}
          <div className="kpi-note">{d.site.backlinks.count} lookup{d.site.backlinks.count === 1 ? "" : "s"}</div>
        </div>
        <div className="panel" style={{ cursor: "pointer" }} onClick={() => go("schedules")}>
          <div className="kpi-label"><Clock3 size={13} /> Schedules</div>
          <div className="kpi-value">{d.site.schedules}<span className="faint" style={{ fontSize: 13 }}> active</span></div>
          <div className="kpi-note">recurring crawls</div>
        </div>
      </div>
    </div>
  );
}

function LighthouseTab({ d, host }: { d: any; host: string }) {
  const nav = useNavigate();
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const urls = useMemo(() => Array.from(new Set(d.lighthouse.map((r: any) => r.url))) as string[], [d]);
  const [url, setUrl] = useState<string>("");
  const active = url || urls[0] || "";
  const runs = d.lighthouse.filter((r: any) => r.status === "completed" && r.strategy === strategy && r.url === active).slice().reverse();
  const line = (name: string, key: string, color: string) => ({ name, color, points: runs.map((r: any) => ({ x: ts(r.created_at), y: r.scores?.[key] ?? null })) });

  if (d.lighthouse.length === 0) return <Empty icon={Gauge} title="No Lighthouse audits for this site" text="Audit any page on this domain — mobile or desktop — and its scores will be tracked here over time."
    action={<button className="btn btn-primary" style={{ margin: "0 auto" }} onClick={() => nav(`/lighthouse?url=${encodeURIComponent("https://" + host)}`)}>Run an audit</button>} />;
  return (
    <div>
      <div className="filter-row">
        <select className="select" style={{ maxWidth: 360 }} value={active} onChange={(e) => setUrl(e.target.value)}>{urls.map((u) => <option key={u} value={u}>{u.replace(/^https?:\/\//, "")}</option>)}</select>
        <div className="strategy-toggle">{(["mobile", "desktop"] as const).map((s) => <button key={s} className={strategy === s ? "active" : ""} onClick={() => setStrategy(s)}>{s[0].toUpperCase() + s.slice(1)}</button>)}</div>
        <button className="btn" style={{ marginLeft: "auto" }} onClick={() => nav(`/lighthouse?url=${encodeURIComponent(active || "https://" + host)}`)}>Run new audit</button>
      </div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="chart-legend">{[["Performance", "var(--accent)"], ["Accessibility", "var(--notice)"], ["Best practices", "var(--ok)"], ["SEO", "var(--warning)"]].map(([n, c]) => <span key={n}><span className="dot" style={{ background: c }} /> {n}</span>)}</div>
        <LineChart height={230} yMin={0} yMax={100} xFormat={xFmt} empty="Run this audit at least twice to see a trend"
          series={[line("Performance", "performance", "var(--accent)"), line("Accessibility", "accessibility", "var(--notice)"), line("Best practices", "best_practices", "var(--ok)"), line("SEO", "seo", "var(--warning)")]} />
      </div>
      <div className="card"><table>
        <thead><tr><th>Page</th><th>Device</th><th className="num">Perf</th><th className="num">A11y</th><th className="num">BP</th><th className="num">SEO</th><th>When</th></tr></thead>
        <tbody>{d.lighthouse.map((r: any) => (
          <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => nav(`/lighthouse?run=${r.id}`)}>
            <td className="url-cell" style={{ maxWidth: 320 }}>{pathOf(r.url)}</td><td className="muted">{r.strategy}</td>
            {["performance", "accessibility", "best_practices", "seo"].map((k) => <td key={k} className="num mono">{r.scores?.[k] ?? "—"}</td>)}
            <td className="faint">{timeAgo(r.created_at)}</td></tr>))}</tbody></table></div>
    </div>
  );
}

function LinksTab({ d, host }: { d: any; host: string }) {
  const nav = useNavigate();
  const done = d.outlinks.filter((r: any) => r.status === "completed").slice().reverse();
  if (d.outlinks.length === 0) return <Empty icon={Link2Off} title="No link scans for this site" text="Scan any page on this domain to find broken, redirecting and nofollow links."
    action={<button className="btn btn-primary" style={{ margin: "0 auto" }} onClick={() => nav(`/outlinks?url=${encodeURIComponent("https://" + host)}`)}>Scan a page</button>} />;
  return (
    <div>
      <div className="filter-row"><button className="btn" style={{ marginLeft: "auto" }} onClick={() => nav(`/outlinks?url=${encodeURIComponent("https://" + host)}`)}>Scan another page</button></div>
      <div className="panel" style={{ marginBottom: 16 }}><div className="panel-head"><div className="panel-title">Broken links per scan</div></div>
        <LineChart height={190} yMin={0} xFormat={xFmt} empty="Scan a page twice to see broken links trend" series={[{ name: "Broken", color: "var(--error)", area: true, points: done.map((r: any) => ({ x: ts(r.created_at), y: r.summary?.broken ?? 0 })) }]} /></div>
      <div className="card"><table>
        <thead><tr><th>Page</th><th className="num">Links</th><th className="num">Broken</th><th className="num">Redirects</th><th className="num">Restricted</th><th>When</th></tr></thead>
        <tbody>{d.outlinks.map((r: any) => (
          <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => nav(`/outlinks?run=${r.id}`)}>
            <td className="url-cell" style={{ maxWidth: 340 }}>{pathOf(r.url)}</td><td className="num mono">{r.summary?.total ?? "—"}</td>
            <td className="num mono" style={{ color: r.summary?.broken ? "var(--error)" : undefined }}>{r.summary?.broken ?? "—"}</td>
            <td className="num mono">{r.summary?.redirect ?? "—"}</td><td className="num mono">{r.summary?.restricted ?? "—"}</td><td className="faint">{timeAgo(r.created_at)}</td></tr>))}</tbody></table></div>
    </div>
  );
}

function BacklinksTab({ d, host }: { d: any; host: string }) {
  const nav = useNavigate();
  if (d.backlinks.length === 0) return <Empty icon={Network} title="No backlink lookups for this site" text="Look up who links to this domain using your crawls, Bing Webmaster Tools and Open PageRank."
    action={<button className="btn btn-primary" style={{ margin: "0 auto" }} onClick={() => nav(`/backlinks?target=${encodeURIComponent(host)}`)}>Look up backlinks</button>} />;
  const hist = d.backlinks.slice().reverse();
  return (
    <div>
      <div className="filter-row"><button className="btn" style={{ marginLeft: "auto" }} onClick={() => nav(`/backlinks?target=${encodeURIComponent(host)}`)}>New lookup</button></div>
      <div className="panel" style={{ marginBottom: 16 }}><div className="panel-head"><div className="panel-title">Backlinks over time</div></div>
        <LineChart height={190} yMin={0} xFormat={xFmt} empty="Look up this site again later to see how its backlinks change"
          series={[{ name: "Backlinks", color: "var(--accent)", area: true, points: hist.map((r: any) => ({ x: ts(r.created_at), y: r.summary?.total_reported ?? r.summary?.sample_size ?? 0 })) },
                   { name: "Referring domains", color: "var(--notice)", points: hist.map((r: any) => ({ x: ts(r.created_at), y: r.summary?.referring_domains ?? 0 })) }]} /></div>
      <div className="card"><table>
        <thead><tr><th>Target</th><th className="num">Backlinks</th><th className="num">Domains</th><th>When</th></tr></thead>
        <tbody>{d.backlinks.map((r: any) => (
          <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => nav(`/backlinks?run=${r.id}`)}>
            <td className="url-cell" style={{ maxWidth: 380 }}>{r.target}</td><td className="num mono">{r.summary?.total_reported ?? r.summary?.sample_size ?? "—"}</td>
            <td className="num mono">{r.summary?.referring_domains ?? "—"}</td><td className="faint">{timeAgo(r.created_at)}</td></tr>))}</tbody></table></div>
    </div>
  );
}

function GscTab({ host }: { host: string }) {
  const nav = useNavigate();
  const [state, setState] = useState<any>({ loading: true });
  useEffect(() => {
    (async () => {
      try {
        const st = await api.gsc.status();
        if (!st.connected) return setState({ st });
        const sites: any[] = await api.gsc.sites();
        const match = sites.filter((s) => s.host === host);
        setState({ st, site: (match.find((s) => s.site_url.startsWith("sc-domain:")) || match[0])?.site_url || null });
      } catch (e: any) { setState({ error: e.message }); }
    })();
  }, [host]);
  if (state.loading) return <div className="empty"><span className="spinner" /></div>;
  if (state.error) return <div className="quota-error"><div className="quota-error-head">Search Console error</div><p>{state.error}</p><button className="btn btn-sm" onClick={() => nav("/gsc")}>Open Search Console settings</button></div>;
  if (!state.st.connected) return <Empty icon={Search} title="Search Console isn't connected" text="Connect your Google account once and every property you own shows up here, next to your crawl data."
    action={<button className="btn btn-primary" style={{ margin: "0 auto" }} onClick={() => nav("/gsc")}>{state.st.configured ? "Connect Google account" : "Set up Search Console"}</button>} />;
  if (!state.site) return <Empty icon={Search} title={`No Search Console property for ${host}`} text="Your connected Google account doesn't have a property matching this domain. Add and verify it in Search Console first." />;
  return (
    <div>
      <div className="filter-row"><span className="badge badge-neutral">{state.site}</span><button className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={() => nav(`/gsc?site=${encodeURIComponent(state.site)}`)}>Open full view (indexing, fix priority)</button></div>
      <GscReport siteUrl={state.site} />
    </div>
  );
}

function SchedulesTab({ d, host, reload }: { d: any; host: string; reload: () => void }) {
  const [hours, setHours] = useState(24);
  const add = async () => { await api.schedules.create({ seeds: [`https://${host}`], every_hours: hours }); reload(); };
  return (
    <div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><div className="panel-title">Crawl {host} automatically</div></div>
        <div className="qa-row" style={{ alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 13.5 }}>Repeat every</span>
          <select className="select" value={hours} onChange={(e) => setHours(+e.target.value)}>{[[6, "6 hours"], [12, "12 hours"], [24, "day"], [72, "3 days"], [168, "week"]].map(([h, l]) => <option key={h} value={h}>{l}</option>)}</select>
          <button className="btn btn-primary" onClick={add}><Plus size={14} /> Add schedule</button>
        </div>
      </div>
      {d.schedules.length === 0 ? <Empty icon={Clock3} title="No schedules for this site" text="Scheduled crawls give you the trend charts without remembering to run anything." /> : (
        <div className="card"><table>
          <thead><tr><th>Seed</th><th>Frequency</th><th>Next run</th><th>Enabled</th><th></th></tr></thead>
          <tbody>{d.schedules.map((s: any) => (
            <tr key={s.id}><td className="mono">{s.seeds?.[0]}</td><td>every {s.every_hours}h</td><td className="muted">{fmtDateTime(s.next_run_at)}</td>
              <td><label className="switch"><input type="checkbox" checked={s.enabled} onChange={async () => { await api.schedules.update(s.id, { enabled: !s.enabled }); reload(); }} /><span className="track" /><span className="thumb-dot" /></label></td>
              <td><button className="icon-btn" onClick={async () => { if (confirm("Delete this schedule?")) { await api.schedules.delete(s.id); reload(); } }}><Trash2 size={13} /></button></td></tr>))}</tbody></table></div>
      )}
    </div>
  );
}

export default function SitePage() {
  const { host = "" } = useParams();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as TabId) || "overview";
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(false);

  const load = () => api.dashboard.site(host).then((r: any) => { setD(r); setError(""); }).catch((e: any) => setError(e.message));
  useEffect(() => { setD(null); load(); }, [host]);
  const setTab = (t: TabId) => setParams(t === "overview" ? {} : { tab: t }, { replace: true });

  if (error) return <div className="quota-error"><div className="quota-error-head">Couldn't load {host}</div><p>{error}</p></div>;
  if (!d) return <div className="empty"><span className="spinner" /></div>;

  const lc = d.site.last_crawl;
  const enc = encodeURIComponent;
  return (
    <div>
      <div className="crumb"><a href="/" onClick={(e) => { e.preventDefault(); nav("/"); }}><LayoutDashboard size={12} /> Dashboard</a> / {d.host}</div>
      <div className="page-head">
        <div>
          <div className="page-title">{d.host}{d.site.running && <span className="badge badge-notice"><span className="dot dot-run" /> working</span>}</div>
          <div className="page-sub">{lc ? <>Health <b style={{ color: healthColor(lc.health_score) }}>{Math.round(lc.health_score)}</b> · {lc.pages} pages · {lc.errors} errors · last crawled {timeAgo(lc.created_at)}</> : "Not crawled yet"}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div className="site-switch">
            <select className="select" value={d.host} onChange={(e) => nav(`/sites/${e.target.value}`)} title="Switch site">{d.hosts.map((h: string) => <option key={h} value={h}>{h}</option>)}</select>
          </div>
          <button className="btn btn-primary" onClick={() => setModal(true)}><Globe size={14} /> Crawl</button>
          <button className="btn" onClick={() => nav(`/lighthouse?url=${enc("https://" + d.host)}`)}><Gauge size={14} /> Lighthouse</button>
          <button className="btn" onClick={() => nav(`/outlinks?url=${enc("https://" + d.host)}`)}><Link2Off size={14} /> Links</button>
          <button className="btn" onClick={() => nav(`/backlinks?target=${enc(d.host)}`)}><Network size={14} /> Backlinks</button>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => <div key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}><t.icon size={13} /> {t.label}</div>)}
      </div>

      {tab === "overview" && <Overview d={d} go={setTab} onCrawl={() => setModal(true)} />}
      {tab === "crawls" && <CrawlHistory domainId={d.domain_id} host={d.host} onChanged={load} />}
      {tab === "lighthouse" && <LighthouseTab d={d} host={d.host} />}
      {tab === "links" && <LinksTab d={d} host={d.host} />}
      {tab === "backlinks" && <BacklinksTab d={d} host={d.host} />}
      {tab === "gsc" && <GscTab host={d.host} />}
      {tab === "schedules" && <SchedulesTab d={d} host={d.host} reload={load} />}

      {modal && <NewCrawlModal initialSeed={`https://${d.host}`} onClose={() => setModal(false)} onCreated={(id) => { setModal(false); nav(`/crawls/${id}`); }} />}
    </div>
  );
}
