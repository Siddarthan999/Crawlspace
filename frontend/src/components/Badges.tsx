export function SeverityBadge({ severity }: { severity: string }) {
  const cls = severity === "error" ? "badge-error" : severity === "warning" ? "badge-warning" : "badge-notice";
  return <span className={`badge ${cls}`}><span className={`dot dot-${severity === "notice" ? "notice" : severity}`} />{severity}</span>;
}

export function StatusBadge({ status }: { status?: number | null }) {
  if (!status) return <span className="badge badge-error">no response</span>;
  let cls = "badge-ok";
  if (status >= 500) cls = "badge-error";
  else if (status >= 400) cls = "badge-error";
  else if (status >= 300) cls = "badge-warning";
  return <span className={`badge ${cls}`}>{status}</span>;
}

export function CrawlStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "badge-ok", running: "badge-notice", queued: "badge-neutral",
    paused: "badge-warning", pausing: "badge-warning", stopping: "badge-warning",
    stopped: "badge-neutral", analyzing: "badge-notice", failed: "badge-error",
  };
  const dot: Record<string, string> = { running: "dot-run", analyzing: "dot-run" };
  return (
    <span className={`badge ${map[status] || "badge-neutral"}`}>
      <span className={`dot ${dot[status] || ""}`} style={!dot[status] ? { display: "none" } : {}} />
      {status}
    </span>
  );
}

export function IndexableBadge({ indexable, reason }: { indexable?: boolean | null; reason?: string | null }) {
  if (indexable) return <span className="badge badge-ok">indexable</span>;
  return <span className="badge badge-warning" title={reason || ""}>{reason || "non-indexable"}</span>;
}

export function RenderedBadge() {
  return <span className="badge badge-accent" title="Fetched through headless Chromium (JS rendered)">JS rendered</span>;
}
