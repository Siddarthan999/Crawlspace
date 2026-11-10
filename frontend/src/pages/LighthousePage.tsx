import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Gauge, Smartphone, Monitor, Trash2, ExternalLink, Clock, KeyRound, Info } from "lucide-react";
import { api } from "../api";
import { ScoreRing } from "../components/ScoreRing";

const METRICS = [
  { key: "lcp_ms", label: "Largest Contentful Paint", short: "LCP", unit: "s", div: 1000, good: 2500, poor: 4000, fmt: (v: number) => (v / 1000).toFixed(1) },
  { key: "cls", label: "Cumulative Layout Shift", short: "CLS", unit: "", div: 1, good: 0.1, poor: 0.25, fmt: (v: number) => v.toFixed(3) },
  { key: "tbt_ms", label: "Total Blocking Time", short: "TBT", unit: "ms", div: 1, good: 200, poor: 600, fmt: (v: number) => Math.round(v).toString() },
  { key: "fcp_ms", label: "First Contentful Paint", short: "FCP", unit: "s", div: 1000, good: 1800, poor: 3000, fmt: (v: number) => (v / 1000).toFixed(1) },
  { key: "si_ms", label: "Speed Index", short: "SI", unit: "s", div: 1000, good: 3400, poor: 5800, fmt: (v: number) => (v / 1000).toFixed(1) },
];

function metricStatus(raw: number, good: number, poor: number) {
  if (raw <= good) return "good";
  if (raw <= poor) return "needs-improvement";
  return "poor";
}

const STATUS_COLOR: Record<string, string> = { good: "var(--ok)", "needs-improvement": "var(--warning)", poor: "var(--error)" };
const STATUS_LABEL: Record<string, string> = { good: "Good", "needs-improvement": "Needs work", poor: "Poor" };

function MetricCard({ m, value }: { m: typeof METRICS[number]; value: number | null | undefined }) {
  if (value == null) return (
    <div className="card card-pad metric-card">
      <div className="stat-label">{m.short}</div>
      <div className="faint" style={{ fontSize: 13, marginTop: 6 }}>no data</div>
    </div>
  );
  const status = metricStatus(value, m.good, m.poor);
  return (
    <div className="card card-pad metric-card">
      <div className="stat-label">{m.label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
        <span className="mono" style={{ fontSize: 22, fontWeight: 650 }}>{m.fmt(value)}</span>
        <span className="faint" style={{ fontSize: 13.5 }}>{m.unit}</span>
      </div>
      <span className="badge" style={{ marginTop: 8, background: `${STATUS_COLOR[status]}22`, color: STATUS_COLOR[status], borderColor: "transparent" }}>
        {STATUS_LABEL[status]}
      </span>
    </div>
  );
}

export default function LighthousePage() {
  const [params, setParams] = useSearchParams();
  const [url, setUrl] = useState(params.get("url") || "");
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const [current, setCurrent] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const pollRef = useRef<any>(null);

  const loadHistory = () => api.lighthouse.list().then(setHistory);
  useEffect(() => {
    loadHistory(); api.lighthouse.config().then((c: any) => setHasApiKey(c.has_api_key));
    const id = params.get("run"); if (id) api.lighthouse.get(Number(id)).then(setCurrent).catch(() => {});
  }, []);

  useEffect(() => {
    clearInterval(pollRef.current);
    if (current && current.status === "running") {
      pollRef.current = setInterval(async () => {
        const r = await api.lighthouse.get(current.id);
        setCurrent(r);
        if (r.status !== "running") { clearInterval(pollRef.current); loadHistory(); }
      }, 2500);
    }
    return () => clearInterval(pollRef.current);
  }, [current?.id, current?.status]);

  const run = async () => {
    if (!url.trim()) return;
    setError("");
    try {
      const r = await api.lighthouse.create({ url: url.trim(), strategy });
      setCurrent(r); setParams({ run: String(r.id) }, { replace: true });
    } catch (e: any) {
      setError(e.message || "Failed to start audit");
    }
  };

  const openPrev = (run: any) => setCurrent(run);
  const remove = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    await api.lighthouse.delete(id);
    if (current?.id === id) setCurrent(null);
    loadHistory();
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title"><Gauge size={19} /> Lighthouse</div>
          <div className="page-sub">On-demand Core Web Vitals and Lighthouse score for a single URL — powered by Google PageSpeed Insights, no full crawl needed.</div>
        </div>
      </div>

      {hasApiKey === false && (
        <div className="hint-banner" style={{ marginBottom: 16 }}>
          <Info size={14} />
          <span>
            No <code className="mono">PAGESPEED_API_KEY</code> configured — this install shares Google's small
            free quota pool with every other instance of this tool, which can run out quickly.{" "}
            <a href="https://developers.google.com/speed/docs/insights/v5/get-started" target="_blank" rel="noreferrer">
              Get a free key (~2 min)
            </a> and add it as <code className="mono">PAGESPEED_API_KEY</code> in your <code className="mono">.env</code> file.
          </span>
        </div>
      )}

      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="input" style={{ flex: 1, fontFamily: "var(--mono)" }} placeholder="https://example.com/some-page"
            value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />
          <div className="strategy-toggle">
            <button className={strategy === "mobile" ? "active" : ""} onClick={() => setStrategy("mobile")}><Smartphone size={13} /> Mobile</button>
            <button className={strategy === "desktop" ? "active" : ""} onClick={() => setStrategy("desktop")}><Monitor size={13} /> Desktop</button>
          </div>
          <button className="btn btn-primary" onClick={run} disabled={current?.status === "running"}>
            {current?.status === "running" ? <span className="spinner" /> : "Run audit"}
          </button>
        </div>
        {error && <div className="badge badge-error" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {current && (
        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12 }}>
            <div className="url-row" style={{ minWidth: 0 }}>
              <span className="mono url-cell" style={{ maxWidth: 500 }}>{current.url}</span>
              <a className="icon-btn" href={current.url} target="_blank" rel="noreferrer" title="Open in new tab"><ExternalLink size={13} /></a>
              <span className="badge badge-neutral">{current.strategy}</span>
            </div>
            {current.status === "running" && <span className="muted" style={{ fontSize: 14 }}><span className="spinner" style={{ marginRight: 6 }} />Running Lighthouse — this can take 15–30s…</span>}
          </div>

          {current.status === "failed" && (
            current.error_kind === "quota_no_key" || current.error_kind === "quota_with_key" ? (
              <div className="quota-error">
                <div className="quota-error-head">
                  <KeyRound size={15} />
                  <span>{current.error_kind === "quota_no_key" ? "Quota exceeded — no API key set" : "Your API key's quota is exceeded"}</span>
                </div>
                <p>{current.error}</p>
                {current.error_kind === "quota_no_key" ? (
                  <a className="btn btn-primary btn-sm" href="https://developers.google.com/speed/docs/insights/v5/get-started" target="_blank" rel="noreferrer">
                    Get a free PageSpeed API key <ExternalLink size={12} />
                  </a>
                ) : (
                  <a className="btn btn-sm" href="https://console.cloud.google.com/apis/api/pagespeedonline.googleapis.com/quotas" target="_blank" rel="noreferrer">
                    Check quota in Google Cloud Console <ExternalLink size={12} />
                  </a>
                )}
              </div>
            ) : (
              <div className="badge badge-error">{current.error}</div>
            )
          )}

          {current.status === "completed" && (
            <>
              <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 22 }}>
                <ScoreRing score={current.scores?.performance} label="Performance" />
                <ScoreRing score={current.scores?.accessibility} label="Accessibility" />
                <ScoreRing score={current.scores?.best_practices} label="Best Practices" />
                <ScoreRing score={current.scores?.seo} label="SEO" />
              </div>
              <div className="section-label">Core Web Vitals (lab data, this run)</div>
              <div className="metric-grid">
                {METRICS.map((m) => <MetricCard key={m.key} m={m} value={current.metrics?.[m.key]} />)}
              </div>
              {current.field_data && (
                <>
                  <div className="section-label">Real-world field data (last 28 days, Chrome UX Report)</div>
                  <div className="faint" style={{ fontSize: 13.5, marginBottom: 8 }}>
                    Overall: <span style={{ color: STATUS_COLOR[(current.field_data.overall_category || "").toLowerCase().replace("_", "-")] || "var(--text-dim)" }}>{current.field_data.overall_category}</span>
                  </div>
                  <div className="metric-grid">
                    {current.field_data.lcp_ms != null && <MetricCard m={METRICS[0]} value={current.field_data.lcp_ms} />}
                    {current.field_data.cls != null && <MetricCard m={METRICS[1]} value={current.field_data.cls} />}
                    {current.field_data.inp_ms != null && <MetricCard m={{ key: "inp_ms", label: "Interaction to Next Paint", short: "INP", unit: "ms", div: 1, good: 200, poor: 500, fmt: (v: number) => Math.round(v).toString() }} value={current.field_data.inp_ms} />}
                    {current.field_data.fcp_ms != null && <MetricCard m={METRICS[3]} value={current.field_data.fcp_ms} />}
                  </div>
                </>
              )}
              {!current.field_data && (
                <div className="faint" style={{ fontSize: 13.5 }}>No real-world field data available for this URL (Google needs enough Chrome traffic to it).</div>
              )}
            </>
          )}
        </div>
      )}

      <div className="section-label">Recent audits</div>
      {history.length === 0 ? (
        <div className="card empty"><div className="empty-title">No audits yet</div></div>
      ) : (
        <div className="card">
          <table>
            <thead><tr><th>URL</th><th>Device</th><th className="num">Perf</th><th className="num">A11y</th><th className="num">BP</th><th className="num">SEO</th><th>When</th><th></th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} style={{ cursor: "pointer" }} onClick={() => openPrev(h)}>
                  <td className="url-cell" style={{ maxWidth: 320 }}>{h.url}</td>
                  <td className="muted">{h.strategy}</td>
                  <td className="num mono">{h.scores?.performance ?? "—"}</td>
                  <td className="num mono">{h.scores?.accessibility ?? "—"}</td>
                  <td className="num mono">{h.scores?.best_practices ?? "—"}</td>
                  <td className="num mono">{h.scores?.seo ?? "—"}</td>
                  <td className="faint"><Clock size={11} style={{ verticalAlign: -1, marginRight: 4 }} />{new Date(h.created_at + "Z").toLocaleString()}</td>
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
