import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Globe2, ArrowRight, CornerDownLeft, Plus, Gauge, Clock3, Command, LayoutDashboard, Link2Off, Network } from "lucide-react";
import { api } from "../api";
import ResourceIcon from "./ResourceIcon";

export default function CommandPalette({ open, onClose, onNewCrawl }:
  { open: boolean; onClose: () => void; onNewCrawl: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ domains: any[]; pages: any[] }>({ domains: [], pages: [] });
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  const ACTIONS = useMemo(() => [
    { id: "new-crawl", label: "Start a new crawl", icon: Plus, run: () => { onClose(); onNewCrawl(); } },
    { id: "dashboard", label: "Go to Dashboard", icon: LayoutDashboard, run: () => { nav("/"); onClose(); } },
    { id: "domains", label: "Go to Domains", icon: Globe2, run: () => { nav("/domains"); onClose(); } },
    { id: "outlinks", label: "Check outgoing links", icon: Link2Off, run: () => { nav("/outlinks"); onClose(); } },
    { id: "backlinks", label: "Look up backlinks", icon: Network, run: () => { nav("/backlinks"); onClose(); } },
    { id: "gsc", label: "Open Search Console", icon: Search, run: () => { nav("/gsc"); onClose(); } },
    { id: "lighthouse", label: "Go to Lighthouse", icon: Gauge, run: () => { nav("/lighthouse"); onClose(); } },
    { id: "schedules", label: "Go to Schedules", icon: Clock3, run: () => { nav("/schedules"); onClose(); } },
  ], [nav, onClose, onNewCrawl]);

  useEffect(() => {
    if (open) {
      setQ(""); setResults({ domains: [], pages: [] }); setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) { setResults({ domains: [], pages: [] }); return; }
    const t = setTimeout(() => { api.search(q.trim()).then(setResults); }, 150);
    return () => clearTimeout(t);
  }, [q]);

  const matchedActions = useMemo(() => {
    const query = q.trim().toLowerCase();
    return ACTIONS.filter((a) => !query || a.label.toLowerCase().includes(query));
  }, [q, ACTIONS]);

  const flat = [
    ...matchedActions.map((a) => ({ kind: "action" as const, item: a })),
    ...results.domains.map((d) => ({ kind: "domain" as const, item: d })),
    ...results.pages.map((p) => ({ kind: "page" as const, item: p })),
  ];

  const go = (entry: typeof flat[number]) => {
    if (entry.kind === "action") { entry.item.run(); return; }
    if (entry.kind === "domain") nav(`/sites/${entry.item.host}`);
    else nav(`/crawls/${entry.item.crawl_id}?open=${entry.item.id}`);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === "Enter" && flat[active]) { e.preventDefault(); go(flat[active]); }
  };

  if (!open) return null;

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input-row">
          <Search size={16} className="faint" />
          <input ref={inputRef} className="palette-input" placeholder="Search, or jump to an action…"
            value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown} />
          <kbd className="kbd">esc</kbd>
        </div>

        {q.trim().length >= 2 && flat.length === 0 && (
          <div className="palette-empty">No matches for "{q}"</div>
        )}

        {matchedActions.length > 0 && (
          <div className="palette-section">
            <div className="palette-section-label">Actions</div>
            {matchedActions.map((a, i) => (
              <div key={a.id} className={`palette-row ${active === i ? "active" : ""}`}
                onMouseEnter={() => setActive(i)} onClick={() => go({ kind: "action", item: a })}>
                <a.icon size={14} className="faint" />
                <span style={{ flex: 1 }}>{a.label}</span>
                <ArrowRight size={13} className="faint" />
              </div>
            ))}
          </div>
        )}

        {results.domains.length > 0 && (
          <div className="palette-section">
            <div className="palette-section-label">Domains</div>
            {results.domains.map((d, i) => {
              const idx = matchedActions.length + i;
              return (
                <div key={d.id} className={`palette-row ${active === idx ? "active" : ""}`}
                  onMouseEnter={() => setActive(idx)} onClick={() => go({ kind: "domain", item: d })}>
                  <Globe2 size={14} className="faint" />
                  <span style={{ flex: 1 }}>{d.host}</span>
                  {d.health_score != null && <span className="mono faint">{d.health_score}</span>}
                  <ArrowRight size={13} className="faint" />
                </div>
              );
            })}
          </div>
        )}

        {results.pages.length > 0 && (
          <div className="palette-section">
            <div className="palette-section-label">Pages</div>
            {results.pages.map((p, i) => {
              const idx = matchedActions.length + results.domains.length + i;
              return (
                <div key={p.id} className={`palette-row ${active === idx ? "active" : ""}`}
                  onMouseEnter={() => setActive(idx)} onClick={() => go({ kind: "page", item: p })}>
                  <span className="faint" style={{ display: "flex" }}><ResourceIcon type={p.resource_type} size={13} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14 }}>{p.title || <span className="faint">untitled</span>}</div>
                    <div className="mono faint" style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.url}</div>
                  </div>
                  <ArrowRight size={13} className="faint" />
                </div>
              );
            })}
          </div>
        )}

        <div className="palette-footer">
          <span><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> navigate</span>
          <span><kbd className="kbd"><CornerDownLeft size={10} /></kbd> select</span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}><Command size={11} className="faint" /><kbd className="kbd">K</kbd> toggle anytime</span>
        </div>
      </div>
    </div>
  );
}
