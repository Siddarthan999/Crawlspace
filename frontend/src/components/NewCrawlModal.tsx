import { useEffect, useMemo, useState } from "react";
import { Zap, Globe, Share2, Map as MapIcon, ListTree, MonitorPlay, Sliders, ListChecks, X } from "lucide-react";
import { api } from "../api";

const PRESETS = [
  { value: "quick", label: "Quick scan", desc: "500 URLs, depth 5 — a fast first look", icon: Zap },
  { value: "full", label: "Full site", desc: "No limits — crawl everything reachable", icon: Globe },
  { value: "full_external", label: "Full + external links", desc: "Also verifies every outbound link", icon: Share2 },
  { value: "sitemap", label: "Sitemap only", desc: "Crawl exactly what's listed in sitemap.xml", icon: MapIcon },
  { value: "list", label: "List mode", desc: "Only the URLs you paste — nothing else", icon: ListTree },
  { value: "js_rendered", label: "JS-rendered", desc: "Headless Chromium — slower, sees JS content", icon: MonitorPlay },
];

const TABS = [
  { id: "setup", label: "Setup", icon: Globe },
  { id: "settings", label: "Crawl settings", icon: Sliders },
  { id: "checks", label: "Issue checks", icon: ListChecks },
] as const;

export default function NewCrawlModal({ onClose, onCreated, initialSeed }:
  { onClose: () => void; onCreated: (id: number) => void; initialSeed?: string }) {
  const [seeds, setSeeds] = useState(initialSeed || "");
  const [preset, setPreset] = useState("quick");
  const [tab, setTab] = useState<typeof TABS[number]["id"]>("setup");
  const [cfg, setCfg] = useState<any>({
    max_urls: 500, max_depth: 5, concurrency: 5, delay_ms: 200, timeout: 20,
    respect_robots: "respect", crawl_subdomains: false, check_external: false,
    use_sitemap: true, mode: "spider", param_mode: "crawl", user_agent: "SEOCrawler/1.0 (+local)",
    discover_assets: true, render_js: false, js_wait_ms: 2000, js_wait_selector: "",
  });
  const [catalog, setCatalog] = useState<any[]>([]);
  const [checksCfg, setChecksCfg] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { api.checks.catalog().then(setCatalog).catch(() => {}); }, []);

  useEffect(() => {
    if (preset === "quick") setCfg((c: any) => ({ ...c, max_urls: 500, max_depth: 5, check_external: false, mode: "spider", render_js: false }));
    if (preset === "full") setCfg((c: any) => ({ ...c, max_urls: 0, max_depth: 0, mode: "spider", render_js: false }));
    if (preset === "full_external") setCfg((c: any) => ({ ...c, max_urls: 0, max_depth: 0, mode: "spider", check_external: true }));
    if (preset === "sitemap") setCfg((c: any) => ({ ...c, mode: "sitemap" }));
    if (preset === "list") setCfg((c: any) => ({ ...c, mode: "list", use_sitemap: false }));
    if (preset === "js_rendered") setCfg((c: any) => ({ ...c, render_js: true, concurrency: 2, max_urls: 200, mode: "spider" }));
  }, [preset]);

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const c of catalog) (g[c.category] = g[c.category] || []).push(c);
    return g;
  }, [catalog]);

  const enabledCount = useMemo(() => {
    if (!catalog.length) return 0;
    return catalog.filter((c) => checksCfg[c.id]?.enabled ?? c.default_enabled).length;
  }, [catalog, checksCfg]);

  const toggleCheck = (id: string, def: any) => {
    setChecksCfg((prev) => {
      const cur = prev[id] ?? { enabled: def.default_enabled, ...def.params };
      return { ...prev, [id]: { ...cur, enabled: !cur.enabled } };
    });
  };

  const submit = async () => {
    const seedList = seeds.split(/\n|,/).map((s) => s.trim()).filter(Boolean);
    if (!seedList.length) { setError("Enter at least one URL"); setTab("setup"); return; }
    setBusy(true); setError("");
    try {
      const res = await api.crawls.create({ seeds: seedList, config: cfg, checks_config: checksCfg });
      onCreated(res.id);
    } catch (e: any) {
      setError(e.message || "Failed to start crawl");
    } finally {
      setBusy(false);
    }
  };

  const set = (k: string, v: any) => setCfg((c: any) => ({ ...c, [k]: v }));

  const summaryChips = [
    cfg.mode === "list" ? "List mode" : cfg.mode === "sitemap" ? "Sitemap only" : (cfg.max_urls ? `${cfg.max_urls} URLs max` : "Unlimited URLs"),
    cfg.mode === "spider" && (cfg.max_depth ? `Depth ${cfg.max_depth}` : "Unlimited depth"),
    cfg.respect_robots === "respect" ? "Respects robots.txt" : cfg.respect_robots === "report" ? "Flags robots.txt" : "Ignores robots.txt",
    cfg.render_js && "JS rendering",
    cfg.check_external && "External links checked",
    cfg.crawl_subdomains && "Includes subdomains",
  ].filter(Boolean);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="crawl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head" style={{ padding: "22px 26px 0" }}>
          <div>
            <div className="page-title">New crawl</div>
            <div className="page-sub">No artificial page or depth limits — you set the boundaries.</div>
          </div>
          <span className="close-x" onClick={onClose}><X size={18} /></span>
        </div>

        <div className="tabs" style={{ padding: "0 26px", marginBottom: 0 }}>
          {TABS.map((t) => (
            <div key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              <t.icon size={13} /> {t.label}
              {t.id === "checks" && catalog.length > 0 && <span className="faint">({enabledCount}/{catalog.length})</span>}
            </div>
          ))}
        </div>

        <div className="crawl-modal-body">
          {tab === "setup" && (
            <div>
              <div className="field field-full" style={{ marginBottom: 20 }}>
                <label>URL(s) to crawl</label>
                <textarea className="input" rows={3} placeholder={"https://example.com\nhttps://example.com/blog (one per line, or comma-separated)"}
                  value={seeds} onChange={(e) => setSeeds(e.target.value)} style={{ resize: "vertical", fontFamily: "var(--mono)" }} autoFocus />
              </div>
              <div className="section-label">Preset</div>
              <div className="preset-grid">
                {PRESETS.map((p) => (
                  <div key={p.value} className={`preset-card ${preset === p.value ? "active" : ""}`} onClick={() => setPreset(p.value)}>
                    <div className="preset-card-icon"><p.icon size={16} /></div>
                    <div className="preset-card-label">{p.label}</div>
                    <div className="preset-card-desc">{p.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "settings" && (
            <div>
              <div className="form-grid">
                <div className="field">
                  <label>Max URLs <span className="hint">(0 = unlimited)</span></label>
                  <input className="input" type="number" value={cfg.max_urls} onChange={(e) => set("max_urls", +e.target.value)} />
                </div>
                <div className="field">
                  <label>Max depth <span className="hint">(0 = unlimited)</span></label>
                  <input className="input" type="number" value={cfg.max_depth} onChange={(e) => set("max_depth", +e.target.value)} />
                </div>
                <div className="field">
                  <label>Concurrency</label>
                  <input className="input" type="number" value={cfg.concurrency} onChange={(e) => set("concurrency", +e.target.value)} />
                </div>
                <div className="field">
                  <label>Delay between requests (ms)</label>
                  <input className="input" type="number" value={cfg.delay_ms} onChange={(e) => set("delay_ms", +e.target.value)} />
                </div>
                <div className="field">
                  <label>Robots.txt</label>
                  <select className="select" value={cfg.respect_robots} onChange={(e) => set("respect_robots", e.target.value)}>
                    <option value="respect">Respect (don't crawl disallowed)</option>
                    <option value="report">Ignore, but flag as an issue</option>
                    <option value="ignore">Ignore completely</option>
                  </select>
                </div>
                <div className="field">
                  <label>Request timeout (sec)</label>
                  <input className="input" type="number" value={cfg.timeout} onChange={(e) => set("timeout", +e.target.value)} />
                </div>
                <div className="field">
                  <label>User agent</label>
                  <input className="input" value={cfg.user_agent} onChange={(e) => set("user_agent", e.target.value)} />
                </div>
                <div className="field">
                  <label>URL parameters</label>
                  <select className="select" value={cfg.param_mode} onChange={(e) => set("param_mode", e.target.value)}>
                    <option value="crawl">Crawl as distinct URLs</option>
                    <option value="ignore">Ignore query strings</option>
                  </select>
                </div>
              </div>
              <div className="divider" />
              <div className="toggle-row">
                <div><div className="toggle-label">Crawl subdomains</div></div>
                <label className="switch"><input type="checkbox" checked={cfg.crawl_subdomains} onChange={(e) => set("crawl_subdomains", e.target.checked)} /><span className="track" /><span className="thumb-dot" /></label>
              </div>
              <div className="toggle-row">
                <div><div className="toggle-label">Check external links</div><div className="toggle-desc">Sends a HEAD request to every external link found (off by default — can be slow)</div></div>
                <label className="switch"><input type="checkbox" checked={cfg.check_external} onChange={(e) => set("check_external", e.target.checked)} /><span className="track" /><span className="thumb-dot" /></label>
              </div>
              <div className="toggle-row">
                <div><div className="toggle-label">Discover & compare sitemap.xml</div></div>
                <label className="switch"><input type="checkbox" checked={cfg.use_sitemap} onChange={(e) => set("use_sitemap", e.target.checked)} /><span className="track" /><span className="thumb-dot" /></label>
              </div>
              <div className="toggle-row">
                <div><div className="toggle-label">Verify embedded images &amp; media</div><div className="toggle-desc">Fetches &lt;img&gt;/&lt;video&gt;/&lt;audio&gt; sources so broken media shows up in the report</div></div>
                <label className="switch"><input type="checkbox" checked={cfg.discover_assets} onChange={(e) => set("discover_assets", e.target.checked)} /><span className="track" /><span className="thumb-dot" /></label>
              </div>
              <div className="divider" />
              <div className="toggle-row">
                <div><div className="toggle-label">Render JavaScript</div><div className="toggle-desc">Fetches pages through headless Chromium instead of raw HTML — catches content only visible after JS runs, but is much slower. Keep concurrency low (2–3) when this is on.</div></div>
                <label className="switch"><input type="checkbox" checked={cfg.render_js} onChange={(e) => set("render_js", e.target.checked)} /><span className="track" /><span className="thumb-dot" /></label>
              </div>
              {cfg.render_js && (
                <div className="form-grid" style={{ marginTop: 10 }}>
                  <div className="field">
                    <label>Wait after page load (ms)</label>
                    <input className="input" type="number" value={cfg.js_wait_ms} onChange={(e) => set("js_wait_ms", +e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Or wait for a CSS selector <span className="hint">(optional)</span></label>
                    <input className="input" placeholder="#app, .loaded, …" value={cfg.js_wait_selector} onChange={(e) => set("js_wait_selector", e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "checks" && (
            <div>
              <div className="faint" style={{ fontSize: 14, marginBottom: 14 }}>All checks are on by default — turn off anything you don't want flagged for this crawl.</div>
              {Object.entries(grouped).map(([cat, checks]) => (
                <div key={cat} style={{ marginBottom: 16 }}>
                  <div className="faint" style={{ fontSize: 13, fontWeight: 650, marginBottom: 4, textTransform: "capitalize" }}>{cat.replace(/_/g, " ")}</div>
                  {checks.map((c) => {
                    const enabled = checksCfg[c.id]?.enabled ?? c.default_enabled;
                    return (
                      <div className="toggle-row" key={c.id} style={{ padding: "7px 0" }}>
                        <div className="toggle-label" style={{ fontSize: 13 }}>{c.label}</div>
                        <label className="switch"><input type="checkbox" checked={enabled} onChange={() => toggleCheck(c.id, c)} /><span className="track" /><span className="thumb-dot" /></label>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="crawl-modal-footer">
          <div className="summary-chips">
            {summaryChips.map((s, i) => <span key={i} className="summary-chip">{s}</span>)}
          </div>
          {error && <div className="badge badge-error" style={{ marginBottom: 10 }}>{error}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" onClick={submit} disabled={busy} style={{ flex: 1, justifyContent: "center" }}>
              {busy ? <span className="spinner" /> : "Start crawl"}
            </button>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
