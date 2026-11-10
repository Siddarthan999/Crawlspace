import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Network, Trash2, Clock, CheckCircle2, CircleDashed, AlertTriangle, ExternalLink, Info } from "lucide-react";
import { api } from "../api";
import { HBars } from "../components/charts";
import ExternalLinkButton from "../components/ExternalLinkButton";
import { timeAgo, compact, pathOf } from "../lib/format";

const PAGE = 40;

export default function BacklinksPage() {
  const [params, setParams] = useSearchParams();
  const [target, setTarget] = useState(params.get("target") || "");
  const [providers, setProviders] = useState<any[]>([]);
  const [run, setRun] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const loadHistory = () => api.backlinks.list().then(setHistory);
  const open = (id: number) => api.backlinks.get(id).then((r: any) => { setRun(r); setPage(0); }).catch(() => setRun(null));
  useEffect(() => { api.backlinks.providers().then(setProviders); loadHistory(); const id = params.get("run"); if (id) open(Number(id)); }, []);

  const lookup = async () => {
    if (!target.trim()) return;
    setBusy(true); setError("");
    try { const r = await api.backlinks.create({ target: target.trim() }); setRun(r); setPage(0); setSearch(""); setParams({ run: String(r.id) }, { replace: true }); loadHistory(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const remove = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation(); await api.backlinks.delete(id);
    if (run?.id === id) { setRun(null); setParams({}, { replace: true }); } loadHistory();
  };

  const rows = useMemo(() => {
    const r: any[] = run?.results || [];
    if (!search) return r;
    const q = search.toLowerCase();
    return r.filter((x) => x.source_url.toLowerCase().includes(q) || (x.anchor || "").toLowerCase().includes(q));
  }, [run, search]);

  const s = run?.summary;
  const total = s ? (s.total_reported ?? s.sample_size) : 0;
  const configured = providers.filter((p) => p.configured && p.id !== "local").length;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title"><Network size={19} /> Backlinks</div>
          <div className="page-sub">Who links to a site — using free data sources only.</div>
        </div>
      </div>

      <div className="hint-banner" style={{ marginBottom: 16 }}>
        <Info size={14} />
        <span><b>An honest note on "free":</b> no free API will list the backlinks of <i>any</i> website — that index is what Ahrefs and Majestic charge for. What is genuinely free: links found in <b>your own crawls</b> (always on), real backlink data from <b>Bing Webmaster Tools</b> for sites you've verified there, and an authority score from <b>Open PageRank</b> for any domain. Add keys below to switch them on.</span>
      </div>

      <div className="grid-3">
        {providers.map((p) => (
          <div key={p.id} className={`provider-card ${p.configured ? "on" : ""}`}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
              {p.configured ? <CheckCircle2 size={15} color="var(--ok)" /> : <CircleDashed size={15} color="var(--text-faint)" />} {p.name}
            </div>
            <div className="faint" style={{ fontSize: 12.5, lineHeight: 1.5 }}>{p.description}</div>
            {!p.configured && p.env && (
              <div style={{ marginTop: 10, fontSize: 12.5 }}>Set <span className="code">{p.env}</span> in <span className="code">.env</span>
                {p.setup_url && <> · <a href={p.setup_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent-hover)", textDecoration: "underline" }}>get a key <ExternalLink size={11} style={{ verticalAlign: -1 }} /></a></>}</div>
            )}
          </div>
        ))}
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="qa-row">
          <input className="input qa-input" placeholder="example.com or https://example.com/page" value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lookup()} />
          <button className="btn btn-primary" onClick={lookup} disabled={busy}>{busy ? <span className="spinner" /> : "Look up backlinks"}</button>
        </div>
        {error && <div className="badge badge-error" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {run && s && (
        <div style={{ marginBottom: 26 }}>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="url-row"><span className="mono" style={{ fontSize: 13.5 }}>{run.target}</span><ExternalLinkButton url={run.target} /></div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {Object.entries(run.providers || {}).map(([id, p]: any) => {
                const name = providers.find((x) => x.id === id)?.name || id;
                if (p.ok) return <span key={id} className="badge badge-ok"><CheckCircle2 size={11} /> {name}{id !== "openpagerank" ? ` · ${p.count}` : ""}</span>;
                if (p.error) return <span key={id} className="badge badge-error" title={p.error}><AlertTriangle size={11} /> {name} failed</span>;
                return <span key={id} className="badge badge-neutral"><CircleDashed size={11} /> {name} · not configured</span>;
              })}
            </div>
            {Object.entries(run.providers || {}).filter(([, p]: any) => p.error).map(([id, p]: any) => <div key={id} className="faint" style={{ fontSize: 12.5, marginTop: 8 }}><b>{providers.find((x) => x.id === id)?.name}:</b> {p.error}</div>)}
          </div>

          <div className="kpi-grid">
            <div className="kpi"><div className="kpi-label">Backlinks</div><div className="kpi-value">{compact(total)}</div>
              <div className="kpi-note">{s.total_reported != null && s.total_reported !== s.sample_size ? `${s.sample_size} sampled of ${s.total_reported} reported` : "found"}</div></div>
            <div className="kpi"><div className="kpi-label">Referring domains</div><div className="kpi-value">{s.referring_domains}</div><div className="kpi-note">in the sample</div></div>
            <div className="kpi"><div className="kpi-label">Nofollow</div><div className="kpi-value">{s.nofollow}</div><div className="kpi-note">where rel is known</div></div>
            <div className="kpi"><div className="kpi-label">Domain authority</div>
              <div className="kpi-value">{s.authority?.page_rank != null ? s.authority.page_rank.toFixed(1) : "—"}<span className="faint" style={{ fontSize: 13 }}>/10</span></div>
              <div className="kpi-note">{s.authority?.global_rank ? `global rank #${s.authority.global_rank.toLocaleString()}` : "Open PageRank"}</div></div>
          </div>

          {run.results.length === 0 ? (
            <div className="card empty">
              <div className="empty-title">No backlinks found from the configured sources</div>
              <div style={{ maxWidth: 520, margin: "0 auto" }}>Your own crawls don't link to this target{configured ? ", and the connected providers had nothing for it" : ""}. {!configured && "Add a Bing Webmaster key (for a site you own) to see real backlink data."}</div>
            </div>
          ) : (
            <>
              <div className="grid-2">
                <div className="panel"><div className="panel-head"><div className="panel-title">Top referring domains</div></div>
                  <HBars items={s.top_domains.map((d: any) => ({ label: d.host, value: d.count }))} /></div>
                <div className="panel"><div className="panel-head"><div className="panel-title">Most common anchor text</div></div>
                  {s.top_anchors.length ? <HBars color="var(--notice)" items={s.top_anchors.map((a: any) => ({ label: a.anchor, value: a.count }))} /> : <div className="faint" style={{ fontSize: 13 }}>No anchor text recorded.</div>}</div>
              </div>
              {s.extra?.top_linked_pages?.length > 0 && (
                <div className="panel" style={{ marginTop: 16 }}>
                  <div className="panel-head"><div className="panel-title">Most-linked pages <span className="faint" style={{ fontWeight: 400 }}>(Bing)</span></div></div>
                  <HBars color="var(--ok)" items={s.extra.top_linked_pages.map((p: any) => ({ label: pathOf(p.url), value: p.count }))} />
                </div>
              )}
              <div className="filter-row" style={{ marginTop: 16 }}>
                <input className="input input-search" placeholder="Search source URL or anchor…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
              </div>
              <div className="card">
                <table>
                  <thead><tr><th>Linking page</th><th>Anchor text</th><th>Links to</th><th>Source</th></tr></thead>
                  <tbody>
                    {rows.slice(page * PAGE, page * PAGE + PAGE).map((b, i) => (
                      <tr key={i}>
                        <td style={{ maxWidth: 340 }}><div className="url-row"><span className="url-cell" title={b.source_url}>{b.source_url.replace(/^https?:\/\//, "")}</span><ExternalLinkButton url={b.source_url} /></div></td>
                        <td className="muted" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.anchor || <span className="faint">—</span>}</td>
                        <td className="url-cell" style={{ maxWidth: 220 }}>{pathOf(b.target_url)}</td>
                        <td><span className="badge badge-neutral">{b.provider}</span>{b.nofollow && <span className="badge badge-accent" style={{ marginLeft: 5 }}>nofollow</span>}</td>
                      </tr>
                    ))}
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

      <div className="section-label">Recent lookups</div>
      {history.length === 0 ? <div className="card empty"><div className="empty-title">No lookups yet</div></div> : (
        <div className="card">
          <table>
            <thead><tr><th>Target</th><th className="num">Backlinks</th><th className="num">Domains</th><th>When</th><th></th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} style={{ cursor: "pointer" }} onClick={() => { setParams({ run: String(h.id) }, { replace: true }); open(h.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                  <td className="url-cell" style={{ maxWidth: 380 }}>{h.target}</td>
                  <td className="num mono">{h.summary?.total_reported ?? h.summary?.sample_size ?? "—"}</td>
                  <td className="num mono">{h.summary?.referring_domains ?? "—"}</td>
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
