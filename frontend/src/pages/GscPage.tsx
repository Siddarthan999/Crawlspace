import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search as SearchIcon, LogIn, LogOut, CheckCircle2, AlertTriangle, XCircle, ExternalLink, ShieldCheck } from "lucide-react";
import { api } from "../api";
import GscReport from "../components/GscReport";
import ExternalLinkButton from "../components/ExternalLinkButton";
import { compact, fmtDateTime, pathOf } from "../lib/format";

function SetupGuide({ status }: { status: any }) {
  return (
    <div className="panel" style={{ maxWidth: 780 }}>
      <div className="panel-head"><div><div className="panel-title"><ShieldCheck size={16} /> Connect Google Search Console</div>
        <div className="panel-sub">One-time setup (~5 minutes). Crawlspace only ever requests read-only access.</div></div></div>
      <ol className="steps">
        <li><span>In <a className="code" href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">Google Cloud Console</a>, create a project (or pick an existing one) and enable the <b>Google Search Console API</b> under <i>APIs &amp; Services → Library</i>.</span></li>
        <li><span>Open <i>APIs &amp; Services → OAuth consent screen</i>. Choose <b>External</b>, fill in the app name and your email, and under <i>Test users</i> add the Google account that owns your Search Console properties.</span></li>
        <li><span>Open <i>Credentials → Create credentials → OAuth client ID</i>, type <b>Web application</b>. Under <i>Authorized redirect URIs</i> add exactly: <span className="code">{status?.redirect_uri}</span></span></li>
        <li><span>Copy the <b>Client ID</b> and <b>Client secret</b> into your <span className="code">.env</span> file as <span className="code">GSC_CLIENT_ID</span> and <span className="code">GSC_CLIENT_SECRET</span>, then run <span className="code">docker compose up -d</span> to apply them.</span></li>
        <li><span>Come back here and click <b>Connect Google account</b>.</span></li>
      </ol>
      <div className="hint-banner" style={{ marginTop: 18 }}>
        <AlertTriangle size={14} />
        <span>While the OAuth app is in <b>Testing</b> status, Google expires the login every 7 days and you'll be asked to reconnect. Publishing the app (OAuth consent screen → <i>Publish app</i>) removes that — you don't need Google's verification for personal use, you'll just see an "unverified app" warning once.</span>
      </div>
    </div>
  );
}

function Inspector({ siteUrl }: { siteUrl: string }) {
  const [url, setUrl] = useState(siteUrl.startsWith("sc-domain:") ? `https://${siteUrl.slice(10)}/` : siteUrl);
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sitemaps, setSitemaps] = useState<any[] | null>(null);
  useEffect(() => { setRes(null); setSitemaps(null); api.gsc.sitemaps(siteUrl).then(setSitemaps).catch(() => setSitemaps([])); }, [siteUrl]);

  const run = async () => {
    setBusy(true); setErr(""); setRes(null);
    try { setRes(await api.gsc.inspect(siteUrl, url.trim())); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const verdictIcon = res?.verdict === "PASS" ? <CheckCircle2 size={16} color="var(--ok)" /> : res?.verdict === "FAIL" ? <XCircle size={16} color="var(--error)" /> : <AlertTriangle size={16} color="var(--warning)" />;
  const row = (k: string, v: any) => v ? <><dt>{k}</dt><dd>{v}</dd></> : null;

  return (
    <div className="grid-21">
      <div className="panel">
        <div className="panel-head"><div><div className="panel-title"><SearchIcon size={15} /> URL inspection</div><div className="panel-sub">Ask Google whether a specific page is indexed, and which canonical it chose.</div></div></div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input className="input" style={{ flex: 1, fontFamily: "var(--mono)" }} value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="https://example.com/page" />
          <button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? <span className="spinner" /> : "Inspect"}</button>
        </div>
        {err && <div className="badge badge-error">{err}</div>}
        {res && (
          <div>
            <div className="verdict" style={{ marginBottom: 12 }}>{verdictIcon}<span>{res.coverage_state || res.verdict || "Unknown"}</span></div>
            <dl className="kv-grid">
              {row("Verdict", res.verdict)}{row("Indexing", res.indexing_state)}{row("robots.txt", res.robots_txt_state)}
              {row("Page fetch", res.page_fetch_state)}{row("Last crawled", res.last_crawl_time && fmtDateTime(res.last_crawl_time))}{row("Crawled as", res.crawled_as)}
              {row("Google canonical", res.google_canonical && <span className="mono" style={{ fontSize: 12.5 }}>{res.google_canonical}</span>)}
              {row("Your canonical", res.user_canonical && <span className="mono" style={{ fontSize: 12.5 }}>{res.user_canonical}</span>)}
              {row("Mobile usability", res.mobile_usability)}
            </dl>
            {res.link && <a className="btn btn-sm" style={{ marginTop: 14 }} href={res.link} target="_blank" rel="noreferrer">Open in Search Console <ExternalLink size={12} /></a>}
          </div>
        )}
      </div>
      <div className="panel">
        <div className="panel-head"><div className="panel-title">Submitted sitemaps</div></div>
        {sitemaps === null ? <span className="spinner" /> : sitemaps.length === 0 ? <div className="faint" style={{ fontSize: 13 }}>No sitemaps submitted for this property.</div> : sitemaps.map((s) => (
          <div key={s.path} style={{ padding: "10px 0", borderBottom: "1px solid var(--border-soft)" }}>
            <div className="url-row"><span className="url-cell" title={s.path}>{pathOf(s.path)}</span><ExternalLinkButton url={s.path} /></div>
            <div className="faint" style={{ fontSize: 12.5, marginTop: 3 }}>
              {s.contents.map((c: any) => `${compact(c.indexed)} of ${compact(c.submitted)} ${c.type} indexed`).join(" · ") || "No content stats"}
              {s.errors > 0 && <span style={{ color: "var(--error)" }}> · {s.errors} errors</span>}{s.warnings > 0 && <span style={{ color: "var(--warning)" }}> · {s.warnings} warnings</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FixPriority({ siteUrl }: { siteUrl: string }) {
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(true);
  useEffect(() => { setData(null); setErr(""); api.gsc.priority(siteUrl, 28).then(setData).catch((e: any) => setErr(e.message)); }, [siteUrl]);

  if (err) return <div className="badge badge-error">{err}</div>;
  if (!data) return <div className="empty"><span className="spinner" /></div>;
  if (!data.has_crawl) return (
    <div className="card empty"><div className="empty-title">No crawl of {data.host} yet</div>
      <div style={{ marginBottom: 14 }}>This view joins your Search Console traffic with crawl issues, so it needs a completed crawl of the same site.</div>
      <button className="btn btn-primary" style={{ margin: "0 auto" }} onClick={() => nav(`/sites/${data.host}`)}>Go to {data.host}</button></div>
  );
  const rows = data.rows.filter((r: any) => !onlyIssues || (r.issues.error + r.issues.warning) > 0).sort((a: any, b: any) => b.clicks - a.clicks);
  return (
    <div>
      <div className="filter-row">
        <div className="faint" style={{ fontSize: 13.5 }}>Pages that earn clicks <i>and</i> have problems in your latest crawl — fix the top of this list first.</div>
        <label className="checkbox-row" style={{ marginLeft: "auto", fontSize: 13 }}><input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> Only pages with errors or warnings</label>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Page</th><th className="num">Clicks</th><th className="num">Impr.</th><th className="num">Pos.</th><th>Issues in crawl</th></tr></thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.page} style={{ cursor: r.page_id ? "pointer" : "default" }} onClick={() => r.page_id && nav(`/crawls/${data.crawl_id}?open=${r.page_id}`)}>
                <td style={{ maxWidth: 360 }}><div className="url-row"><span className="url-cell" title={r.page}>{pathOf(r.page)}</span><ExternalLinkButton url={r.page} /></div></td>
                <td className="num mono">{compact(r.clicks)}</td><td className="num mono">{compact(r.impressions)}</td><td className="num mono">{r.position.toFixed(1)}</td>
                <td>{!r.crawled ? <span className="faint">not in latest crawl</span> : (
                  <div style={{ display: "flex", gap: 6 }}>
                    {r.issues.error > 0 && <span className="badge badge-error">{r.issues.error} error{r.issues.error > 1 ? "s" : ""}</span>}
                    {r.issues.warning > 0 && <span className="badge badge-warning">{r.issues.warning} warning{r.issues.warning > 1 ? "s" : ""}</span>}
                    {r.issues.notice > 0 && <span className="badge badge-notice">{r.issues.notice} notice</span>}
                    {r.issues.error + r.issues.warning + r.issues.notice === 0 && <span className="badge badge-ok">clean</span>}
                  </div>)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="faint" style={{ textAlign: "center", padding: 28 }}>Nothing to fix here — none of your top pages have errors or warnings.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function GscPage() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<any>(null);
  const [sites, setSites] = useState<any[]>([]);
  const [site, setSite] = useState(params.get("site") || "");
  const [tab, setTab] = useState<"performance" | "indexing" | "priority">("performance");
  const [error, setError] = useState(params.get("error") || "");
  const [justConnected] = useState(params.get("connected") === "1");

  const refreshStatus = () => api.gsc.status().then(setStatus);
  useEffect(() => { refreshStatus(); if (params.get("connected") || params.get("error")) setParams({}, { replace: true }); }, []);
  useEffect(() => {
    if (!status?.connected) return;
    api.gsc.sites().then((s: any[]) => { setSites(s); if (!site && s.length) setSite((s.find((x) => x.site_url.startsWith("sc-domain:")) || s[0]).site_url); })
      .catch((e: any) => { setError(e.message); refreshStatus(); });
  }, [status?.connected]);

  const connect = async () => { try { const r = await api.gsc.authUrl(); window.location.href = r.url; } catch (e: any) { setError(e.message); } };
  const disconnect = async () => { if (!confirm("Disconnect Google Search Console? You can reconnect any time.")) return; await api.gsc.disconnect(); setSites([]); setSite(""); refreshStatus(); };

  if (!status) return <div className="empty"><span className="spinner" /></div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title"><SearchIcon size={19} /> Search Console</div>
          <div className="page-sub">Real search traffic from Google — clicks, impressions, queries, indexing — alongside your crawl data.</div>
        </div>
        {status.connected && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="badge badge-ok"><span className="dot dot-ok" /> {status.email || "Connected"}</span>
            <button className="btn btn-sm btn-ghost" onClick={disconnect}><LogOut size={13} /> Disconnect</button>
          </div>
        )}
      </div>

      {justConnected && <div className="hint-banner" style={{ marginBottom: 16 }}><CheckCircle2 size={14} /><span>Connected. Pick a property below to see its data.</span></div>}
      {error && <div className="quota-error" style={{ marginBottom: 16 }}><div className="quota-error-head"><AlertTriangle size={15} /> {error}</div></div>}

      {!status.configured && <SetupGuide status={status} />}

      {status.configured && !status.connected && (
        <div className="panel" style={{ maxWidth: 560 }}>
          <div className="panel-title" style={{ marginBottom: 6 }}>Sign in with Google</div>
          <p className="muted" style={{ marginTop: 0, fontSize: 13.5 }}>You'll be asked to grant <b>read-only</b> access to Search Console. Crawlspace never modifies anything in your account.</p>
          <button className="btn btn-primary" onClick={connect}><LogIn size={14} /> Connect Google account</button>
        </div>
      )}

      {status.connected && (
        <>
          <div className="filter-row">
            <select className="select" style={{ minWidth: 280 }} value={site} onChange={(e) => setSite(e.target.value)}>
              {sites.map((s) => <option key={s.site_url} value={s.site_url}>{s.site_url}</option>)}
              {sites.length === 0 && <option value="">No properties found</option>}
            </select>
            <div className="tabs" style={{ marginBottom: 0, marginLeft: 8, borderBottom: "none" }}>
              {([["performance", "Performance"], ["indexing", "Indexing"], ["priority", "Fix priority"]] as const).map(([k, l]) => (
                <div key={k} className={`tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{l}</div>
              ))}
            </div>
          </div>
          {site && tab === "performance" && <GscReport key={site} siteUrl={site} />}
          {site && tab === "indexing" && <Inspector key={site} siteUrl={site} />}
          {site && tab === "priority" && <FixPriority key={site} siteUrl={site} />}
          {!site && sites.length === 0 && <div className="card empty"><div className="empty-title">No Search Console properties on this account</div><div>Add and verify your site at search.google.com/search-console first.</div></div>}
        </>
      )}
    </div>
  );
}
