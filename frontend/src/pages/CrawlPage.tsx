import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Download, LayoutGrid, ListTree, GitBranch, Pause, Play, Square } from "lucide-react";
import { api } from "../api";
import { CrawlStatusBadge, SeverityBadge, StatusBadge, IndexableBadge } from "../components/Badges";
import { HealthRing } from "../components/HealthRing";
import { DistBar } from "../components/Bars";
import PageDrawer from "../components/PageDrawer";
import ExternalLinkButton from "../components/ExternalLinkButton";
import ResourceIcon from "../components/ResourceIcon";
import SiteTree from "../components/SiteTree";
import IssuesExplorer from "../components/IssuesExplorer";
import CountUp from "../components/CountUp";

const RUNNING_STATES = new Set(["queued", "running", "pausing", "stopping", "analyzing"]);

const PAGE_FILTERS = [
  { id: "all", label: "All" },
  { id: "indexable", label: "Indexable" },
  { id: "non_indexable", label: "Non-indexable" },
  { id: "4xx", label: "4xx" },
  { id: "5xx", label: "5xx" },
  { id: "redirects", label: "Redirects" },
  { id: "missing_title", label: "Missing title" },
  { id: "missing_meta", label: "Missing meta" },
  { id: "missing_h1", label: "Missing H1" },
  { id: "orphans", label: "Orphans" },
  { id: "in_sitemap", label: "In sitemap" },
];

const RESOURCE_TABS = [
  { id: "", label: "All" },
  { id: "page", label: "Pages" },
  { id: "image", label: "Images" },
  { id: "video,audio", label: "Video / Audio" },
  { id: "pdf", label: "PDFs" },
  { id: "document", label: "Documents" },
  { id: "stylesheet,script,font,other", label: "Other assets" },
];

export default function CrawlPage() {
  const { id } = useParams();
  const cid = Number(id);
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [crawl, setCrawl] = useState<any>(null);
  const [tab, setTab] = useState<"overview" | "issues" | "pages" | "graph">("overview");
  const pollRef = useRef<any>(null);
  const quickOpenId = params.get("open") ? Number(params.get("open")) : null;
  const closeQuickOpen = () => setParams((p) => { p.delete("open"); return p; }, { replace: true });

  const loadCrawl = () => api.crawls.get(cid).then(setCrawl);

  useEffect(() => {
    loadCrawl();
    return () => clearInterval(pollRef.current);
  }, [cid]);

  useEffect(() => {
    clearInterval(pollRef.current);
    if (crawl && RUNNING_STATES.has(crawl.status)) {
      pollRef.current = setInterval(loadCrawl, 1500);
    }
    return () => clearInterval(pollRef.current);
  }, [crawl?.status]);

  const act = async (fn: () => Promise<any>) => { await fn(); loadCrawl(); };

  if (!crawl) return <div className="empty"><span className="spinner" /></div>;

  const s = crawl.stats || {};
  const running = RUNNING_STATES.has(crawl.status);

  return (
    <div>
      <div className="crumb">
        <a href="/" onClick={(e) => { e.preventDefault(); nav(`/sites/${crawl.host}`); }}>{crawl.host}</a> / crawl #{crawl.id}
      </div>
      <div className="page-head">
        <div>
          <div className="page-title">{crawl.host} <CrawlStatusBadge status={crawl.status} /></div>
          <div className="page-sub">
            started {crawl.started_at ? new Date(crawl.started_at + "Z").toLocaleString() : "—"}
            {crawl.config?.render_js && <> · <span className="badge badge-accent">JS rendering</span></>}
            {crawl.note && <> · {crawl.note}</>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {crawl.status === "running" && <button className="btn" onClick={() => act(() => api.crawls.pause(cid))}><Pause size={13} /> Pause</button>}
          {crawl.status === "running" && <button className="btn btn-danger" onClick={() => act(() => api.crawls.stop(cid))}><Square size={13} /> Stop</button>}
          {["paused", "stopped", "failed"].includes(crawl.status) && <button className="btn btn-primary" onClick={() => act(() => api.crawls.resume(cid))}><Play size={13} /> Resume</button>}
          {!running && (
            <>
              <a className="btn" href={api.exportUrl(cid, "pages", "csv")}><Download size={13} /> Pages CSV</a>
              <a className="btn" href={api.exportUrl(cid, "issues", "csv")}><Download size={13} /> Issues CSV</a>
            </>
          )}
        </div>
      </div>

      {crawl.error && <div className="badge badge-error" style={{ marginBottom: 14, display: "inline-flex" }}>{crawl.error}</div>}

      {running && (
        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 14 }}>
            <span><span className="spinner" style={{ marginRight: 8 }} />{crawl.status === "analyzing" ? "Analyzing…" : `Crawling — ${s.crawled ?? 0} pages, ${s.queued ?? 0} queued`}</span>
            <span className="muted">{s.rate ?? 0} pages/sec · {s.errors ?? 0} errors</span>
          </div>
          {s.recent?.length > 0 && (
            <div className="mono" style={{ fontSize: 12.5, color: "var(--text-faint)", maxHeight: 90, overflowY: "auto" }}>
              {s.recent.map((r: any, i: number) => <div key={i}>{r[1]} {r[0]}</div>)}
            </div>
          )}
        </div>
      )}

      <div className="tabs">
        {([
          ["overview", "Overview", LayoutGrid],
          ["issues", `Issues (${s.issues_total ?? 0})`, ListTree],
          ["pages", `Pages (${s.total_pages ?? 0})`, ListTree],
          ["graph", "Site structure", GitBranch],
        ] as const).map(([key, label, Icon]) => (
          <div key={key} className={`tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key as any)}>
            <Icon size={13} /> {label}
          </div>
        ))}
      </div>

      {tab === "overview" && <OverviewTab crawl={crawl} stats={s} />}
      {tab === "issues" && <IssuesExplorer cid={cid} />}
      {tab === "pages" && <PagesTab cid={cid} />}
      {tab === "graph" && <TreeTab cid={cid} />}

      {quickOpenId && <PageDrawer cid={cid} pageId={quickOpenId} onClose={closeQuickOpen} />}
    </div>
  );
}

function TreeTab({ cid }: { cid: number }) {
  const [drawer, setDrawer] = useState<number | null>(null);
  return (
    <div>
      <SiteTree cid={cid} onOpenPage={setDrawer} />
      {drawer && <PageDrawer cid={cid} pageId={drawer} onClose={() => setDrawer(null)} />}
    </div>
  );
}

function OverviewTab({ crawl, stats }: { crawl: any; stats: any }) {
  const sev = stats.issues_by_severity || {};
  return (
    <div>
      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <HealthRing score={crawl.health_score} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>Health score</div>
            <div className="faint" style={{ fontSize: 13.5 }}>Weighted by issue severity across {stats.total_pages ?? 0} crawled items</div>
          </div>
        </div>
        <div className="card card-pad">
          <div className="stat-label" style={{ marginBottom: 10 }}>Issues by severity</div>
          <div style={{ display: "flex", gap: 16 }}>
            <div><SeverityBadge severity="error" /> <span className="mono" style={{ marginLeft: 6, fontWeight: 600 }}>{sev.error ?? 0}</span></div>
            <div><SeverityBadge severity="warning" /> <span className="mono" style={{ marginLeft: 6, fontWeight: 600 }}>{sev.warning ?? 0}</span></div>
            <div><SeverityBadge severity="notice" /> <span className="mono" style={{ marginLeft: 6, fontWeight: 600 }}>{sev.notice ?? 0}</span></div>
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card"><div className="stat-label">Total crawled</div><div className="stat-value mono"><CountUp value={stats.total_pages ?? 0} /></div></div>
        <div className="stat-card"><div className="stat-label">Indexable</div><div className="stat-value mono"><CountUp value={stats.indexable ?? 0} /></div></div>
        <div className="stat-card"><div className="stat-label">Non-indexable</div><div className="stat-value mono"><CountUp value={stats.non_indexable ?? 0} /></div></div>
        <div className="stat-card"><div className="stat-label">Avg response time</div><div className="stat-value mono"><CountUp value={stats.avg_response_ms ?? 0} />ms</div></div>
      </div>

      <div className="grid-2">
        <div className="card card-pad">
          <div className="stat-label" style={{ marginBottom: 10 }}>Status codes</div>
          <DistBar data={stats.status_dist || {}} />
        </div>
        <div className="card card-pad">
          <div className="stat-label" style={{ marginBottom: 10 }}>Crawl depth</div>
          <DistBar data={stats.depth_dist || {}} />
        </div>
      </div>
    </div>
  );
}

function PagesTab({ cid }: { cid: number }) {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [resourceType, setResourceType] = useState("page");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("url");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [offset, setOffset] = useState(0);
  const [drawer, setDrawer] = useState<number | null>(null);
  const limit = 50;

  useEffect(() => { api.pages.resourceCounts(cid).then(setCounts); }, [cid]);

  useEffect(() => {
    api.pages.list(cid, { resource_type: resourceType || undefined, filter, search: search || undefined, sort, dir, limit, offset })
      .then((r) => { setItems(r.items); setTotal(r.total); });
  }, [cid, resourceType, filter, search, sort, dir, offset]);

  const toggleSort = (col: string) => {
    if (sort === col) setDir(dir === "asc" ? "desc" : "asc");
    else { setSort(col); setDir("asc"); }
    setOffset(0);
  };

  const countFor = (ids: string) => ids.split(",").reduce((sum, id) => sum + (counts[id] || 0), 0);
  const isMedia = resourceType !== "page" && resourceType !== "";

  return (
    <div>
      <div className="resource-tabs">
        {RESOURCE_TABS.map((t) => {
          const n = t.id === "" ? Object.values(counts).reduce((a, b) => a + b, 0) : countFor(t.id);
          return (
            <span key={t.id} className={`chip ${resourceType === t.id ? "active" : ""}`}
              onClick={() => { setResourceType(t.id); setFilter("all"); setOffset(0); }}>
              {t.label} <span className="chip-count">{n}</span>
            </span>
          );
        })}
      </div>

      {!isMedia && (
        <div className="filter-row">
          {PAGE_FILTERS.map((f) => (
            <span key={f.id} className={`chip ${filter === f.id ? "active" : ""}`} onClick={() => { setFilter(f.id); setOffset(0); }}>{f.label}</span>
          ))}
          <input className="input input-search" style={{ marginLeft: "auto" }} placeholder="Search URL or title…" value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); }} />
        </div>
      )}
      {isMedia && (
        <div className="filter-row">
          <input className="input input-search" placeholder="Search URL…" value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); }} />
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th onClick={() => toggleSort("url")}>URL</th>
              <th onClick={() => toggleSort("status_code")}>Status</th>
              {!isMedia && <th>Indexability</th>}
              {!isMedia && <th onClick={() => toggleSort("title_len")}>Title</th>}
              {!isMedia && <th onClick={() => toggleSort("word_count")} className="num">Words</th>}
              <th onClick={() => toggleSort("inlinks")} className="num">Inlinks</th>
              <th onClick={() => toggleSort("size")} className="num">Size</th>
              <th onClick={() => toggleSort("response_ms")} className="num">Resp.</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => setDrawer(p.id)}>
                <td>
                  <div className="url-row">
                    {p.resource_type === "image" ? (
                      <img className="thumb" src={p.url} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                    ) : (
                      <span className="faint" style={{ display: "flex" }}><ResourceIcon type={p.resource_type} /></span>
                    )}
                    <span className="url-cell" title={p.url}>{p.url}</span>
                    <ExternalLinkButton url={p.url} />
                  </div>
                </td>
                <td><StatusBadge status={p.status_code} /></td>
                {!isMedia && <td><IndexableBadge indexable={p.indexable} reason={p.indexability_reason} /></td>}
                {!isMedia && <td className="muted" style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title || <span className="faint">missing</span>}</td>}
                {!isMedia && <td className="num mono">{p.word_count ?? "—"}</td>}
                <td className="num mono">{p.inlinks ?? 0}</td>
                <td className="num mono">{p.size ? `${Math.round(p.size / 1024)}KB` : "—"}</td>
                <td className="num mono">{p.response_ms ?? "—"}ms</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={7} className="empty">Nothing here yet</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <span>{total === 0 ? 0 : offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
        <button className="btn btn-sm btn-ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Prev</button>
        <button className="btn btn-sm btn-ghost" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>Next</button>
      </div>
      {drawer && <PageDrawer cid={cid} pageId={drawer} onClose={() => setDrawer(null)} />}
    </div>
  );
}
