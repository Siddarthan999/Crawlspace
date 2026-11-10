import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { HealthRing } from "../components/HealthRing";

export default function ComparePage() {
  const [params] = useSearchParams();
  const a = Number(params.get("a"));
  const b = Number(params.get("b"));
  const [data, setData] = useState<any>(null);

  useEffect(() => { if (a && b) api.compare(a, b).then(setData); }, [a, b]);

  if (!a || !b) return <div className="empty">Pick two crawls from a domain page to compare.</div>;
  if (!data) return <div className="empty"><span className="spinner" /></div>;

  const { diff } = data;
  return (
    <div>
      <div className="page-title" style={{ marginBottom: 4 }}>Compare crawls</div>
      <div className="page-sub" style={{ marginBottom: 20 }}>#{a} vs #{b}</div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        {[data.a, data.b].map((c: any, i: number) => (
          <div className="card card-pad" key={i} style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <HealthRing score={c.health_score} />
            <div>
              <div style={{ fontWeight: 600 }}>Crawl #{c.id}</div>
              <div className="faint">{new Date(c.created_at + "Z").toLocaleString()}</div>
              <div className="muted" style={{ marginTop: 4 }}>{c.stats?.total_pages ?? 0} pages · {c.stats?.issues_total ?? 0} issues</div>
            </div>
          </div>
        ))}
      </div>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card"><div className="stat-label">New issues</div><div className="stat-value mono" style={{ color: "var(--error)" }}>{diff.new_count}</div></div>
        <div className="stat-card"><div className="stat-label">Fixed issues</div><div className="stat-value mono" style={{ color: "var(--ok)" }}>{diff.fixed_count}</div></div>
        <div className="stat-card"><div className="stat-label">Persisting</div><div className="stat-value mono">{diff.persisting_count}</div></div>
      </div>

      <div className="grid-2">
        <div className="card card-pad">
          <div className="stat-label" style={{ marginBottom: 10 }}>New, by check</div>
          {Object.entries(diff.new_by_check || {}).length === 0 && <div className="faint">None</div>}
          {Object.entries(diff.new_by_check || {}).map(([k, urls]: any) => (
            <div key={k} style={{ padding: "6px 0", borderBottom: "1px solid var(--border-soft)" }}>
              <span className="mono">{k}</span> <span className="faint">× {urls.length}</span>
            </div>
          ))}
        </div>
        <div className="card card-pad">
          <div className="stat-label" style={{ marginBottom: 10 }}>Fixed, by check</div>
          {Object.entries(diff.fixed_by_check || {}).length === 0 && <div className="faint">None</div>}
          {Object.entries(diff.fixed_by_check || {}).map(([k, urls]: any) => (
            <div key={k} style={{ padding: "6px 0", borderBottom: "1px solid var(--border-soft)" }}>
              <span className="mono">{k}</span> <span className="faint">× {urls.length}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
