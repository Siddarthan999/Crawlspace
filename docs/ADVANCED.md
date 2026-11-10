# Crawlspace — in-depth documentation

This is the long-form companion to the [README](../README.md): how each feature works, the design
system, the project layout, how to extend it, and setup guides for the optional integrations.

- [How it works](#how-it-works)
- [Using it](#using-it)
- [Design system](#design-system)
- [Project structure](#project-structure)
- [Toggling features](#toggling-features)
- [No artificial caps](#no-artificial-caps)
- [Resetting](#resetting)
- [Customizing the sidebar link](#customizing-the-sidebar-link)
- [Extending it](#extending-it)
- [Limitations and what's not in yet](#limitations-and-whats-not-in-yet)
- [Ideas for what's next](#ideas-for-whats-next)
- [Integrations setup](#integrations-setup)
- [Troubleshooting](#troubleshooting)

---

## How it works

```
Dashboard (React, port 8080, nginx)
        │  /api/* is proxied straight through to the backend
        ▼
API (FastAPI, port 8000)
        │
        ├── Crawl engine (async, in-process): fetches pages, respects robots.txt,
        │   discovers sitemap.xml, extracts SEO data, follows links
        │
        ├── Postgres: every crawled page, link, and issue, keyed by crawl_id
        │
        └── Analysis engine: runs after crawling, applies ~40 toggleable checks
            against the stored data and writes Issues + a health score
```

Crawling and analysis are **separate steps**. This is why you can change which checks
are enabled and hit "Re-analyze" on a finished crawl without re-crawling the site —
the raw page data is already sitting in Postgres.

## Using it

1. **New crawl** — paste one or more URLs and pick a preset card (Quick / Full site /
   Full + external links / Sitemap only / List mode / **JS-rendered**), each with a
   one-line description of what it does. Two more tabs inside the same panel: **Crawl
   settings** (limits, robots.txt handling, JS rendering with its wait-time/selector
   options, concurrency, and more — everything defaults to *unlimited*, max URLs and
   max depth are both `0` unless you set them) and **Issue checks** (toggle any of the
   ~41 checks off before you start, grouped by category). A summary strip at the bottom
   — "500 URLs max · Depth 5 · Respects robots.txt" — updates live as you change things,
   so you always know exactly what you're about to run before you hit Start.
2. The crawl runs in the background. The crawl page polls and shows live progress
   (pages crawled, queue size, error count, a tail of recent URLs). You can **pause**,
   **resume**, or **stop** a running crawl from that page.
3. Once it finishes, it's analyzed automatically and you land on four tabs:
   - **Overview** — health score, indexable/non-indexable split, status code and
     depth distribution, avg response time.
   - **Issues** — not a flat list to scroll through. A **"Worth looking at first"**
     strip surfaces the 3–4 highest-impact issues automatically (ranked by severity
     × how many pages are affected), as featured cards you can click straight into.
     Below that, every check is grouped into **category cards** (Titles, Headings,
     Images, Canonicals, Content, Security, and so on) — each shows its total count
     and a small color-coded bar for its error/warning/notice mix at a glance.
     Click a category to open a side panel listing its checks; click a check to see
     the affected URLs; click a URL to open the full page detail.
   - **Pages** — the full crawled table. Switch between **Pages / Images /
     Video & Audio / PDFs / Documents / Other assets** with the tabs above the
     table (each shows a live count); images get a thumbnail preview inline.
     Within the Pages view there are quick filters (4xx, missing title, orphans,
     in sitemap, etc.), search, sorting, and pagination.
   - **Site structure** — every crawled page laid out as a left-to-right tree by
     URL path (so `/resources/*` and `/blog/*` each become their own branch),
     not by hyperlink — that's what makes it read as site architecture instead
     of a tangled ball of links. Branches past depth 2 start collapsed; click
     the +/– bubble to expand one, click a page node to open its detail. Pan by
     dragging empty space, zoom with scroll/pinch or the on-screen +/–/reset
     controls, colored by status (blue 2xx/3xx, amber redirect, red 4xx/5xx).

   Every URL you see anywhere in the dashboard has a small external-link icon
   next to it — click it to open that exact URL in a new tab.
4. **Domain page** — every domain you've crawled lives at `/domains/:id`, with its
   full crawl history. Filter by date range or status, tick two crawls to **compare**
   them (new/fixed/persisting issues), bulk-delete old crawls, or **re-run** a crawl
   with the same settings.
5. **Export** — CSV/JSON/XLSX export for pages or issues is on every finished crawl
   page.
6. **Schedules** — set a URL to recrawl automatically every N hours from the
   Schedules tab in the sidebar.
7. **Command palette (⌘K / Ctrl+K)** — click "Search…" in the sidebar or hit the
   shortcut from anywhere. It's two things in one list: **quick actions**
   ("Start a new crawl", "Go to Lighthouse", "Go to Schedules" — type to filter
   them like any command palette) and **live search** across every domain and
   every crawled page's URL/title. Arrow keys to move, Enter to go. Selecting a
   page opens it directly in its crawl with the detail drawer already open.
8. **Sidebar** — grouped into Overview (the **Dashboard**), Crawl (your **Domains**),
   Tools (Lighthouse, Outgoing links, Backlinks), Integrations (Search Console) and
   Automation (Schedules). Under Domains, every site you've scanned is listed: click the
   **chevron** to collapse the list, the word "**Domains**" to open the Domains page, or a
   site to open its workspace. Each site has a dot for its last health score and a pulsing
   accent dot while something is running on it. The logo always returns to the Dashboard.
   **Hide it** with the panel icon next to the logo (or `Ctrl/⌘ + B`): the sidebar slides away and
   only the logo stays in the top-left. Hover the logo to peek the navigation over the page — it
   closes when you move away or navigate — or click the logo to dock it again. The choice is
   remembered per browser.
9. **Lighthouse** — a separate tool in the sidebar, independent of domain
   crawls: paste any single URL, pick Mobile or Desktop, and get a Lighthouse
   report (Performance/Accessibility/Best Practices/SEO scores plus Core Web
   Vitals — LCP, CLS, TBT, FCP, Speed Index) via Google PageSpeed Insights, with
   real-world field data (Chrome UX Report) shown too when Google has enough
   traffic data for that URL. Every run is kept in a history list below.

   **About the "Quota exceeded" error:** without an API key, every install of
   this tool everywhere shares one small free pool of anonymous requests to
   PageSpeed Insights, so it's common to see a 429 quickly — this isn't a bug,
   it's Google's rate limit, and the fix takes about two minutes:
   1. Go to the [PageSpeed Insights API quickstart](https://developers.google.com/speed/docs/insights/v5/get-started)
      and click "Get a Key". Pick or create a Google Cloud project — it's free,
      no billing account required for this API.
   2. Copy the API key it gives you.
   3. In the project root, copy `.env.example` to `.env` if you haven't already,
      and set `PAGESPEED_API_KEY=your-key-here`.
   4. `docker compose up -d` (or `docker compose restart backend`) to pick it up.

   That raises your limit to 25,000 requests/day, dedicated to just your
   install — plenty for manual, one-URL-at-a-time audits. The app also tells
   you this inline: the Lighthouse page shows a banner whenever no key is set,
   and a failed run shows a "Get a free API key" button directly when it's a
   quota error (it also distinguishes this from *your own* key's quota being
   exceeded, which needs a different fix — waiting it out or raising the quota
   in Cloud Console — and says so explicitly).

10. **Dashboard** (`/`) — the home screen, and the one place everything meets. A single
    box takes a domain *or any URL with a path* and launches a crawl, Lighthouse audit,
    link scan or backlink lookup straight from there. Below it: KPIs across all your sites,
    a health-score trend line per site, an open-issues donut, a **Sites** table showing which
    tools you've run on each (crawl, Lighthouse score, broken links, backlinks, schedules),
    a live "running now" panel, a recent-activity feed and integration status.
11. **Site workspace** (`/sites/example.com`) — click any site. Everything you've run is filed
    under the URL's *host*, so a Lighthouse run on `example.com/blog/post`, a link scan of
    `www.example.com/pricing` and a crawl of `example.com` all land on the same page, with
    tabs for **Overview** (health, issues-per-crawl, pages and response-time trends, top
    issues), **Crawls**, **Lighthouse** (score trends per URL and device), **Outgoing
    links** (broken-link trend), **Backlinks**, **Search Console** and **Schedules**. A
    switcher in the header jumps between sites, and the header buttons launch any tool
    pre-filled for that site.
12. **Outgoing links** — paste one page; every `<a href>` on it is parsed and every unique
    target is checked (HEAD, falling back to GET). Results are classed **OK / Redirect /
    Restricted / Broken** — "restricted" is a 403/429/999 where the server is blocking a
    bot rather than the link being dead, so your broken list stays trustworthy. Shows
    internal vs external, `nofollow`/`sponsored`/`ugc`, anchor text, redirect chains and
    response time; filter, search, sort, export CSV. Capped at a number you choose (up to
    2,000 unique links).
13. **Backlinks** — see "Integrations setup" below for what is and isn't possible for free.
14. **Search Console** — OAuth connection to Google Search Console: clicks, impressions, CTR
    and position with previous-period comparison, top queries/pages/countries/devices,
    URL inspection (is this page indexed, and which canonical did Google pick?), submitted
    sitemaps, and **Fix priority** — your GSC pages joined with your latest crawl's issues,
    so you fix what's actually costing clicks first.

## Design system

The UI follows one deliberate concept — **an instrument panel, not a SaaS
marketing page** — rather than a generic dark-mode template. Two rules drive every screen:

1. **Color means something, or it isn't there.** The only colors in the UI are
   the four status signals (error/warning/notice/ok) and one accent reserved
   for things you can act on (primary buttons, active nav, links, focus). There
   is no decorative gradient, no glow, no tinted-background-on-every-card
   treatment — those read as "generated," not designed.
2. **Flat and quiet over heavy and loud.** Hairline borders instead of drop
   shadows, generous whitespace instead of dense chrome, restrained motion that
   confirms an action rather than performing for its own sake. This is the
   Notion influence: the interface should get out of the way of the data.

### Palette

True-black background with violet-tinted greys, and one violet accent, reserved for
things you can act on. Four status colours carry meaning and nothing else. These are
the values in `frontend/src/styles.css` (the palette block at the top of `:root` is
the project owner's own and is the source of truth):

| Token | Value | Used for |
|---|---|---|
| `--bg` | `#000000` | App background |
| `--panel` / `--panel-alt` / `--panel-raised` | `#0D0C11` / `#17151D` / `#211E2A` | Surfaces, in order of elevation |
| `--border` / `--border-soft` | `#34303F` / `#24212D` | Hairline dividers — the primary way structure is shown |
| `--text` / `--text-dim` / `--text-faint` | `#F3F0FA` / `#B0A9C1` / `#797286` | Primary / secondary / tertiary text |
| `--accent` / `--accent-hover` | `#7E69E8` / `#9584F1` | Primary actions, active states, links, logo |
| `--accent-dim` / `--accent-soft` | `#4C3C9D` / `#211B3A` | Accent borders / selected-row backgrounds |
| `--error` / `--error-bg` | `#FF5A5F` / `#321417` | 4xx/5xx, broken things |
| `--warning` / `--warning-bg` | `#D9AA58` / `#292315` | Needs attention, not broken |
| `--notice` / `--notice-bg` | `#8E9CF4` / `#1B1D35` | Informational |
| `--ok` / `--ok-bg` | `#70BB88` / `#17251D` | Passing, healthy |

**Derived tokens.** A second `:root` block directly under the palette holds shades the
palette doesn't define but the UI needs — hover borders (`--border-hover`), the 1px
border for each status colour (`--error-border`, `--warning-border`, `--notice-border`,
`--ok-border`), text-on-accent (`--on-accent`), the modal scrim and the frosted-glass
panel. They're hand-picked to sit with the palette above; if you change the palette and
one looks off, that block is the only other place to adjust.

**One honest note:** `--notice` (periwinkle) is close in hue to `--accent` (violet). They
never play the same role on screen — notice is a badge/dot, accent is a button/link/active
state — but if they ever read as ambiguous, nudging `--notice` toward cyan separates them.

No component hardcodes a colour: every TSX file, including the inline SVG in
`SiteTree.tsx` and the charts, reads `var(--token)`, so editing `:root` re-themes
the entire app. The one exception is `frontend/public/favicon.svg` (a browser tab icon can't read
CSS variables), which has the palette's hex values baked in — update it by hand if you re-colour. Multi-series charts reuse accent / notice / ok / warning for their lines.

### Logo

The mark is a miniature of the app's own site-structure tree: a root page on the left, branches
curving out to the pages it links to. Two leaves are solid (found pages); the hollow one is the gap a
crawl exists to catch. It lives in `frontend/src/components/Logo.tsx` (themed) and
`frontend/public/favicon.svg` / `docs/assets/logo.svg` (static copies of the same drawing).

### Typography

**IBM Plex Sans** for UI text, **IBM Plex Mono** for anything URL/code/number
(same type family, designed to pair together). This was a deliberate choice
over the Inter-everywhere default most AI-built tools ship with: Plex was
designed by IBM specifically for dense, technical, enterprise software — which
is exactly this product's context — and it's self-hosted via `@fontsource`
(bundled into the build, zero external font-CDN calls at runtime), so a fully
offline self-hosted deploy never has a broken-font fallback.

### A couple of intentional details

- **Severity left-border, not severity background** — a card for an error gets
  a 3px red left edge, not a red-tinted background. Keeps a page of mixed
  severities calm and scannable instead of looking like a slot machine.
- **Count-up animation** on the handful of headline numbers (health score,
  overview stats, Lighthouse scores) — used sparingly, not on every number on
  the page, so it reads as a crafted detail instead of a gimmick.
- **The command palette (⌘K)** mixes quick actions (jump to Domains, start a
  crawl) with live search results in one list — the Raycast/Linear pattern,
  chosen because this is a keyboard-heavy, data-dense tool used by the kind of
  person who reaches for a shortcut before a mouse.

## Project structure

```
seo-crawler/
├── docker-compose.yml
├── .env.example                # ports, API keys (all optional)
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py             # FastAPI app, wires up routers + background scheduler
│       ├── config.py           # env-var settings
│       ├── db.py                # SQLAlchemy engine/session
│       ├── models.py           # Domain, Crawl, Page, Link, Issue, Frontier, etc.
│       ├── schemas.py          # Pydantic request bodies
│       ├── integrations/
│       │   ├── gsc.py          # Google Search Console: OAuth, token refresh, data calls
│       │   └── backlinks.py    # free backlink providers (own crawls, Bing WMT, Open PageRank)
│       ├── crawler/
│       │   ├── outlinks.py     # single-page outgoing-link parser + checker
│       │   ├── engine.py       # the crawl loop itself (async, worker pool, frontier)
│       │   ├── defaults.py     # default crawl config + built-in presets
│       │   ├── normalize.py    # URL normalization / dedup rules
│       │   ├── robots.py       # robots.txt fetching + caching
│       │   ├── sitemap.py      # sitemap.xml / sitemap-index parsing
│       │   └── extract.py      # HTML -> structured page data
│       ├── analysis/
│       │   ├── registry.py     # the check registry (id, category, severity, params)
│       │   ├── runner.py       # loads a crawl's pages, runs enabled checks, scores it
│       │   ├── scoring.py      # health-score formula
│       │   ├── diff.py         # crawl-to-crawl issue diffing
│       │   └── checks/         # the actual check functions, grouped by file
│       ├── workers/
│       │   ├── manager.py      # runs crawls as background asyncio tasks
│       │   └── scheduler.py    # polls the schedules table every 60s
│       ├── reports/exporters.py  # CSV/JSON/XLSX export
│       └── api/                # one router per resource (domains, crawls, ..., outlinks, backlinks, gsc, dashboard)
└── frontend/
    ├── Dockerfile
    ├── nginx.conf              # serves the built app + proxies /api to the backend
    └── src/
        ├── api.ts              # typed fetch wrapper for the whole API
        ├── App.tsx             # sidebar + routes
        ├── pages/              # DashboardPage, SitePage, CrawlPage, OutlinksPage, BacklinksPage, GscPage, ...
        ├── components/         # NewCrawlModal, IssuesExplorer, GscReport, CrawlHistory, badges, ...
        │   └── charts.tsx      # LineChart / StackedBars / Donut / HBars — hand-rolled SVG, no chart library
        └── lib/format.ts       # date / number formatting helpers
```

## Toggling features

Three levels, same as the original plan:

- **Global default** — `GET /api/checks/defaults` returns every check enabled with
  its default parameters. This is what a new crawl starts from.
- **Per-crawl override** — the "Issue checks" panel in the New Crawl form. Stored on
  the crawl itself (`checks_config`), so you always know exactly what ran.
- **Re-analyze** — `POST /api/crawls/{id}/reanalyze` with a new `checks_config`
  re-runs only the analysis step (not the crawl) and overwrites the issue list. The
  dashboard exposes this implicitly whenever you change checks and want fresh
  results without re-crawling (wire a button to this endpoint if you want it directly
  in the UI — the API already supports it).

Crawl-level settings (depth, concurrency, robots handling, etc.) work the same way:
built-in presets in `crawler/defaults.py`, saved custom presets via `/api/presets`,
and a per-crawl config snapshot stored with every crawl for reproducibility.

## No artificial caps

There's no 500-URL wall and no premium upsell. `max_urls` and `max_depth` both default
to `0`, meaning unlimited. The only real limits are your machine's CPU/memory/disk and
whatever `max_urls` / `max_depth` / `max_time_min` you set yourself in **Crawl settings**.

## Resetting

```bash
# stop everything, keep your data
docker compose down

# stop everything AND wipe the database + stored crawl data
docker compose down -v
```

Deleting a domain or crawl from the dashboard removes its rows from Postgres
immediately (pages, links, issues, frontier) — no separate cleanup job needed.

## Customizing the sidebar link

`frontend/src/config.ts` exports `REPO_URL`. While it is empty (the default) no GitHub link is shown
in the sidebar; set it to your repository URL and a "Star on GitHub" link appears.

## Extending it

**Add a new check:** open the right file under `backend/app/analysis/checks/`
(or add a new one), write a function, and decorate it:

```python
@check("images.oversized", "images", "Oversized image file", "notice", max_kb=200)
def oversized_image(page, params):
    ...
    return issue("images.oversized", "images", "notice", page, "...")
```

Registering it with `@check(...)` is enough — it automatically shows up in the
New Crawl "Issue checks" panel and in `GET /api/checks`, with no frontend changes
needed.

**Add a new crawl-config option:** add it to `DEFAULT_CRAWL_CONFIG` in
`crawler/defaults.py`, read it in `engine.py`, and add a field to the "Crawl
settings" panel in `NewCrawlModal.tsx`.

## Limitations and what's not in yet

- GA4 integration, Slack/webhook alerts, Jira/GitHub ticket creation
- Alembic migrations (schema is created via `create_all` on boot — fine for a
  single-user local tool; swap in Alembic if you start changing the schema often
  and need to preserve existing data across upgrades)

**A note on near-duplicate detection**, since it's easy to misread: it compares
pages *within one crawl* — which in practice means within one domain's scan, since
a crawl is normally scoped to a single site. It never compares across different
domains or different crawls. It uses a 64-bit SimHash over 4-word shingles of each
page's body text; two pages with a Hamming distance of 8 bits or less (and a
*different* exact-match hash — true duplicates are reported separately by the
exact-duplicate check instead) get flagged as near-duplicates of each other. It's
a pairwise comparison, so it's skipped above 3,000 pages in one crawl to avoid
a runaway analysis step — both the distance threshold and that cap are checks
you can change like any other, via `content.near_duplicate` in the checks config.

JavaScript rendering, the site-structure tree, media-asset discovery (images/video/audio/PDF
classification), near-duplicate content detection, the on-demand Lighthouse tool, and the
external-link-to-new-tab icon are all implemented. One thing to know about JS rendering:
the backend image is built on Microsoft's official `playwright/python` base image, which
ships Chromium preinstalled — this makes the backend image noticeably larger than a plain
Python image, but means nothing needs downloading at container start. JS rendering is
isolated behind the `render_js` toggle — a normal crawl never touches Playwright — and if
the browser ever fails to launch for any reason, the crawl fails cleanly with a clear
error message instead of crashing.

All of the above slot into the existing structure (an optional module in `analysis/checks/`,
a field in `crawler/defaults.py`, a router in `api/`) without needing a redesign.

## Ideas for what's next

- **Keep your own Search Console history.** Google only retains 16 months of data;
  a nightly job that stores each day's rows would let you chart years and survive property changes.
- **Regression alerts** — email/webhook when a scheduled crawl's comparison shows new errors
  or a Lighthouse/GSC metric drops, using the compare logic that already exists.
- **Content/keyword search across crawled text** — requires storing extracted body text
  (currently only a hash is kept), then full-text search across a domain's pages.
- **A paid backlink provider** (DataForSEO, Moz, Ahrefs API) as a fourth source in
  `integrations/backlinks.py` — it's built as a provider list, so it's one new function.
- **Shareable read-only report links** — a token-gated URL for one crawl's summary.

## Integrations setup

Everything here is optional. The app is fully usable with none of it; each integration lights up when
its keys are present, and the UI tells you exactly what's missing.

### Search Console (OAuth)

You'll create an OAuth client in Google Cloud once. Crawlspace asks for **read-only** access
(`webmasters.readonly`) and never changes anything in your account.

1. In [Google Cloud Console](https://console.cloud.google.com/projectcreate) create a project and enable the
   **Google Search Console API** (APIs & Services → Library).
2. **OAuth consent screen** → External → fill in app name and your email → add the Google account that owns
   your Search Console properties under **Test users**.
3. **Credentials → Create credentials → OAuth client ID → Web application.** Under *Authorized redirect URIs* add
   exactly `http://localhost:8080/api/gsc/callback` (if you changed `FRONTEND_PORT`, use that port and set
   `GSC_REDIRECT_URI` to match — the Search Console page shows the exact URI it expects).
4. Put the client ID and secret in `.env` as `GSC_CLIENT_ID` and `GSC_CLIENT_SECRET`, then `docker compose up -d`.
5. Open **Search Console** in the sidebar → **Connect Google account**.

**Heads-up:** while the OAuth app is in *Testing* status Google expires the login every 7 days and you'll be asked to
reconnect (the app tells you plainly when that happens). Click *Publish app* on the consent screen to stop that; for
personal use you don't need Google's verification — you'll just see an "unverified app" screen once.
Search Console data trails real time by ~2 days.

### Backlinks — what "free" actually means

No free API will list the backlinks of an arbitrary website; that index is exactly what Ahrefs, Majestic and Moz
charge for. Crawlspace uses the three sources that are genuinely free, and is explicit about what each can and
can't do:

| Source | Needs | Gives you | Limit |
|---|---|---|---|
| **Your own crawls** | nothing | Exact links from sites you've crawled in this app to the target | Only covers sites you've scanned |
| **Bing Webmaster Tools** | `BING_WEBMASTER_API_KEY` | Real backlink counts, source URLs and anchor text | Only for sites **you've verified** in your own Bing Webmaster account |
| **Open PageRank** | `OPENPAGERANK_API_KEY` | A 0–10 domain authority score and global rank, for any domain | Authority only — not a list of links |

Get the Bing key in Bing Webmaster Tools → Settings → API access; get an Open PageRank key
[here](https://www.domcop.com/openpagerank/).

### Lighthouse

See the "About the Quota exceeded error" note under *Using it* — set `PAGESPEED_API_KEY`.

## Troubleshooting

- **A crawl seems stuck at "queued":** check `docker compose logs backend` — most
  often it's a DNS/connectivity issue reaching the target site from inside the
  container.
- **Everything 403s:** some sites block generic user agents; set a custom
  `user_agent` in Crawl settings, and keep concurrency/delay conservative — this
  tool does not try to bypass WAFs or CAPTCHAs.
- **Port already in use:** change `FRONTEND_PORT` / `BACKEND_PORT` in `.env`
  (copy from `.env.example` first).
