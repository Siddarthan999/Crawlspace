import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Clock3, Github, Search, Plus, ChevronRight, Gauge, LayoutDashboard, Link2Off, Network, Search as SearchIcon, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import LighthousePage from "./pages/LighthousePage";
import DomainsPage from "./pages/DomainsPage";
import DomainDetailPage from "./pages/DomainDetailPage";
import DashboardPage from "./pages/DashboardPage";
import SitePage from "./pages/SitePage";
import OutlinksPage from "./pages/OutlinksPage";
import BacklinksPage from "./pages/BacklinksPage";
import GscPage from "./pages/GscPage";
import CrawlPage from "./pages/CrawlPage";
import SchedulesPage from "./pages/SchedulesPage";
import ComparePage from "./pages/ComparePage";
import NewCrawlModal from "./components/NewCrawlModal";
import CommandPalette from "./components/CommandPalette";
import Logo from "./components/Logo";
import { REPO_URL } from "./config";
import { api } from "./api";

function healthColor(score?: number | null) {
  if (score == null) return "var(--text-faint)";
  if (score >= 80) return "var(--ok)";
  if (score >= 50) return "var(--warning)";
  return "var(--error)";
}

function DomainsNavSection({ onNewCrawl }: { onNewCrawl: () => void }) {
  const [open, setOpen] = useState(true);
  const [domains, setDomains] = useState<any[]>([]);
  const [running, setRunning] = useState<Set<number>>(new Set());
  const loc = useLocation();
  const nav = useNavigate();
  const pollRef = useRef<any>(null);

  const loadDomains = () => api.domains.list().then(setDomains).catch(() => {});

  useEffect(() => {
    loadDomains();
    const pollRunning = () => api.domains.running().then((ids: number[]) => setRunning(new Set(ids))).catch(() => {});
    pollRunning();
    pollRef.current = setInterval(() => { pollRunning(); loadDomains(); }, 4000);
    return () => clearInterval(pollRef.current);
  }, []);

  // refresh the list whenever we navigate (e.g. right after starting a new crawl)
  useEffect(() => { loadDomains(); }, [loc.pathname]);

  return (
    <div>
      <div className={`nav-group-head ${loc.pathname === "/domains" ? "active" : ""}`}>
        <span className="nav-group-chev" onClick={() => setOpen((o) => !o)} title={open ? "Collapse" : "Expand"}>
          <ChevronRight size={13} className={`chev ${open ? "open" : ""}`} />
        </span>
        <span className="nav-group-title" onClick={() => nav("/domains")} title="Go to Domains">Domains</span>
        <span className="faint" style={{ fontWeight: 500 }}>{domains.length}</span>
        <button className="icon-btn-xs" title="New crawl" onClick={(e) => { e.stopPropagation(); onNewCrawl(); }}>
          <Plus size={13} />
        </button>
      </div>
      {open && (
        <div className="nav-sublist">
          {domains.length === 0 && <div className="nav-empty">No domains yet — start a crawl</div>}
          {domains.map((d) => (
            <NavLink key={d.id} to={`/sites/${d.host}`} className={({ isActive }) => `nav-sub-item ${isActive ? "active" : ""}`}>
              <span className={`health-dot ${running.has(d.id) ? "pulse" : ""}`} style={{ background: running.has(d.id) ? "var(--accent)" : healthColor(d.last_crawl?.health_score) }} />
              <span className="nav-sub-label">{d.host}</span>
              {d.last_crawl?.health_score != null && <span className="mono faint nav-sub-score">{Math.round(d.last_crawl.health_score)}</span>}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

function Sidebar({ docked, onToggle, onNewCrawl, onSearch }: { docked: boolean; onToggle: () => void; onNewCrawl: () => void; onSearch: () => void }) {
  return (
    <div className="sidebar">
      <div className="sidebar-head">
        <Link to="/" className="brand" title="Go to Dashboard">
          <Logo size={30} />
          <div className="brand-text">
            <span className="brand-name">Crawlspace</span>
            <span className="brand-sub">SEO CRAWLER</span>
          </div>
        </Link>
        <button className="icon-btn" onClick={onToggle} aria-label={docked ? "Hide sidebar" : "Pin sidebar open"}
          title={docked ? "Hide sidebar (Ctrl+B)" : "Pin sidebar open (Ctrl+B)"}>
          {docked ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>
      </div>

      <button className="search-trigger" onClick={onSearch}>
        <Search size={13} />
        <span>Search…</span>
        <kbd className="kbd">⌘K</kbd>
      </button>

      <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={onNewCrawl}>
        <Plus size={14} /> New crawl
      </button>

      <nav className="nav">
        <div className="nav-section-label">Overview</div>
        <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}><LayoutDashboard size={15} /> Dashboard</NavLink>
        <DomainsNavSection onNewCrawl={onNewCrawl} />
        <div className="nav-section-label">Tools</div>
        <NavLink to="/lighthouse" className={({ isActive }) => (isActive ? "active" : "")}><Gauge size={15} /> Lighthouse</NavLink>
        <NavLink to="/outlinks" className={({ isActive }) => (isActive ? "active" : "")}><Link2Off size={15} /> Outgoing links</NavLink>
        <NavLink to="/backlinks" className={({ isActive }) => (isActive ? "active" : "")}><Network size={15} /> Backlinks</NavLink>
        <div className="nav-section-label">Integrations</div>
        <NavLink to="/gsc" className={({ isActive }) => (isActive ? "active" : "")}><SearchIcon size={15} /> Search Console</NavLink>
        <div className="nav-section-label">Automation</div>
        <NavLink to="/schedules" className={({ isActive }) => (isActive ? "active" : "")}><Clock3 size={15} /> Schedules</NavLink>
      </nav>

      <div className="sidebar-footer">
        {REPO_URL && <a href={REPO_URL} target="_blank" rel="noreferrer"><Github size={14} /> Star on GitHub</a>}
        <div className="version-tag">v1.0.0 · MIT licensed</div>
      </div>
    </div>
  );
}

const NAV_KEY = "crawlspace.sidebar";

export default function App() {
  const [newCrawlOpen, setNewCrawlOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // docked = the sidebar takes its own column. Otherwise it's tucked away behind the logo button and
  // slides over the page on hover ("peek") — the same pattern as ChatGPT / Claude.
  const [pinned, setPinned] = useState<boolean>(() => { try { return localStorage.getItem(NAV_KEY) !== "hidden"; } catch { return true; } });
  const [peek, setPeek] = useState(false);
  const closeTimer = useRef<any>(null);
  const loc = useLocation();
  const nav = useNavigate();

  const setPin = (v: boolean) => {
    setPinned(v); setPeek(false);
    try { localStorage.setItem(NAV_KEY, v ? "docked" : "hidden"); } catch { /* private mode: just don't persist */ }
  };
  const openPeek = () => { clearTimeout(closeTimer.current); setPeek(true); };
  const closePeek = () => { clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setPeek(false), 240); };

  useEffect(() => { setPeek(false); }, [loc.pathname]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); }
      if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); setPin(!pinned); }
      if (e.key === "Escape") setPeek(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned]);

  return (
    <div className={`app-shell ${pinned ? "" : "nav-hidden"}`}>
      <div className={`sidebar-wrap ${pinned ? "docked" : peek ? "peek" : "hidden"}`} data-testid="sidebar-wrap"
        onMouseEnter={pinned ? undefined : openPeek} onMouseLeave={pinned ? undefined : closePeek}>
        <Sidebar docked={pinned} onToggle={() => setPin(!pinned)} onNewCrawl={() => setNewCrawlOpen(true)} onSearch={() => setPaletteOpen(true)} />
      </div>
      {!pinned && (
        <button className={`nav-reveal ${peek ? "gone" : ""}`} onMouseEnter={openPeek} onMouseLeave={closePeek}
          onClick={() => setPin(true)} aria-label="Open navigation" title="Open navigation (Ctrl+B)">
          <Logo size={28} />
        </button>
      )}
      <div className="main">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/domains" element={<DomainsPage />} />
          <Route path="/sites/:host" element={<SitePage />} />
          <Route path="/outlinks" element={<OutlinksPage />} />
          <Route path="/backlinks" element={<BacklinksPage />} />
          <Route path="/gsc" element={<GscPage />} />
          <Route path="/domains/:id" element={<DomainDetailPage />} />
          <Route path="/crawls/:id" element={<CrawlPage />} />
          <Route path="/schedules" element={<SchedulesPage />} />
          <Route path="/lighthouse" element={<LighthousePage />} />
          <Route path="/compare" element={<ComparePage />} />
        </Routes>
      </div>

      {newCrawlOpen && (
        <NewCrawlModal onClose={() => setNewCrawlOpen(false)} onCreated={(id) => { setNewCrawlOpen(false); nav(`/crawls/${id}`); }} />
      )}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNewCrawl={() => setNewCrawlOpen(true)} />
    </div>
  );
}
