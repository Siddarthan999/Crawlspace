from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Issue
from ..analysis.registry import CHECKS

router = APIRouter(prefix="/api/crawls/{cid}/issues", tags=["issues"])


@router.get("/summary")
def issues_summary(cid: int, db: Session = Depends(get_db)):
    rows = db.execute(select(Issue.check_id, Issue.category, Issue.severity, func.count())
                       .where(Issue.crawl_id == cid).group_by(Issue.check_id, Issue.category, Issue.severity)).all()
    items = []
    for check_id, category, severity, count in rows:
        cdef = CHECKS.get(check_id)
        items.append(dict(check_id=check_id, category=category, severity=severity, count=count,
                           label=cdef.label if cdef else check_id))
    items.sort(key=lambda x: (-{"error": 3, "warning": 2, "notice": 1}.get(x["severity"], 0), -x["count"]))
    return items


@router.get("")
def list_issues(cid: int, check_id: Optional[str] = None, category: Optional[str] = None,
                 severity: Optional[str] = None, limit: int = 100, offset: int = 0,
                 db: Session = Depends(get_db)):
    stmt = select(Issue).where(Issue.crawl_id == cid)
    if check_id:
        stmt = stmt.where(Issue.check_id == check_id)
    if category:
        stmt = stmt.where(Issue.category == category)
    if severity:
        stmt = stmt.where(Issue.severity == severity)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.execute(stmt.order_by(Issue.id).limit(min(limit, 1000)).offset(offset)).scalars().all()
    items = [dict(id=i.id, page_id=i.page_id, url=i.url, check_id=i.check_id, category=i.category,
                   severity=i.severity, message=i.message, details=i.details) for i in rows]
    return dict(total=total, items=items)
