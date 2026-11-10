<p align="center"><img src="docs/assets/logo.svg" width="72" alt="Crawlspace logo" /></p>
<h1 align="center">Crawlspace</h1>
<p align="center">
  <b>A self-hosted SEO crawler and audit dashboard.</b><br/>
  Crawl your sites, then keep Lighthouse, link checks, backlinks and Google Search Console in one place.
</p>

<!-- Add a screenshot or short GIF of the dashboard here, e.g. docs/assets/dashboard.png -->

## Features

- **Crawler with no artificial caps** — respects `robots.txt`, reads sitemaps, tracks redirects, verifies images/media, and can render JavaScript pages through headless Chromium.
- **~40 toggleable checks** across titles, meta, headings, canonicals, hreflang, structured data, duplicates and near-duplicates, security, performance and more — each with editable thresholds, grouped by category with the highest-impact issues surfaced first.
- **One dashboard for everything** — every tool's results are filed under the site's domain, with health, issue and traffic trend charts per site.
- **Site structure tree**, crawl-to-crawl comparison, scheduled crawls, CSV/JSON/XLSX export.
- **Lighthouse** and Core Web Vitals for any URL (via PageSpeed Insights).
- **Outgoing-link checker** — paste a page, find every broken, redirecting or `nofollow` link on it.
- **Backlinks** from free sources only: your own crawls, Bing Webmaster Tools, Open PageRank.
- **Google Search Console** — clicks, impressions, queries, URL inspection, and a "fix priority" view joining your traffic to your crawl issues.
- A command palette (`Ctrl/⌘ + K`), collapsible sidebar (`Ctrl/⌘ + B`), and a theme driven entirely by CSS variables.

## Quick start

You need [Docker](https://docs.docker.com/get-docker/) with Compose. Nothing else.

```bash
git clone https://github.com/Siddarthan999/Crawlspace.git crawlspace && cd crawlspace
cp .env.example .env        # optional — every setting has a default
docker compose up --build
```

The first build takes a few minutes. Then open **http://localhost:8080**, paste a URL, and go.
The API and its interactive docs are at http://localhost:8000/docs.

```bash
docker compose down         # stop, keep your data
docker compose down -v      # stop and wipe the database
```

## Configuration

Everything is optional. Put values in `.env` (see [`.env.example`](.env.example)):

| Variable | What it does |
|---|---|
| `PAGESPEED_API_KEY` | Raises the Lighthouse quota (the free anonymous pool runs out quickly) |
| `GSC_CLIENT_ID`, `GSC_CLIENT_SECRET`, `GSC_REDIRECT_URI` | Turns on Google Search Console |
| `BING_WEBMASTER_API_KEY` | Real backlink data for sites you've verified in Bing Webmaster Tools |
| `OPENPAGERANK_API_KEY` | Domain authority score in the Backlinks tool |
| `FRONTEND_PORT`, `BACKEND_PORT`, `BIND_ADDRESS` | Ports, and which interface they bind to (default `127.0.0.1`) |
| `MAX_PARALLEL_CRAWLS`, `POSTGRES_PASSWORD` | Concurrency and database password |

Step-by-step setup for Search Console, backlink sources and Lighthouse:
**[Integrations setup →](docs/ADVANCED.md#integrations-setup)**

## Security

Crawlspace has **no login** — it's built as a single-user tool, and by default it only listens on
`127.0.0.1`. It also makes HTTP requests to whatever URLs you give it (crawler, link checker,
Lighthouse), so don't expose it to an untrusted network without putting authentication in front of it
(a reverse proxy with basic auth or SSO is enough). Only crawl sites you own or have permission to crawl.

## Documentation

Everything beyond getting started lives in **[docs/ADVANCED.md](docs/ADVANCED.md)**:
[how it works](docs/ADVANCED.md#how-it-works) ·
[using each feature](docs/ADVANCED.md#using-it) ·
[design system](docs/ADVANCED.md#design-system) ·
[project structure](docs/ADVANCED.md#project-structure) ·
[adding your own checks](docs/ADVANCED.md#extending-it) ·
[integrations setup](docs/ADVANCED.md#integrations-setup) ·
[troubleshooting](docs/ADVANCED.md#troubleshooting) ·
[limitations & roadmap](docs/ADVANCED.md#limitations-and-whats-not-in-yet)

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
