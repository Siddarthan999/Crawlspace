from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import config
from ..crawler.normalize import normalize
from ..db import get_db
from ..integrations import gsc
from ..models import Crawl, Domain, Issue, Page

router = APIRouter(prefix="/api/gsc", tags=["gsc"])


async def _guard(coro):
    try:
        return await coro
    except gsc.GscError as e:
        raise HTTPException(e.status, e.message)


@router.get("/status")
def get_status():
    return gsc.status()


@router.get("/auth-url")
def get_auth_url():
    try:
        return {"url": gsc.build_auth_url()}
    except gsc.GscError as e:
        raise HTTPException(e.status, e.message)


@router.get("/callback")
async def callback(code: str | None = None, state: str | None = None, error: str | None = None):
    base = config.FRONTEND_URL.rstrip("/")
    if error:
        return RedirectResponse(f"{base}/gsc?error={error}")
    if not code or not gsc.consume_state(state):
        return RedirectResponse(f"{base}/gsc?error=invalid_state")
    try:
        await gsc.exchange_code(code)
    except gsc.GscError as e:
        return RedirectResponse(f"{base}/gsc?error={e.message[:120]}")
    return RedirectResponse(f"{base}/gsc?connected=1")


@router.delete("/connection")
async def disconnect():
    await gsc.disconnect()
    return {"disconnected": True}


@router.get("/sites")
async def sites():
    return await _guard(gsc.list_sites())


@router.get("/overview")
async def overview(site_url: str, days: int = 28, refresh: bool = False):
    return await _guard(gsc.overview(site_url, days, refresh))


class InspectBody(BaseModel):
    site_url: str
    url: str


@router.post("/inspect")
async def inspect(body: InspectBody):
    return await _guard(gsc.inspect_url(body.site_url, body.url.strip()))


@router.get("/sitemaps")
async def sitemaps(site_url: str):
    return await _guard(gsc.list_sitemaps(site_url))


def _variants(url: str) -> list[str]:
    """GSC and the crawler disagree on trailing slashes and www; try the sensible variants."""
    n = normalize(url)
    if not n:
        return []
    out = {n}
    s = urlsplit(n)
    if s.path.endswith("/") and s.path != "/":
        out.add(n.replace(s.path, s.path.rstrip("/"), 1))
    elif s.path and s.path != "/":
        out.add(n.replace(s.path, s.path + "/", 1))
    return list(out)


@router.get("/priority")
async def priority(site_url: str, days: int = 28, db: Session = Depends(get_db)):
    """Joins Search Console traffic with the latest crawl's issues — so you fix what's costing clicks first."""
    host = gsc.property_host(site_url)
    domain = db.execute(select(Domain).where(Domain.host == host)).scalar_one_or_none()
    crawl = None
    if domain:
        crawl = db.execute(select(Crawl).where(Crawl.domain_id == domain.id, Crawl.status == "completed")
                           .order_by(Crawl.created_at.desc())).scalars().first()
    if not crawl:
        return dict(matched_domain=bool(domain), has_crawl=False, host=host, rows=[])

    gsc_pages = await _guard(gsc.top_pages(site_url, days, 200))
    cand: dict[str, dict] = {}
    for gp in gsc_pages:
        for v in _variants(gp["key"]):
            cand[v] = gp
    pages = db.execute(select(Page.id, Page.url).where(Page.crawl_id == crawl.id, Page.url.in_(list(cand)))).all() if cand else []
    id_by_gsc: dict[str, tuple[int, str]] = {}
    for pid, purl in pages:
        id_by_gsc[cand[purl]["key"]] = (pid, purl)

    issue_rows = db.execute(
        select(Issue.page_id, Issue.severity, Issue.check_id, func.count())
        .where(Issue.crawl_id == crawl.id, Issue.page_id.in_([p for p, _ in id_by_gsc.values()] or [-1]))
        .group_by(Issue.page_id, Issue.severity, Issue.check_id)
    ).all()
    per_page: dict[int, dict] = {}
    for pid, sev, check_id, n in issue_rows:
        d = per_page.setdefault(pid, dict(error=0, warning=0, notice=0, checks=[]))
        d[sev] = d.get(sev, 0) + n
        d["checks"].append(check_id)

    rows = []
    for gp in gsc_pages:
        pid, _ = id_by_gsc.get(gp["key"], (None, None))
        iss = per_page.get(pid) if pid else None
        rows.append(dict(
            page=gp["key"], clicks=gp["clicks"], impressions=gp["impressions"], position=gp["position"],
            crawled=pid is not None, page_id=pid,
            issues=dict(error=iss["error"], warning=iss["warning"], notice=iss["notice"]) if iss else dict(error=0, warning=0, notice=0),
            checks=(iss["checks"][:4] if iss else [])))
    return dict(matched_domain=True, has_crawl=True, host=host, crawl_id=crawl.id, rows=rows)
