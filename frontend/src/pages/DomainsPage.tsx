import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Globe2, FileWarning, Files, Plus, Trash2, RotateCw, LayoutGrid, List } from "lucide-react";
import { api } from "../api";
import NewCrawlModal from "../components/NewCrawlModal";
import { HealthRing } from "../components/HealthRing";
import { CrawlStatusBadge } from "../components/Badges";
import Sparkline from "../components/Sparkline";

function timeAgo(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function DomainsPage() {
  const [domains, setDomains] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "table">("grid");
  const nav = useNavigate();

  const load = () => {
    setLoading(true);
    api.domains.list().then(setDomains).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = domains.filter((d) => d.host.toLowerCase().includes(search.toLowerCase()));
  const totalIssues = domains.reduce((n, d) => n + (d.last_crawl?.stats?.issues_total || 0), 0);
  const totalPages = domains.reduce((n, d) => n + (d.last_crawl?.stats?.total_pages || 0), 0);

  const deleteDomain = async (e: React.MouseEvent, id: number, host: string) => {
    e.stopPropagation();
    if (!confirm(`Delete ${host} and all its crawl history? This can't be undone.`)) return;
    await api.domains.delete(id);
    load();
  };
  const rescan = (e: React.MouseEvent) => { e.stopPropagation(); setModalOpen(true); };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Domains</div>
          <div className="page-sub">
            {domains.length} domain{domains.length === 1 ? "" : "s"} tracked
            {domains.length > 0 && <> · {totalPages} pages crawled · {totalIssues} open issues</>}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}><Plus size={14} /> New crawl</button>
      </div>

      {domains.length > 0 && (
        <div className="filter-row">
          <input className="input input-search" placeholder="Search domains…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div style={{ marginLeft: "auto", display: "flex", gap: 2, background: "var(--panel-alt)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 2 }}>
            <button className={`icon-btn ${view === "grid" ? "view-active" : ""}`} onClick={() => setView("grid")} title="Grid view"><LayoutGrid size={14} /></button>
            <button className={`icon-btn ${view === "table" ? "view-active" : ""}`} onClick={() => setView("table")} title="Table view"><List size={14} /></button>
          </div>
        </div>
      )}

      {loading && <div className="empty"><span className="spinner" /></div>}

      {!loading && domains.length === 0 && (
        <div className="card empty">
          <Globe2 size={28} />
          <div className="empty-title">No domains scanned yet</div>
          <div style={{ marginBottom: 16 }}>Paste a URL to run your first crawl.</div>
          <button className="btn btn-primary" onClick={() => setModalOpen(true)} style={{ margin: "0 auto" }}><Plus size={14} /> New crawl</button>
        </div>
      )}

      {!loading && filtered.length > 0 && view === "grid" && (
        <div className="domain-grid">
          {filtered.map((d) => {
            const lc = d.last_crawl;
            const sev = lc?.stats?.issues_by_severity || {};
            return (
              <div key={d.id} className="domain-card card card-hover" onClick={() => nav(`/sites/${d.host}`)}>
                <div className="domain-card-top">
                  <div style={{ minWidth: 0 }}>
                    <div className="domain-card-host">
                      {d.is_running && <span className="health-dot pulse" style={{ background: "var(--accent)" }} />}
                      {d.host}
                    </div>
                    <div className="faint" style={{ fontSize: 13, marginTop: 2 }}>
                      {d.crawl_count} crawl{d.crawl_count === 1 ? "" : "s"} · last {lc ? timeAgo(lc.created_at) : "never"}
                    </div>
                  </div>
                  <HealthRing score={lc?.health_score} />
                </div>

                <div className="domain-card-stats">
                  <div><Files size={12} className="faint" /> <span className="mono">{lc?.stats?.total_pages ?? "—"}</span> pages</div>
                  <div><FileWarning size={12} className="faint" /> <span className="mono">{lc?.stats?.issues_total ?? "—"}</span> issues</div>
                </div>

                {sev.error > 0 || sev.warning > 0 ? (
                  <div className="domain-card-sev">
                    {sev.error > 0 && <span className="badge badge-error">{sev.error} err</span>}
                    {sev.warning > 0 && <span className="badge badge-warning">{sev.warning} warn</span>}
                    {sev.notice > 0 && <span className="badge badge-notice">{sev.notice} notice</span>}
                  </div>
                ) : lc ? <div className="domain-card-sev"><span className="badge badge-ok">clean</span></div> : null}

                <div className="domain-card-bottom">
                  <Sparkline values={d.recent_scores || []} />
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="icon-btn" title="Re-scan" onClick={rescan}><RotateCw size={13} /></button>
                    <button className="icon-btn" title="Delete" onClick={(e) => deleteDomain(e, d.id, d.host)}><Trash2 size={13} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && filtered.length > 0 && view === "table" && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Domain</th><th>Last crawl</th><th>Status</th>
                <th className="num">Pages</th><th className="num">Issues</th><th>Health</th><th>Trend</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const lc = d.last_crawl;
                return (
                  <tr key={d.id} style={{ cursor: "pointer" }} onClick={() => nav(`/sites/${d.host}`)}>
                    <td><span style={{ fontWeight: 600 }}>{d.host}</span> <span className="faint">· {d.crawl_count}</span></td>
                    <td className="muted">{lc ? timeAgo(lc.created_at) : "never"}</td>
                    <td>{lc ? <CrawlStatusBadge status={lc.status} /> : "—"}</td>
                    <td className="num mono">{lc?.stats?.total_pages ?? "—"}</td>
                    <td className="num mono">{lc?.stats?.issues_total ?? "—"}</td>
                    <td>{lc?.health_score != null ? <span className="mono" style={{ fontWeight: 600 }}>{lc.health_score}</span> : "—"}</td>
                    <td><Sparkline values={d.recent_scores || []} width={56} height={18} /></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-sm btn-ghost" onClick={() => setModalOpen(true)}>Re-scan</button>
                      <button className="btn btn-sm btn-danger" style={{ marginLeft: 6 }} onClick={(e) => deleteDomain(e, d.id, d.host)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <NewCrawlModal onClose={() => setModalOpen(false)} onCreated={(id) => { setModalOpen(false); nav(`/crawls/${id}`); }} />
      )}
    </div>
  );
}
