from fastapi import APIRouter, Depends
from sqlalchemy import select, func, or_
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Domain, Crawl, Page

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("")
def global_search(q: str = "", limit: int = 8, db: Session = Depends(get_db)):
    q = q.strip()
    if len(q) < 2:
        return dict(domains=[], pages=[])

    domains = db.execute(
        select(Domain).where(Domain.host.ilike(f"%{q}%")).order_by(Domain.host).limit(limit)
    ).scalars().all()
    dom_out = []
    for d in domains:
        last = db.execute(select(Crawl).where(Crawl.domain_id == d.id).order_by(Crawl.created_at.desc())).scalars().first()
        dom_out.append(dict(id=d.id, host=d.host, last_crawl_id=last.id if last else None,
                             health_score=last.health_score if last else None))

    # most recent completed crawl per domain, then search pages within those latest crawls
    latest_ids = db.execute(
        select(func.max(Crawl.id)).where(Crawl.status == "completed").group_by(Crawl.domain_id)
    ).scalars().all()
    page_rows = []
    if latest_ids:
        page_rows = db.execute(
            select(Page.id, Page.crawl_id, Page.url, Page.title, Page.resource_type)
            .where(Page.crawl_id.in_(latest_ids), or_(Page.url.ilike(f"%{q}%"), Page.title.ilike(f"%{q}%")))
            .limit(limit)
        ).all()
    dom_by_crawl = {}
    if page_rows:
        crawl_ids = {r[1] for r in page_rows}
        for cid, did in db.execute(select(Crawl.id, Crawl.domain_id).where(Crawl.id.in_(crawl_ids))):
            dom_by_crawl[cid] = did
    host_by_dom = {d.id: d.host for d in domains} if domains else {}
    if page_rows:
        need = {dom_by_crawl[r[1]] for r in page_rows if dom_by_crawl.get(r[1]) not in host_by_dom}
        if need:
            for d in db.execute(select(Domain).where(Domain.id.in_(need))).scalars():
                host_by_dom[d.id] = d.host

    pages_out = [
        dict(id=r[0], crawl_id=r[1], url=r[2], title=r[3], resource_type=r[4],
             host=host_by_dom.get(dom_by_crawl.get(r[1])))
        for r in page_rows
    ]
    return dict(domains=dom_out, pages=pages_out)
