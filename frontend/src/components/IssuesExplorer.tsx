import { useEffect, useMemo, useState } from "react";
import {
  Type, FileText, Heading, Image as ImageIcon, Link2, ShieldAlert, Languages, Braces,
  Copy, Lock, AlignLeft, Zap, AlertTriangle, Repeat, GitBranch, Map as MapIcon,
  ChevronRight, Flame, X, Share2 as Share2Icon,
} from "lucide-react";
import { api } from "../api";
import { SeverityBadge } from "./Badges";
import ExternalLinkButton from "./ExternalLinkButton";
import PageDrawer from "./PageDrawer";

const CATEGORY_META: Record<string, { label: string; icon: any; blurb: string }> = {
  titles: { label: "Titles", icon: Type, blurb: "The <title> tag search results show" },
  meta_description: { label: "Meta descriptions", icon: FileText, blurb: "The snippet text under your title in results" },
  headings: { label: "Headings", icon: Heading, blurb: "H1–H6 structure on the page" },
  images: { label: "Images", icon: ImageIcon, blurb: "Alt text, dimensions, broken images" },
  canonicals: { label: "Canonicals", icon: Link2, blurb: "Which URL is the \"real\" version of a page" },
  links: { label: "Links", icon: Share2Icon, blurb: "Anchor text quality and where links point" },
  directives: { label: "Robots directives", icon: ShieldAlert, blurb: "noindex / nofollow signals" },
  hreflang: { label: "Hreflang", icon: Languages, blurb: "Language and region targeting" },
  structured_data: { label: "Structured data", icon: Braces, blurb: "JSON-LD / schema.org markup" },
  content: { label: "Content", icon: Copy, blurb: "Thin content, duplicates, near-duplicates" },
  security: { label: "Security", icon: Lock, blurb: "Mixed content, HTTPS issues" },
  url_structure: { label: "URL structure", icon: AlignLeft, blurb: "Length, casing, underscores" },
  performance: { label: "Performance", icon: Zap, blurb: "Response time, page weight" },
  response_codes: { label: "Response codes", icon: AlertTriangle, blurb: "4xx, 5xx, and non-responses" },
  redirects: { label: "Redirects", icon: Repeat, blurb: "Chains, loops, and hops" },
  site_structure: { label: "Site structure", icon: GitBranch, blurb: "Orphan pages, internal linking" },
  sitemaps: { label: "Sitemaps", icon: MapIcon, blurb: "Coverage vs. what was crawled" },
};
const SEV_WEIGHT: Record<string, number> = { error: 4, warning: 2, notice: 1 };
const fallbackMeta = { label: "Other", icon: AlertTriangle, blurb: "" };

export default function IssuesExplorer({ cid }: { cid: number }) {
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<number | null>(null);

  useEffect(() => { api.issues.summary(cid).then((s) => { setSummary(s); setLoading(false); }); }, [cid]);

  const byCategory = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const s of summary) (g[s.category] = g[s.category] || []).push(s);
    return g;
  }, [summary]);

  const priority = useMemo(() => {
    return [...summary].sort((a, b) => (SEV_WEIGHT[b.severity] * b.count) - (SEV_WEIGHT[a.severity] * a.count)).slice(0, 4);
  }, [summary]);

  if (loading) return <div className="empty"><span className="spinner" /></div>;
  if (!summary.length) return (
    <div className="card empty">
      <Flame size={26} />
      <div className="empty-title">No issues found</div>
      <div>Everything checked came back clean.</div>
    </div>
  );

  const categories = Object.entries(byCategory).sort((a, b) => {
    const wa = a[1].reduce((s, i) => s + SEV_WEIGHT[i.severity] * i.count, 0);
    const wb = b[1].reduce((s, i) => s + SEV_WEIGHT[i.severity] * i.count, 0);
    return wb - wa;
  });

  return (
    <div>
      {priority.length > 0 && (
        <>
          <div className="section-label">Worth looking at first</div>
          <div className="priority-strip">
            {priority.map((p) => {
              const meta = CATEGORY_META[p.category] || fallbackMeta;
              const Icon = meta.icon;
              return (
                <div key={p.check_id} className={`priority-card sev-${p.severity}`} onClick={() => setOpenCategory(p.category)}>
                  <div className="priority-card-icon"><Icon size={16} /></div>
                  <div className="priority-card-count">{p.count}</div>
                  <div className="priority-card-label">{p.label}</div>
                  <SeverityBadge severity={p.severity} />
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="section-label">All issues, by category</div>
      <div className="category-grid">
        {categories.map(([cat, checks]) => {
          const meta = CATEGORY_META[cat] || fallbackMeta;
          const Icon = meta.icon;
          const total = checks.reduce((s, c) => s + c.count, 0);
          const sevTotals = { error: 0, warning: 0, notice: 0 };
          checks.forEach((c) => { sevTotals[c.severity as "error" | "warning" | "notice"] += c.count; });
          const top = [...checks].sort((a, b) => b.count - a.count)[0];
          return (
            <div key={cat} className="category-card" onClick={() => setOpenCategory(cat)}>
              <div className="category-card-top">
                <div className="category-card-icon"><Icon size={16} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="category-card-label">{meta.label}</div>
                  <div className="faint" style={{ fontSize: 13 }}>{checks.length} check{checks.length === 1 ? "" : "s"}</div>
                </div>
                <div className="category-card-count">{total}</div>
              </div>
              <div className="sev-bar">
                {(["error", "warning", "notice"] as const).map((s) => sevTotals[s] > 0 && (
                  <div key={s} className={`sev-bar-seg sev-${s}`} style={{ width: `${(sevTotals[s] / total) * 100}%` }} />
                ))}
              </div>
              {top && <div className="category-card-top-issue">Most common: {top.label}</div>}
            </div>
          );
        })}
      </div>

      {openCategory && (
        <CategoryPanel
          cid={cid}
          category={openCategory}
          checks={byCategory[openCategory]}
          meta={CATEGORY_META[openCategory] || fallbackMeta}
          onClose={() => setOpenCategory(null)}
          onOpenPage={setDrawer}
        />
      )}
      {drawer && <PageDrawer cid={cid} pageId={drawer} onClose={() => setDrawer(null)} />}
    </div>
  );
}

function CategoryPanel({ cid, category, checks, meta, onClose, onOpenPage }:
  { cid: number; category: string; checks: any[]; meta: { label: string; icon: any; blurb: string }; onClose: () => void; onOpenPage: (id: number) => void }) {
  const [openCheck, setOpenCheck] = useState<string | null>(checks.length === 1 ? checks[0].check_id : null);
  const [rows, setRows] = useState<any[]>([]);
  const Icon = meta.icon;

  useEffect(() => {
    if (openCheck) api.issues.list(cid, { check_id: openCheck, limit: 300 }).then((r) => setRows(r.items));
  }, [cid, openCheck]);

  const toggle = (checkId: string) => setOpenCheck((c) => (c === checkId ? null : checkId));

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="category-card-icon" style={{ width: 34, height: 34 }}><Icon size={17} /></div>
            <div>
              <div style={{ fontWeight: 650, fontSize: 15.5 }}>{meta.label}</div>
              {meta.blurb && <div className="faint" style={{ fontSize: 13.5 }}>{meta.blurb}</div>}
            </div>
          </div>
          <span className="close-x" onClick={onClose}><X size={18} /></span>
        </div>

        {checks.sort((a, b) => b.count - a.count).map((c) => (
          <div key={c.check_id} className="check-row">
            <div className="check-row-head" onClick={() => toggle(c.check_id)}>
              <SeverityBadge severity={c.severity} />
              <span className="check-row-label">{c.label}</span>
              <span className="mono" style={{ fontWeight: 600 }}>{c.count}</span>
              <ChevronRight size={14} className={`chev ${openCheck === c.check_id ? "open" : ""}`} />
            </div>
            {openCheck === c.check_id && (
              <div className="check-row-pages">
                {rows.map((r) => (
                  <div key={r.id} className="check-page-row" onClick={() => onOpenPage(r.page_id)}>
                    <div className="url-row">
                      <span className="mono url-cell" style={{ maxWidth: "100%" }}>{r.url}</span>
                      <ExternalLinkButton url={r.url} />
                    </div>
                    <div className="faint" style={{ fontSize: 13 }}>{r.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
