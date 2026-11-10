from fastapi import APIRouter, HTTPException
from sqlalchemy import select, func, delete
from sqlalchemy.orm import Session
from fastapi import Depends

from ..db import get_db
from ..models import Domain, Crawl, Page, Issue, Link, Frontier, SitemapUrl

router = APIRouter(prefix="/api/domains", tags=["domains"])


@router.get("")
def list_domains(db: Session = Depends(get_db)):
    doms = db.execute(select(Domain).order_by(Domain.host)).scalars().all()
    out = []
    for d in doms:
        crawls = db.execute(select(Crawl).where(Crawl.domain_id == d.id).order_by(Crawl.created_at.desc()).limit(8)).scalars().all()
        last = crawls[0] if crawls else None
        n_crawls = db.scalar(select(func.count()).select_from(Crawl).where(Crawl.domain_id == d.id))
        scores = [c.health_score for c in reversed(crawls) if c.health_score is not None]
        out.append(dict(
            id=d.id, host=d.host, created_at=d.created_at, crawl_count=n_crawls,
            is_running=any(c.status in ("queued", "running", "pausing", "stopping", "analyzing") for c in crawls[:1]),
            recent_scores=scores,
            last_crawl=(dict(id=last.id, status=last.status, health_score=last.health_score,
                              created_at=last.created_at, finished_at=last.finished_at,
                              stats=last.stats) if last else None),
        ))
    return out


@router.get("/running")
def running_domains(db: Session = Depends(get_db)):
    """Lightweight poll target for the sidebar — which domains currently have a crawl in flight."""
    rows = db.execute(
        select(Crawl.domain_id).where(Crawl.status.in_(["queued", "running", "pausing", "stopping", "analyzing"]))
    ).all()
    return sorted({r[0] for r in rows})


@router.get("/{domain_id}")
def get_domain(domain_id: int, db: Session = Depends(get_db)):
    d = db.get(Domain, domain_id)
    if not d:
        raise HTTPException(404, "Domain not found")
    return dict(id=d.id, host=d.host, created_at=d.created_at)


@router.delete("/{domain_id}")
def delete_domain(domain_id: int, db: Session = Depends(get_db)):
    d = db.get(Domain, domain_id)
    if not d:
        raise HTTPException(404, "Domain not found")
    cids = [c.id for c in db.execute(select(Crawl.id).where(Crawl.domain_id == domain_id)).all()]
    for cid in cids:
        _purge_crawl(db, cid)
    db.execute(delete(Domain).where(Domain.id == domain_id))
    db.commit()
    return {"deleted": True, "crawls_deleted": len(cids)}


def _purge_crawl(db: Session, cid: int):
    for model in (Issue, Link, Page, Frontier, SitemapUrl):
        db.execute(delete(model).where(model.crawl_id == cid))
    db.execute(delete(Crawl).where(Crawl.id == cid))
