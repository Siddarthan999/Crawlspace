import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Link2Off, Download, Trash2, ArrowRight, Clock } from "lucide-react";
import { api } from "../api";
import { Donut } from "../components/charts";
import ExternalLinkButton from "../components/ExternalLinkButton";
import { timeAgo, pathOf } from "../lib/format";

const STATE_RANK: Record<string, number> = { broken: 0, restricted: 1, redirect: 2, ok: 3 };
const STATE_LABEL: Record<string, string> = { broken: "Broken", restricted: "Restricted", redirect: "Redirect", ok: "OK" };
const PAGE = 50;

export default function OutlinksPage() {
  const [params, setParams] = useSearchParams();
  const [url, setUrl] = useState(params.get("url") || "");
  const [includeInternal, setIncludeInternal] = useState(true);
  const [maxLinks, setMaxLinks] = useState(500);
  const [run, setRun] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [scope, setScope] = useState<"all" | "external" | "internal">("all");
  const [nofollowOnly, setNofollowOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"problems" | "url" | "slowest" | "uses">("problems");
  const [page, setPage] = useState(0);
  const pollRef = useRef<any>(null);

  const loadHistory = () => api.outlinks.list().then(setHistory);
  const open = (id: number) => api.outlinks.get(id).then((r: any) => { setRun(r); setPage(0); }).catch(() => setRun(null));

  useEffect(() => { loadHistory(); const id = params.get("run"); if (id) open(Number(id)); }, []);
  useEffect(() => {
    clearInterval(pollRef.current);
    if (run?.status === "running") {
      pollRef.current = setInterval(async () => {
        const r = await api.outlinks.get(run.id); setRun(r);
        if (r.status !== "running") { clearInterval(pollRef.current); loadHistory(); }
      }, 1200);
    }
    return () => clearInterval(pollRef.current);
  }, [run?.id, run?.status]);

  const start = async () => {
    if (!url.trim()) return;
    setError("");
    try {
      const r = await api.outlinks.create({ url: url.trim(), include_internal: includeInternal, max_links: maxLinks });
      setRun({ ...r, results: [] }); setParams({ run: String(r.id) }, { replace: true });
      setStateFilter("all"); setScope("all"); setNofollowOnly(false); setSearch(""); setPage(0);
    } catch (e: any) { setError(e.message); }
  };
  const remove = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    await api.outlinks.delete(id);
    if (run?.id === id) { setRun(null); setParams({}, { replace: true }); }
    loadHistory();
  };

  const rows = useMemo(() => {
    let r: any[] = run?.results || [];
    if (stateFilter !== "all") r = r.filter((x) => x.state === stateFilter);
    if (scope !== "all") r = r.filter((x) => (scope === "internal") === x.internal);
    if (nofollowOnly) r = r.filter((x) => x.nofollow || x.sponsored || x.ugc);
    if (search) { const q = search.toLowerCase(); r = r.filter((x) => x.url.toLowerCase().includes(q) || (x.anchors || []).some((a: string) => a.toLowerCase().includes(q))); }
    const by: Record<string, (a: any, b: any) => number> = {
      problems: (a, b) => (STATE_RANK[a.state] ?? 9) - (STATE_RANK[b.state] ?? 9),
      url: (a, b) => a.url.localeCompare(b.url),
      slowest: (a, b) => (b.ms || 0) - (a.ms || 0),
      uses: (a, b) => b.occurrences - a.occurrences,
    };
    return [...r].sort(by[sort]);
  }, [run, stateFilter, scope, nofollowOnly, search, sort]);

  const s = run?.summary;
  const running = run?.status === "running";
  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title"><Link2Off size={19} /> Outgoing links</div>
          <div className="page-sub">Paste any page and every link on it is checked — broken, redirecting, nofollow, internal or external.</div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="qa-row">
          <input className="input qa-input" placeholder="https://example.com/some-page" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && start()} />
          <button className="btn btn-primary" onClick={start} disabled={running}>{running ? <span className="spinner" /> : "Scan links"}</button>
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label className="checkbox-row" style={{ fontSize: 13 }}><input type="checkbox" checked={includeInternal} onChange={(e) => setIncludeInternal(e.target.checked)} /> Include internal links</label>
          <label className="checkbox-row" style={{ fontSize: 13 }}>Check up to
            <select className="select" style={{ padding: "3px 8px" }} value={maxLinks} onChange={(e) => setMaxLinks(+e.target.value)}>{[100, 250, 500, 1000, 2000].map((n) => <option key={n} value={n}>{n}</option>)}</select> unique links</label>
        </div>
        {error && <div className="badge badge-error" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {run && (
        <div style={{ marginBottom: 26 }}>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="url-row" style={{ marginBottom: 4 }}>
              <span className="mono" style={{ fontSize: 13.5, wordBreak: "break-all" }}>{run.url}</span><ExternalLinkButton url={run.url} />
            </div>
            <div className="faint" style={{ fontSize: 13 }}>{s?.page_title || (running ? "Fetching page…" : "")}{s?.page_status ? ` · HTTP ${s.page_status}` : ""} · {timeAgo(run.created_at)}</div>
            {running && (
              <div style={{ marginTop: 12 }}>
                <div className="progress-line"><div style={{ width: run.total ? `${(run.checked / run.total) * 100}%` : "6%" }} /></div>
                <div className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>{run.total ? `Checked ${run.checked} of ${run.total} links…` : "Reading the page…"}</div>
              </div>
            )}
            {run.status === "failed" && <div className="quota-error" style={{ marginTop: 12 }}><div className="quota-error-head">Couldn't scan this page</div><p style={{ margin: 0 }}>{run.error}</p></div>}
          </div>

          {run.status === "completed" && s && (
            <>
              <div className="grid-21">
                <div className="kpi-grid" style={{ marginBottom: 0, alignContent: "start" }}>
                  <div className="kpi"><div className="kpi-label">Unique links</div><div className="kpi-value">{s.total}</div><div className="kpi-note">{s.internal} internal · {s.external} external{s.truncated ? ` · capped (${s.found} found)` : ""}</div></div>
                  <div className="kpi"><div className="kpi-label">Broken</div><div className="kpi-value" style={{ color: s.broken ? "var(--error)" : undefined }}>{s.broken}</div><div className="kpi-note">4xx, 5xx or no response</div></div>
                  <div className="kpi"><div className="kpi-label">Redirects</div><div className="kpi-value">{s.redirect}</div><div className="kpi-note">point to the old URL</div></div>
                  <div className="kpi"><div className="kpi-label">Restricted</div><div className="kpi-value">{s.restricted}</div><div className="kpi-note">blocked us (403, 429…)</div></div>
                  <div className="kpi"><div className="kpi-label">Nofollow / sponsored</div><div className="kpi-value">{s.nofollow + s.sponsored + s.ugc}</div><div className="kpi-note">rel attributes</div></div>
                  <div className="kpi"><div className="kpi-label">Avg response</div><div className="kpi-value">{s.avg_ms ?? "—"}<span className="faint" style={{ fontSize: 13 }}>ms</span></div></div>
                </div>
                <div className="panel">
                  <div className="panel-head"><div className="panel-title">Link health</div></div>
                  <Donut size={132} center={{ value: String(s.total), label: "links" }} segments={[
                    { label: "OK", value: s.ok, color: "var(--ok)" }, { label: "Redirect", value: s.redirect, color: "var(--notice)" },
                    { label: "Restricted", value: s.restricted, color: "var(--warning)" }, { label: "Broken", value: s.broken, color: "var(--error)" }]} />
                </div>
              </div>

              <div className="filter-row" style={{ marginTop: 16 }}>
                {["all", "broken", "redirect", "restricted", "ok"].map((f) => (
                  <span key={f} className={`chip ${stateFilter === f ? "active" : ""}`} onClick={() => { setStateFilter(f); setPage(0); }}>
                    {f === "all" ? "All" : STATE_LABEL[f]} <span className="chip-count">{f === "all" ? s.total : s[f]}</span></span>
                ))}
                <div className="strategy-toggle" style={{ marginLeft: 8 }}>
                  {(["all", "external", "internal"] as const).map((k) => <button key={k} className={scope === k ? "active" : ""} onClick={() => { setScope(k); setPage(0); }}>{k[0].toUpperCase() + k.slice(1)}</button>)}
                </div>
                <span className={`chip ${nofollowOnly ? "active" : ""}`} onClick={() => { setNofollowOnly(!nofollowOnly); setPage(0); }}>rel: nofollow / sponsored / ugc</span>
              </div>
              <div className="filter-row">
                <input className="input input-search" placeholder="Search URL or anchor text…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
                <select className="select" value={sort} onChange={(e) => setSort(e.target.value as any)}>
                  <option value="problems">Sort: problems first</option><option value="url">Sort: URL</option><option value="slowest">Sort: slowest</option><option value="uses">Sort: most used</option>
                </select>
                <a className="btn" style={{ marginLeft: "auto" }} href={api.outlinks.exportUrl(run.id)}><Download size={14} /> CSV</a>
              </div>

              <div className="card">
                <table>
                  <thead><tr><th>Link</th><th>Type</th><th>Result</th><th>Lands on</th><th className="num">Uses</th><th className="num">Resp.</th></tr></thead>
                  <tbody>
                    {pageRows.map((x) => (
                      <tr key={x.url}>
                        <td style={{ maxWidth: 380 }}>
                          <div className="url-row"><span className="url-cell" title={x.url}>{x.internal ? pathOf(x.url) : x.url.replace(/^https?:\/\//, "")}</span><ExternalLinkButton url={x.url} /></div>
                          {x.anchors?.length > 0 && <div className="faint" style={{ fontSize: 12.5, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>“{x.anchors[0]}”{x.anchors.length > 1 ? ` +${x.anchors.length - 1}` : ""}</div>}
                        </td>
                        <td><div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          <span className="badge badge-neutral">{x.internal ? "internal" : "external"}</span>
                          {x.rel?.map((r: string) => <span key={r} className="badge badge-accent">{r}</span>)}
                        </div></td>
                        <td><span className={`state ${x.state}`}>{x.status ? x.status : "—"} · {STATE_LABEL[x.state]}</span>{x.error && <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>{x.error}</div>}</td>
                        <td style={{ maxWidth: 240 }}>{x.redirects > 0 ? <div className="url-cell" title={(x.chain || []).join("\n")} style={{ maxWidth: 240 }}>{x.redirects} hop{x.redirects > 1 ? "s" : ""} <ArrowRight size={11} style={{ verticalAlign: -1 }} /> {pathOf(x.final_url || "")}</div> : <span className="faint">—</span>}</td>
                        <td className="num mono">{x.occurrences}</td>
                        <td className="num mono">{x.ms != null ? `${x.ms}ms` : "—"}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && <tr><td colSpan={6} className="faint" style={{ textAlign: "center", padding: 28 }}>No links match these filters</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="pagination">
                <span>{rows.length === 0 ? 0 : page * PAGE + 1}–{Math.min((page + 1) * PAGE, rows.length)} of {rows.length}</span>
                <button className="btn btn-sm btn-ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</button>
                <button className="btn btn-sm btn-ghost" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="section-label">Recent scans</div>
      {history.length === 0 ? <div className="card empty"><div className="empty-title">No scans yet</div></div> : (
        <div className="card">
          <table>
            <thead><tr><th>Page</th><th className="num">Links</th><th className="num">Broken</th><th className="num">Redirects</th><th>Status</th><th>When</th><th></th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} style={{ cursor: "pointer" }} onClick={() => { setParams({ run: String(h.id) }, { replace: true }); open(h.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                  <td className="url-cell" style={{ maxWidth: 360 }}>{h.url}</td>
                  <td className="num mono">{h.summary?.total ?? h.total ?? "—"}</td>
                  <td className="num mono" style={{ color: h.summary?.broken ? "var(--error)" : undefined }}>{h.summary?.broken ?? "—"}</td>
                  <td className="num mono">{h.summary?.redirect ?? "—"}</td>
                  <td><span className={`badge ${h.status === "completed" ? "badge-ok" : h.status === "failed" ? "badge-error" : "badge-notice"}`}>{h.status}</span></td>
                  <td className="faint"><Clock size={11} style={{ verticalAlign: -1, marginRight: 4 }} />{timeAgo(h.created_at)}</td>
                  <td><button className="icon-btn" onClick={(e) => remove(e, h.id)}><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
