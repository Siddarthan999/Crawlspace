import { useEffect, useState } from "react";
import { api } from "../api";
import { StatusBadge, IndexableBadge, SeverityBadge, RenderedBadge } from "./Badges";
import ExternalLinkButton from "./ExternalLinkButton";
import ResourceIcon from "./ResourceIcon";

export default function PageDrawer({ cid, pageId, onClose }: { cid: number; pageId: number; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<"overview" | "links" | "headers" | "issues">("overview");

  useEffect(() => {
    setData(null);
    api.pages.get(cid, pageId).then(setData);
  }, [cid, pageId]);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        {!data ? <div className="empty"><span className="spinner" /></div> : (
          <>
            <div className="drawer-head">
              <div style={{ minWidth: 0 }}>
                <div className="url-row">
                  <span className="faint" style={{ display: "flex" }}><ResourceIcon type={data.resource_type} size={13} /></span>
                  <span className="mono" style={{ fontSize: 14, wordBreak: "break-all", color: "var(--text-dim)" }}>{data.url}</span>
                  <ExternalLinkButton url={data.url} />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <StatusBadge status={data.status_code} />
                  <IndexableBadge indexable={data.indexable} reason={data.indexability_reason} />
                  {data.in_sitemap && <span className="badge badge-neutral">in sitemap</span>}
                  {data.rendered && <RenderedBadge />}
                </div>
              </div>
              <span className="close-x" onClick={onClose}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg></span>
            </div>

            {data.resource_type === "image" && (
              <div className="card card-pad" style={{ marginBottom: 16, textAlign: "center" }}>
                <img src={data.url} alt="" style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 4 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              </div>
            )}

            <div className="tabs">
              {(["overview", "issues", "links", "headers"] as const).map((t) => (
                <div key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
                  {t === "issues" ? `Issues (${data.issues?.length || 0})` : t[0].toUpperCase() + t.slice(1)}
                </div>
              ))}
            </div>

            {tab === "overview" && (
              <dl className="kv-grid">
                <dt>Title</dt><dd>{data.title || <span className="faint">missing</span>} {data.title_len ? <span className="faint">({data.title_len} chars)</span> : null}</dd>
                <dt>Meta description</dt><dd>{data.meta_desc || <span className="faint">missing</span>}</dd>
                <dt>H1</dt><dd>{(data.h1 || []).join(", ") || <span className="faint">missing</span>}</dd>
                <dt>Canonical</dt><dd className="mono" style={{ wordBreak: "break-all" }}>{data.canonical || <span className="faint">missing</span>}</dd>
                <dt>Meta robots</dt><dd>{data.meta_robots || <span className="faint">—</span>}</dd>
                <dt>Word count</dt><dd>{data.word_count ?? "—"}</dd>
                <dt>Depth</dt><dd>{data.depth}</dd>
                <dt>Response time</dt><dd>{data.response_ms} ms</dd>
                <dt>Size</dt><dd>{data.size ? `${Math.round(data.size / 1024)} KB` : "—"}</dd>
                <dt>Content type</dt><dd>{data.content_type}</dd>
                <dt>Inlinks</dt><dd>{data.inlinks}</dd>
                <dt>Outlinks</dt><dd>{data.outlinks} <span className="faint">({data.external_outlinks} external)</span></dd>
                {data.redirect_url && <><dt>Redirects to</dt><dd className="mono">{data.redirect_url}</dd></>}
                {data.error && <><dt>Error</dt><dd style={{ color: "var(--error)" }}>{data.error}</dd></>}
              </dl>
            )}

            {tab === "issues" && (
              <div>
                {(data.issues || []).length === 0 && <div className="faint">No issues on this page.</div>}
                {(data.issues || []).map((i: any) => (
                  <div key={i.id} className="card card-pad" style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{i.check_id}</span>
                      <SeverityBadge severity={i.severity} />
                    </div>
                    <div className="muted" style={{ fontSize: 14 }}>{i.message}</div>
                  </div>
                ))}
              </div>
            )}

            {tab === "links" && (
              <div>
                <div className="section-label">Inlinks ({data.inlinks_list?.length || 0})</div>
                {(data.inlinks_list || []).slice(0, 100).map((l: any, idx: number) => (
                  <div key={idx} style={{ fontSize: 13.5, padding: "6px 0", borderBottom: "1px solid var(--border-soft)" }}>
                    <div className="url-row"><span className="mono url-cell" style={{ maxWidth: "100%" }}>{l.url}</span><ExternalLinkButton url={l.url} /></div>
                    <div className="faint">anchor: {l.anchor || "(none)"} {l.nofollow && "· nofollow"}</div>
                  </div>
                ))}
                <div className="section-label">Outlinks ({data.outlinks_list?.length || 0})</div>
                {(data.outlinks_list || []).slice(0, 100).map((l: any, idx: number) => (
                  <div key={idx} style={{ fontSize: 13.5, padding: "6px 0", borderBottom: "1px solid var(--border-soft)" }}>
                    <div className="url-row"><span className="mono url-cell" style={{ maxWidth: "100%" }}>{l.url}</span>{!l.internal && <span className="faint">external</span>}<ExternalLinkButton url={l.url} /></div>
                    <div className="faint">anchor: {l.anchor || "(none)"} {l.nofollow && "· nofollow"}</div>
                  </div>
                ))}
              </div>
            )}

            {tab === "headers" && (
              <dl className="kv-grid">
                {Object.entries(data.headers || {}).map(([k, v]) => (
                  <div key={k} style={{ display: "contents" }}>
                    <dt className="mono">{k}</dt><dd className="mono">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        )}
      </div>
    </div>
  );
}
