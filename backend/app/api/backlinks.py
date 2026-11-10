from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, defer

from ..crawler.normalize import host_key
from ..db import get_db
from ..integrations import backlinks as bl
from ..models import BacklinkLookup

router = APIRouter(prefix="/api/backlinks", tags=["backlinks"])


class BacklinkCreate(BaseModel):
    target: str


def _brief(r: BacklinkLookup) -> dict:
    return dict(id=r.id, target=r.target, host=r.host, path=r.path, status=r.status, error=r.error,
                providers=r.providers, summary=r.summary, created_at=r.created_at)


@router.get("/providers")
def providers():
    return bl.provider_catalog()


@router.post("")
async def create_lookup(body: BacklinkCreate, db: Session = Depends(get_db)):
    try:
        data = await bl.lookup(body.target)
    except ValueError as e:
        raise HTTPException(400, str(e))
    row = BacklinkLookup(target=data["target"], host=data["host"], path=data["path"], status="completed",
                         providers=data["providers"], summary=data["summary"], results=data["results"])
    db.add(row)
    db.commit()
    db.refresh(row)
    return dict(_brief(row), results=row.results)


@router.get("")
def list_lookups(limit: int = 30, offset: int = 0, host: str | None = None, db: Session = Depends(get_db)):
    stmt = select(BacklinkLookup).options(defer(BacklinkLookup.results)).order_by(BacklinkLookup.created_at.desc())
    if host:
        stmt = stmt.where(BacklinkLookup.host == host_key(host.lower()))
    return [_brief(r) for r in db.execute(stmt.limit(min(limit, 100)).offset(offset)).scalars().all()]


@router.get("/{lookup_id}")
def get_lookup(lookup_id: int, db: Session = Depends(get_db)):
    row = db.get(BacklinkLookup, lookup_id)
    if not row:
        raise HTTPException(404, "Lookup not found")
    return dict(_brief(row), results=row.results or [])


@router.delete("/{lookup_id}")
def delete_lookup(lookup_id: int, db: Session = Depends(get_db)):
    row = db.get(BacklinkLookup, lookup_id)
    if not row:
        raise HTTPException(404, "Lookup not found")
    db.delete(row)
    db.commit()
    return {"deleted": True}
