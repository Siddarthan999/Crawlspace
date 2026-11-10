from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Crawl, Domain, Page, Issue
from ..schemas import CrawlCreate, CrawlPatch, ReanalyzeBody
from ..crawler.defaults import DEFAULT_CRAWL_CONFIG, BUILTIN_PRESETS, merge
from ..crawler.normalize import clean_seed, host_of
from ..models import Preset
from ..workers.manager import manager
from ..analysis.registry import default_checks_config
from ..analysis.runner import run_analysis
from .domains import _purge_crawl

router = APIRouter(prefix="/api/crawls", tags=["crawls"])


def _domain_for(db: Session, seed: str) -> Domain:
    host = host_of(clean_seed(seed)).lower()
    if not host:
        raise HTTPException(400, f"Could not parse a host from '{seed}'")
    key = host[4:] if host.startswith("www.") else host
    dom = db.execute(select(Domain).where(Domain.host == key)).scalar_one_or_none()
    if not dom:
        dom = Domain(host=key)
        db.add(dom)
        db.flush()
    return dom


def _summary(c: Crawl) -> dict:
    return dict(id=c.id, domain_id=c.domain_id, status=c.status, seeds=c.seeds, note=c.note,
                created_at=c.created_at, started_at=c.started_at, finished_at=c.finished_at,
                health_score=c.health_score, stats=c.stats, error=c.error, config=c.config,
                checks_config=c.checks_config)


@router.post("")
def create_crawl(body: CrawlCreate, db: Session = Depends(get_db)):
    if not body.seeds:
        raise HTTPException(400, "At least one seed URL is required")
    dom = _domain_for(db, body.seeds[0])
    cfg = dict(DEFAULT_CRAWL_CONFIG)
    if body.preset and body.preset in BUILTIN_PRESETS:
        cfg = merge(cfg, BUILTIN_PRESETS[body.preset]["config"])
    elif body.preset:
        p = db.execute(select(Preset).where(Preset.name == body.preset)).scalar_one_or_none()
        if not p:
            raise HTTPException(400, f"Unknown preset '{body.preset}'")
        cfg = merge(cfg, p.config)
    cfg = merge(cfg, body.config)
    checks_cfg = merge(default_checks_config(), body.checks_config)
    c = Crawl(domain_id=dom.id, seeds=body.seeds, config=cfg, checks_config=checks_cfg,
              status="queued", note=body.note)
    db.add(c)
    db.commit()
    db.refresh(c)
    manager.start(c.id)
    return _summary(c)


@router.get("")
def list_crawls(domain_id: Optional[int] = None, status: Optional[str] = None,
                 date_from: Optional[str] = None, date_to: Optional[str] = None,
                 q: Optional[str] = None, limit: int = 50, offset: int = 0,
                 db: Session = Depends(get_db)):
    stmt = select(Crawl)
    if domain_id:
        stmt = stmt.where(Crawl.domain_id == domain_id)
    if status:
        stmt = stmt.where(Crawl.status == status)
    if date_from:
        stmt = stmt.where(Crawl.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        stmt = stmt.where(Crawl.created_at <= datetime.fromisoformat(date_to))
    if q:
        dom_ids = [d.id for d in db.execute(select(Domain).where(Domain.host.ilike(f"%{q}%"))).scalars()]
        stmt = stmt.where(Crawl.domain_id.in_(dom_ids or [-1]))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.execute(stmt.order_by(Crawl.created_at.desc()).limit(limit).offset(offset)).scalars().all()
    hosts = {d.id: d.host for d in db.execute(select(Domain)).scalars()}
    items = [dict(**_summary(c), host=hosts.get(c.domain_id)) for c in rows]
    return dict(total=total, items=items)


@router.get("/{cid}")
def get_crawl(cid: int, db: Session = Depends(get_db)):
    c = db.get(Crawl, cid)
    if not c:
        raise HTTPException(404, "Crawl not found")
    dom = db.get(Domain, c.domain_id)
    return dict(**_summary(c), host=dom.host if dom else None, is_running=manager.running(cid))


@router.patch("/{cid}")
def patch_crawl(cid: int, body: CrawlPatch, db: Session = Depends(get_db)):
    c = db.get(Crawl, cid)
    if not c:
        raise HTTPException(404, "Crawl not found")
    if body.note is not None:
        c.note = body.note
    if body.checks_config is not None:
        c.checks_config = merge(c.checks_config or {}, body.checks_config)
    db.commit()
    return _summary(c)


@router.post("/{cid}/pause")
async def pause_crawl(cid: int, db: Session = Depends(get_db)):
    c = db.get(Crawl, cid)
    if not c or c.status != "running":
        raise HTTPException(400, "Crawl is not running")
    await manager.pause(cid)
    return {"status": "pausing"}


@router.post("/{cid}/resume")
def resume_crawl(cid: int, db: Session = Depends(get_db)):
    c = db.get(Crawl, cid)
    if not c or c.status not in ("paused", "stopped", "failed"):
        raise HTTPException(400, "Crawl cannot be resumed from its current state")
    manager.resume(cid)
    return {"status": "queued"}


@router.post("/{cid}/stop")
async def stop_crawl(cid: int, db: Session = Depends(get_db)):
    c = db.get(Crawl, cid)
    if not c or c.status not in ("running", "pausing"):
        raise HTTPException(400, "Crawl is not running")
    await manager.stop(cid)
    return {"status": "stopping"}


@router.post("/{cid}/rerun")
def rerun_crawl(cid: int, db: Session = Depends(get_db)):
    old = db.get(Crawl, cid)
    if not old:
        raise HTTPException(404, "Crawl not found")
    c = Crawl(domain_id=old.domain_id, seeds=old.seeds, config=old.config,
              checks_config=old.checks_config, status="queued", note=f"Re-run of crawl #{cid}")
    db.add(c)
    db.commit()
    db.refresh(c)
    manager.start(c.id)
    return _summary(c)


@router.post("/{cid}/reanalyze")
def reanalyze(cid: int, body: ReanalyzeBody, db: Session = Depends(get_db)):
    c = db.get(Crawl, cid)
    if not c:
        raise HTTPException(404, "Crawl not found")
    if c.status not in ("completed", "failed", "stopped"):
        raise HTTPException(400, "Crawl must be finished before re-analyzing")
    if body.checks_config:
        c.checks_config = merge(c.checks_config or {}, body.checks_config)
        db.commit()
    result = run_analysis(cid)
    db.refresh(c)
    return dict(**_summary(c), result=result)


@router.delete("/{cid}")
def delete_crawl(cid: int, db: Session = Depends(get_db)):
    c = db.get(Crawl, cid)
    if not c:
        raise HTTPException(404, "Crawl not found")
    if manager.running(cid):
        raise HTTPException(400, "Stop the crawl before deleting it")
    _purge_crawl(db, cid)
    db.commit()
    return {"deleted": True}


@router.post("/bulk-delete")
def bulk_delete(ids: list[int], db: Session = Depends(get_db)):
    deleted = []
    for cid in ids:
        if manager.running(cid):
            continue
        if db.get(Crawl, cid):
            _purge_crawl(db, cid)
            deleted.append(cid)
    db.commit()
    return {"deleted": deleted}
