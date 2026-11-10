import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, RotateCw, GitCompare, Trash2 } from "lucide-react";
import { api } from "../api";
import NewCrawlModal from "./NewCrawlModal";
import { CrawlStatusBadge } from "./Badges";
import { fmtDateTime } from "../lib/format";

export default function CrawlHistory({ domainId, host, onChanged }: { domainId: number | null; host: string; onChanged?: () => void }) {
  const nav = useNavigate();
  const [crawls, setCrawls] = useState<any[]>([]);
  const [loading, setLoading] = useState(!!domainId);
  const [modalOpen, setModalOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [compareSel, setCompareSel] = useState<number[]>([]);

  const load = () => {
    if (!domainId) { setLoading(false); return; }
    setLoading(true);
    api.crawls.list({ domain_id: domainId, date_from: dateFrom || undefined, date_to: dateTo || undefined, status: statusFilter || undefined, limit: 100 })
      .then((c: any) => setCrawls(c.items)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [domainId, dateFrom, dateTo, statusFilter]);

  const toggleSel = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleCompare = (id: number) => setCompareSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 2 ? [...s, id] : [s[1], id]));
  const bulkDelete = async () => {
    if (!selected.length || !confirm(`Delete ${selected.length} crawl(s)? This can't be undone.`)) return;
    await api.crawls.bulkDelete(selected);
    setSelected([]); load(); onChanged?.();
  };
  const rerun = async (id: number) => { const r = await api.crawls.rerun(id); nav(`/crawls/${r.id}`); };

  return (
    <div>
      <div className="filter-row">
        <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <span className="faint">to</span>
        <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {["completed", "running", "queued", "paused", "stopped", "failed"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {(dateFrom || dateTo || statusFilter) && <button className="btn btn-sm btn-ghost" onClick={() => { setDateFrom(""); setDateTo(""); setStatusFilter(""); }}>Clear</button>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {compareSel.length === 2 && <button className="btn" onClick={() => nav(`/compare?a=${compareSel[0]}&b=${compareSel[1]}`)}><GitCompare size={14} /> Compare</button>}
          {selected.length > 0 && <button className="btn btn-danger" onClick={bulkDelete}><Trash2 size={14} /> Delete {selected.length}</button>}
          <button className="btn btn-primary" onClick={() => setModalOpen(true)}><Plus size={14} /> New crawl</button>
        </div>
      </div>

      {loading ? <div className="empty"><span className="spinner" /></div> : crawls.length === 0 ? (
        <div className="card empty">
          <div className="empty-title">{domainId ? "No crawls match these filters" : `${host} hasn't been crawled yet`}</div>
          {!domainId && <div style={{ marginBottom: 14 }}>Run a crawl to get issues, a health score and the site-structure tree.</div>}
          {!domainId && <button className="btn btn-primary" style={{ margin: "0 auto" }} onClick={() => setModalOpen(true)}><Plus size={14} /> Crawl {host}</button>}
        </div>
      ) : (
        <div className="card">
          <table>
            <thead><tr><th style={{ width: 28 }}></th><th style={{ width: 40 }}>Cmp</th><th>Started</th><th>Status</th><th className="num">Pages</th><th className="num">Errors</th><th className="num">Warnings</th><th>Health</th><th>Note</th><th></th></tr></thead>
            <tbody>
              {crawls.map((c) => (
                <tr key={c.id}>
                  <td><input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleSel(c.id)} /></td>
                  <td><input type="checkbox" checked={compareSel.includes(c.id)} onChange={() => toggleCompare(c.id)} /></td>
                  <td className="muted" style={{ cursor: "pointer" }} onClick={() => nav(`/crawls/${c.id}`)}>{fmtDateTime(c.created_at)}</td>
                  <td><CrawlStatusBadge status={c.status} /></td>
                  <td className="num mono">{c.stats?.total_pages ?? "—"}</td>
                  <td className="num mono">{c.stats?.issues_by_severity?.error ?? 0}</td>
                  <td className="num mono">{c.stats?.issues_by_severity?.warning ?? 0}</td>
                  <td className="mono">{c.health_score ?? "—"}</td>
                  <td className="faint">{c.note || "—"}</td>
                  <td><div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => nav(`/crawls/${c.id}`)}>Open</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => rerun(c.id)}><RotateCw size={12} /> Re-run</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modalOpen && <NewCrawlModal initialSeed={`https://${host}`} onClose={() => setModalOpen(false)} onCreated={(id) => { setModalOpen(false); nav(`/crawls/${id}`); }} />}
    </div>
  );
}
