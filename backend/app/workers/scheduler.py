import asyncio
import logging
from datetime import datetime, timedelta

from ..db import SessionLocal
from ..models import Schedule, Crawl, Domain
from ..crawler.normalize import clean_seed, host_of
from .manager import manager

log = logging.getLogger("scheduler")


def _tick():
    with SessionLocal() as db:
        due = db.query(Schedule).filter(Schedule.enabled == True, Schedule.next_run_at <= datetime.utcnow()).all()  # noqa: E712
        started = []
        for s in due:
            seed = clean_seed(s.seeds[0]) if s.seeds else None
            if not seed:
                continue
            host = host_of(seed).lower().removeprefix("www.")
            dom = db.query(Domain).filter_by(host=host).one_or_none()
            if not dom:
                dom = Domain(host=host)
                db.add(dom)
                db.flush()
            c = Crawl(domain_id=dom.id, seeds=s.seeds, config=s.config, checks_config=s.checks_config,
                      status="queued", note="Scheduled crawl")
            db.add(c)
            db.flush()
            s.last_crawl_id = c.id
            s.next_run_at = datetime.utcnow() + timedelta(hours=s.every_hours)
            started.append(c.id)
        db.commit()
        return started


async def scheduler_loop():
    while True:
        try:
            ids = await asyncio.to_thread(_tick)
            for cid in ids:
                manager.start(cid)
        except Exception:
            log.exception("scheduler tick failed")
        await asyncio.sleep(60)
