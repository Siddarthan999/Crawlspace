"""
Everything in one place, keyed by *host*. A Lighthouse run for https://example.com/blog/post,
a link scan of https://www.example.com/pricing and a crawl seeded at example.com all roll up
under the one site "example.com" — that's what makes the dashboard feel like one product
instead of five tools.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..analysis import runner as _runner  # noqa: F401  (registers checks so labels resolve)
from ..analysis.registry import CHECKS
from ..crawler.normalize import clean_seed, host_key, host_of
from ..db import get_db
from ..integrations import backlinks as bl
from ..integrations import gsc
from ..models import BacklinkLookup, Crawl, Domain, Issue, LighthouseRun, OutlinkRun, Schedule

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])
ACTIVE = {"queued", "running", "pausing", "stopping", "analyzing"}


def _host(url: str | None) -> str:
    if not url:
        return ""
    return host_key((host_of(clean_seed(url)) or "").lower())


def _iso(dt):
    return dt.isoformat() if dt else None


def _crawl_metrics(stats: dict | None) -> dict:
    s = stats or {}
    sev = s.get("issues_by_severity") or {}
    return dict(pages=s.get("total_pages"), issues=s.get("issues_total"), errors=sev.get("error", 0),
                warnings=sev.get("warning", 0), notices=sev.get("notice", 0), avg_ms=s.get("avg_response_ms"),
                indexable=s.get("indexable"), non_indexable=s.get("non_indexable"))


def _blank_site(host: str) -> dict:
    return dict(host=host, domain_id=None, crawl_count=0, current_status=None, last_crawl=None, trend=[],
                lighthouse=dict(count=0, latest=None), outlinks=dict(count=0, latest=None),
                backlinks=dict(count=0, latest=None), schedules=0, running=False, last_activity=None)


def _touch(site: dict, ts):
    if ts and (site["last_activity"] is None or ts > site["last_activity"]):
        site["last_activity"] = ts


def _load(db: Session) -> dict:
    """Pulls the lightweight columns of every module once, grouped for reuse."""
    domains = {d.id: d for d in db.execute(select(Domain)).scalars().all()}
    crawls = db.execute(select(Crawl.id, Crawl.domain_id, Crawl.status, Crawl.created_at, Crawl.finished_at,
                               Crawl.health_score, Crawl.stats).order_by(Crawl.created_at)).all()
    lh = db.execute(select(LighthouseRun.id, LighthouseRun.url, LighthouseRun.strategy, LighthouseRun.status,
                           LighthouseRun.scores, LighthouseRun.created_at)
                    .order_by(LighthouseRun.created_at.desc()).limit(500)).all()
    ol = db.execute(select(OutlinkRun.id, OutlinkRun.url, OutlinkRun.host, OutlinkRun.status, OutlinkRun.summary,
                           OutlinkRun.total, OutlinkRun.checked, OutlinkRun.created_at)
                    .order_by(OutlinkRun.created_at.desc()).limit(500)).all()
    bk = db.execute(select(BacklinkLookup.id, BacklinkLookup.target, BacklinkLookup.host, BacklinkLookup.summary,
                           BacklinkLookup.created_at).order_by(BacklinkLookup.created_at.desc()).limit(500)).all()
    sch = db.execute(select(Schedule)).scalars().all()
    return dict(domains=domains, crawls=crawls, lh=lh, ol=ol, bk=bk, sch=sch)


def _build_sites(data: dict) -> dict[str, dict]:
    sites: dict[str, dict] = {}
    get = lambda h: sites.setdefault(h, _blank_site(h))  # noqa: E731

    by_domain: dict[int, list] = {}
    for c in data["crawls"]:
        by_domain.setdefault(c.domain_id, []).append(c)
    for did, d in data["domains"].items():
        site = get(d.host)
        site["domain_id"] = did
        cs = by_domain.get(did, [])
        site["crawl_count"] = len(cs)
        done = [c for c in cs if c.status == "completed"]
        if cs:
            site["current_status"] = cs[-1].status
            site["running"] = cs[-1].status in ACTIVE
            _touch(site, cs[-1].created_at)
        if done:
            last = done[-1]
            site["last_crawl"] = dict(id=last.id, status=last.status, health_score=last.health_score,
                                      created_at=_iso(last.created_at), **_crawl_metrics(last.stats))
            site["trend"] = [dict(t=_iso(c.created_at), score=c.health_score, crawl_id=c.id)
                             for c in done[-12:] if c.health_score is not None]

    for r in data["lh"]:
        site = get(_host(r.url))
        site["lighthouse"]["count"] += 1
        if site["lighthouse"]["latest"] is None and r.status == "completed":
            site["lighthouse"]["latest"] = dict(id=r.id, url=r.url, strategy=r.strategy, scores=r.scores, created_at=_iso(r.created_at))
        _touch(site, r.created_at)
    for r in data["ol"]:
        site = get(r.host or _host(r.url))
        site["outlinks"]["count"] += 1
        if r.status == "running":
            site["running"] = True
        if site["outlinks"]["latest"] is None and r.status == "completed":
            s = r.summary or {}
            site["outlinks"]["latest"] = dict(id=r.id, url=r.url, total=s.get("total"), broken=s.get("broken"),
                                              redirect=s.get("redirect"), created_at=_iso(r.created_at))
        _touch(site, r.created_at)
    for r in data["bk"]:
        site = get(r.host or _host(r.target))
        site["backlinks"]["count"] += 1
        if site["backlinks"]["latest"] is None:
            s = r.summary or {}
            site["backlinks"]["latest"] = dict(id=r.id, total=s.get("total_reported") or s.get("sample_size"),
                                               referring_domains=s.get("referring_domains"), created_at=_iso(r.created_at))
        _touch(site, r.created_at)
    for s in data["sch"]:
        if s.enabled and s.seeds:
            get(_host(s.seeds[0]))["schedules"] += 1
    sites.pop("", None)
    for site in sites.values():  # one place to turn datetimes into strings, so sorting/serializing stays simple
        site["last_activity"] = _iso(site["last_activity"])
    return sites


def _activity(data: dict, limit: int = 14) -> list[dict]:
    items = []
    host_of_domain = {i: d.host for i, d in data["domains"].items()}
    for c in data["crawls"][-12:]:
        m = _crawl_metrics(c.stats)
        host = host_of_domain.get(c.domain_id, "")
        items.append(dict(type="crawl", id=c.id, host=host, title=f"Crawl #{c.id}", status=c.status,
                          detail=f"{m['pages'] or 0} pages · health {c.health_score if c.health_score is not None else '—'}" if c.status == "completed" else c.status,
                          ts=_iso(c.created_at), href=f"/crawls/{c.id}"))
    for r in data["lh"][:12]:
        p = (r.scores or {}).get("performance")
        items.append(dict(type="lighthouse", id=r.id, host=_host(r.url), title=r.url, status=r.status,
                          detail=f"{r.strategy} · performance {p}" if p is not None else r.strategy,
                          ts=_iso(r.created_at), href=f"/lighthouse?run={r.id}"))
    for r in data["ol"][:12]:
        s = r.summary or {}
        items.append(dict(type="outlinks", id=r.id, host=r.host, title=r.url, status=r.status,
                          detail=f"{s.get('broken', 0)} broken of {s.get('total', 0)} links" if r.status == "completed" else r.status,
                          ts=_iso(r.created_at), href=f"/outlinks?run={r.id}"))
    for r in data["bk"][:12]:
        s = r.summary or {}
        items.append(dict(type="backlinks", id=r.id, host=r.host, title=r.target, status="completed",
                          detail=f"{s.get('total_reported') or s.get('sample_size') or 0} backlinks · {s.get('referring_domains') or 0} domains",
                          ts=_iso(r.created_at), href=f"/backlinks?run={r.id}"))
    items.sort(key=lambda x: x["ts"] or "", reverse=True)
    return items[:limit]


def _running(data: dict) -> list[dict]:
    out = []
    host_of_domain = {i: d.host for i, d in data["domains"].items()}
    for c in data["crawls"]:
        if c.status in ACTIVE:
            s = c.stats or {}
            out.append(dict(type="crawl", id=c.id, label=host_of_domain.get(c.domain_id, f"crawl {c.id}"), status=c.status,
                            progress=f"{s.get('crawled', 0)} pages crawled", href=f"/crawls/{c.id}"))
    for r in data["lh"]:
        if r.status == "running":
            out.append(dict(type="lighthouse", id=r.id, label=r.url, status="running", progress=r.strategy, href=f"/lighthouse?run={r.id}"))
    for r in data["ol"]:
        if r.status == "running":
            out.append(dict(type="outlinks", id=r.id, label=r.url, status="running",
                            progress=f"{r.checked or 0}/{r.total or '?'} links", href=f"/outlinks?run={r.id}"))
    return out


@router.get("/summary")
def summary(db: Session = Depends(get_db)):
    data = _load(db)
    sites = _build_sites(data)
    site_list = sorted(sites.values(), key=lambda s: s["last_activity"] or "", reverse=True)

    crawled = [s for s in site_list if s["last_crawl"]]
    sev = dict(error=0, warning=0, notice=0)
    for s in crawled:
        sev["error"] += s["last_crawl"]["errors"] or 0
        sev["warning"] += s["last_crawl"]["warnings"] or 0
        sev["notice"] += s["last_crawl"]["notices"] or 0
    scores = [s["last_crawl"]["health_score"] for s in crawled if s["last_crawl"]["health_score"] is not None]

    totals = dict(
        sites=len(site_list), crawled_sites=len(crawled), crawls=len(data["crawls"]),
        pages=sum(s["last_crawl"]["pages"] or 0 for s in crawled),
        issues=sum(s["last_crawl"]["issues"] or 0 for s in crawled),
        avg_health=round(sum(scores) / len(scores), 1) if scores else None,
        lighthouse_runs=sum(s["lighthouse"]["count"] for s in site_list),
        outlink_runs=sum(s["outlinks"]["count"] for s in site_list),
        backlink_lookups=sum(s["backlinks"]["count"] for s in site_list),
        schedules=sum(s["schedules"] for s in site_list),
        broken_links=sum((s["outlinks"]["latest"] or {}).get("broken") or 0 for s in site_list),
    )
    g = gsc.status()
    return dict(
        totals=totals, severity=sev, sites=site_list,
        health_trend=[dict(host=s["host"], points=s["trend"]) for s in crawled[:6] if len(s["trend"]) >= 1],
        activity=_activity(data), running=_running(data),
        integrations=dict(gsc=dict(configured=g["configured"], connected=g["connected"], email=g["email"]),
                          backlink_providers=bl.provider_catalog()),
    )


@router.get("/site/{host}")
def site_detail(host: str, db: Session = Depends(get_db)):
    h = host_key(host.lower())
    data = _load(db)
    sites = _build_sites(data)
    site = sites.get(h) or _blank_site(h)

    crawls, latest_done = [], None
    if site["domain_id"]:
        rows = [c for c in data["crawls"] if c.domain_id == site["domain_id"]][-40:]
        for c in rows:
            m = _crawl_metrics(c.stats)
            crawls.append(dict(id=c.id, status=c.status, created_at=_iso(c.created_at), finished_at=_iso(c.finished_at),
                               health_score=c.health_score, **m))
            if c.status == "completed":
                latest_done = c

    top_issues = []
    if latest_done:
        rows = db.execute(select(Issue.check_id, Issue.severity, Issue.category, func.count())
                          .where(Issue.crawl_id == latest_done.id).group_by(Issue.check_id, Issue.severity, Issue.category)).all()
        weight = dict(error=4, warning=2, notice=1)
        rows = sorted(rows, key=lambda r: weight.get(r[1], 0) * r[3], reverse=True)[:8]
        top_issues = [dict(check_id=r[0], severity=r[1], category=r[2], count=r[3],
                           label=CHECKS[r[0]].label if r[0] in CHECKS else r[0]) for r in rows]

    lighthouse = [dict(id=r.id, url=r.url, strategy=r.strategy, status=r.status, scores=r.scores, created_at=_iso(r.created_at))
                  for r in data["lh"] if _host(r.url) == h][:40]
    outlinks = [dict(id=r.id, url=r.url, status=r.status, total=r.total, checked=r.checked, summary=r.summary, created_at=_iso(r.created_at))
                for r in data["ol"] if (r.host or _host(r.url)) == h][:40]
    backlinks = [dict(id=r.id, target=r.target, summary=r.summary, created_at=_iso(r.created_at))
                 for r in data["bk"] if (r.host or _host(r.target)) == h][:40]
    schedules = [dict(id=s.id, seeds=s.seeds, every_hours=s.every_hours, enabled=s.enabled, next_run_at=_iso(s.next_run_at),
                      last_crawl_id=s.last_crawl_id)
                 for s in data["sch"] if s.seeds and _host(s.seeds[0]) == h]

    all_hosts = sorted(h2 for h2 in sites if h2)
    if h not in all_hosts:
        all_hosts = sorted(all_hosts + [h])
    return dict(host=h, domain_id=site["domain_id"], hosts=all_hosts, site=site, crawls=crawls, top_issues=top_issues,
                lighthouse=lighthouse, outlinks=outlinks, backlinks=backlinks, schedules=schedules)
