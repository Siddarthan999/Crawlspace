const BASE = (import.meta as any).env?.VITE_API_URL || "";

async function req(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = j.detail || JSON.stringify(j); } catch {}
    throw new Error(msg);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.blob();
}

const qs = (params: Record<string, any>) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const api = {
  domains: {
    list: () => req("/api/domains"),
    get: (id: number) => req(`/api/domains/${id}`),
    delete: (id: number) => req(`/api/domains/${id}`, { method: "DELETE" }),
    running: () => req("/api/domains/running"),
  },
  search: (q: string) => req(`/api/search${qs({ q })}`),
  crawls: {
    list: (params: any = {}) => req(`/api/crawls${qs(params)}`),
    get: (id: number) => req(`/api/crawls/${id}`),
    create: (body: any) => req("/api/crawls", { method: "POST", body: JSON.stringify(body) }),
    patch: (id: number, body: any) => req(`/api/crawls/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    pause: (id: number) => req(`/api/crawls/${id}/pause`, { method: "POST" }),
    resume: (id: number) => req(`/api/crawls/${id}/resume`, { method: "POST" }),
    stop: (id: number) => req(`/api/crawls/${id}/stop`, { method: "POST" }),
    rerun: (id: number) => req(`/api/crawls/${id}/rerun`, { method: "POST" }),
    reanalyze: (id: number, checks_config: any = {}) =>
      req(`/api/crawls/${id}/reanalyze`, { method: "POST", body: JSON.stringify({ checks_config }) }),
    delete: (id: number) => req(`/api/crawls/${id}`, { method: "DELETE" }),
    bulkDelete: (ids: number[]) => req("/api/crawls/bulk-delete", { method: "POST", body: JSON.stringify(ids) }),
  },
  pages: {
    list: (cid: number, params: any = {}) => req(`/api/crawls/${cid}/pages${qs(params)}`),
    get: (cid: number, pageId: number) => req(`/api/crawls/${cid}/pages/${pageId}`),
    linkGraph: (cid: number) => req(`/api/crawls/${cid}/link-graph`),
    resourceCounts: (cid: number) => req(`/api/crawls/${cid}/resource-counts`),
    urlTree: (cid: number) => req(`/api/crawls/${cid}/url-tree`),
  },
  lighthouse: {
    config: () => req("/api/lighthouse/config"),
    list: (params: any = {}) => req(`/api/lighthouse${qs(params)}`),
    get: (id: number) => req(`/api/lighthouse/${id}`),
    create: (body: any) => req("/api/lighthouse", { method: "POST", body: JSON.stringify(body) }),
    delete: (id: number) => req(`/api/lighthouse/${id}`, { method: "DELETE" }),
  },
  issues: {
    summary: (cid: number) => req(`/api/crawls/${cid}/issues/summary`),
    list: (cid: number, params: any = {}) => req(`/api/crawls/${cid}/issues${qs(params)}`),
  },
  checks: {
    catalog: () => req("/api/checks"),
    defaults: () => req("/api/checks/defaults"),
  },
  presets: {
    list: () => req("/api/presets"),
    create: (body: any) => req("/api/presets", { method: "POST", body: JSON.stringify(body) }),
    delete: (name: string) => req(`/api/presets/${encodeURIComponent(name)}`, { method: "DELETE" }),
  },
  schedules: {
    list: () => req("/api/schedules"),
    create: (body: any) => req("/api/schedules", { method: "POST", body: JSON.stringify(body) }),
    update: (id: number, body: any) => req(`/api/schedules/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: number) => req(`/api/schedules/${id}`, { method: "DELETE" }),
  },
  outlinks: {
    list: (params: any = {}) => req(`/api/outlinks${qs(params)}`),
    get: (id: number) => req(`/api/outlinks/${id}`),
    create: (body: any) => req("/api/outlinks", { method: "POST", body: JSON.stringify(body) }),
    delete: (id: number) => req(`/api/outlinks/${id}`, { method: "DELETE" }),
    exportUrl: (id: number) => `${BASE}/api/outlinks/${id}/export`,
  },
  backlinks: {
    providers: () => req("/api/backlinks/providers"),
    list: (params: any = {}) => req(`/api/backlinks${qs(params)}`),
    get: (id: number) => req(`/api/backlinks/${id}`),
    create: (body: any) => req("/api/backlinks", { method: "POST", body: JSON.stringify(body) }),
    delete: (id: number) => req(`/api/backlinks/${id}`, { method: "DELETE" }),
  },
  gsc: {
    status: () => req("/api/gsc/status"),
    authUrl: () => req("/api/gsc/auth-url"),
    disconnect: () => req("/api/gsc/connection", { method: "DELETE" }),
    sites: () => req("/api/gsc/sites"),
    overview: (site_url: string, days: number, refresh = false) => req(`/api/gsc/overview${qs({ site_url, days, refresh: refresh || undefined })}`),
    inspect: (site_url: string, url: string) => req("/api/gsc/inspect", { method: "POST", body: JSON.stringify({ site_url, url }) }),
    sitemaps: (site_url: string) => req(`/api/gsc/sitemaps${qs({ site_url })}`),
    priority: (site_url: string, days: number) => req(`/api/gsc/priority${qs({ site_url, days })}`),
  },
  dashboard: {
    summary: () => req("/api/dashboard/summary"),
    site: (host: string) => req(`/api/dashboard/site/${encodeURIComponent(host)}`),
  },
  compare: (a: number, b: number) => req(`/api/compare${qs({ a, b })}`),
  exportUrl: (cid: number, type: string, format: string) =>
    `${BASE}/api/crawls/${cid}/export${qs({ type, format })}`,
};
