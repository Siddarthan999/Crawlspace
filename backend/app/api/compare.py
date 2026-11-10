from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Crawl, Issue
from ..analysis.diff import compare

router = APIRouter(prefix="/api/compare", tags=["compare"])


@router.get("")
def compare_crawls(a: int, b: int, db: Session = Depends(get_db)):
    ca, cb = db.get(Crawl, a), db.get(Crawl, b)
    if not ca or not cb:
        raise HTTPException(404, "Crawl not found")
    ia = [dict(check_id=i[0], url=i[1]) for i in db.execute(select(Issue.check_id, Issue.url).where(Issue.crawl_id == a))]
    ib = [dict(check_id=i[0], url=i[1]) for i in db.execute(select(Issue.check_id, Issue.url).where(Issue.crawl_id == b))]
    diff = compare(ia, ib)
    return dict(
        a=dict(id=ca.id, created_at=ca.created_at, health_score=ca.health_score, stats=ca.stats),
        b=dict(id=cb.id, created_at=cb.created_at, health_score=cb.health_score, stats=cb.stats),
        diff=diff,
    )
