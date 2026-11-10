import asyncio
import csv
import io
import logging
from collections import defaultdict
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, defer

from ..crawler.normalize import clean_seed, host_key, host_of
from ..crawler.outlinks import UA, aggregate, check_link, classify, parse_page
from ..db import SessionLocal, get_db
from ..models import OutlinkRun

log = logging.getLogger("outlinks")
router = APIRouter(prefix="/api/outlinks", tags=["outlinks"])


class OutlinkCreate(BaseModel):
    url: str
    include_internal: bool = True
    max_links: int = 500


def _brief(run: OutlinkRun) -> dict:
    return dict(id=run.id, url=run.url, host=run.host, status=run.status, error=run.error,
                total=run.total, checked=run.checked, include_internal=run.include_internal,
                summary=run.summary, created_at=run.created_at, finished_at=run.finished_at)


def _save(run_id: int, **kw):
    with SessionLocal() as db:
        run = db.get(OutlinkRun, run_id)
        if run:
            for k, v in kw.items():
                setattr(run, k, v)
            db.commit()


def _fail(run_id: int, msg: str):
    _save(run_id, status="failed", error=msg[:500], finished_at=datetime.utcnow())


async def _execute(run_id: int, url: str, include_internal: bool, max_links: int):
    try:
        limits = httpx.Limits(max_connections=40, max_keepalive_connections=20)
        async with httpx.AsyncClient(timeout=20, follow_redirects=True, max_redirects=10, limits=limits,
                                     headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"}) as client:
            try:
                r = await client.get(url)
            except httpx.HTTPError as e:
                await asyncio.to_thread(_fail, run_id, f"Could not fetch the page: {type(e).__name__}: {e}")
                return
            if r.status_code >= 400:
                await asyncio.to_thread(_fail, run_id, f"The page itself returned HTTP {r.status_code}, so there's nothing to scan.")
                return
            if "html" not in (r.headers.get("content-type") or "").lower():
                await asyncio.to_thread(_fail, run_id, f"That URL isn't an HTML page ({r.headers.get('content-type') or 'unknown type'}).")
                return

            page_url = str(r.url)
            parsed = parse_page(r.text, page_url)
            rows = aggregate(parsed["anchors"], page_url)
            found = len(rows)
            if not include_internal:
                rows = [x for x in rows if not x["internal"]]
            truncated = len(rows) > max_links
            rows = rows[:max_links]
            await asyncio.to_thread(_save, run_id, total=len(rows), host=host_key(host_of(page_url)))

            sem = asyncio.Semaphore(12)
            host_sems: dict[str, asyncio.Semaphore] = defaultdict(lambda: asyncio.Semaphore(3))
            done = 0

            async def work(row: dict):
                nonlocal done
                async with sem, host_sems[host_of(row["url"])]:
                    res = await check_link(client, row["url"])
                row.update(res)
                row["state"] = classify(res)
                done += 1
                if done % 5 == 0 or done == len(rows):
                    await asyncio.to_thread(_save, run_id, checked=done)

            await asyncio.gather(*(work(x) for x in rows))

        counts = defaultdict(int)
        for x in rows:
            counts[x["state"]] += 1
        timings = [x["ms"] for x in rows if x.get("ms")]
        summary = dict(
            page_url=page_url, page_title=parsed["title"], page_status=r.status_code,
            total=len(rows), found=found, truncated=truncated,
            internal=sum(1 for x in rows if x["internal"]), external=sum(1 for x in rows if not x["internal"]),
            ok=counts["ok"], redirect=counts["redirect"], broken=counts["broken"], restricted=counts["restricted"],
            nofollow=sum(1 for x in rows if x["nofollow"]), sponsored=sum(1 for x in rows if x["sponsored"]),
            ugc=sum(1 for x in rows if x["ugc"]),
            avg_ms=round(sum(timings) / len(timings)) if timings else None,
            skipped=parsed["skipped"],
        )
        await asyncio.to_thread(_save, run_id, status="completed", summary=summary, results=rows,
                                 checked=len(rows), finished_at=datetime.utcnow())
    except Exception as e:  # noqa: BLE001
        log.exception("outlink run %s failed", run_id)
        await asyncio.to_thread(_fail, run_id, f"{type(e).__name__}: {e}")


@router.post("")
async def create_run(body: OutlinkCreate, db: Session = Depends(get_db)):
    raw = body.url.strip()
    if not raw:
        raise HTTPException(400, "A URL is required")
    url = clean_seed(raw)
    host = host_key(host_of(url))
    if not host:
        raise HTTPException(400, f"Could not read a host from '{raw}'")
    run = OutlinkRun(url=url, host=host, status="running", include_internal=body.include_internal)
    db.add(run)
    db.commit()
    db.refresh(run)
    asyncio.create_task(_execute(run.id, url, body.include_internal, max(1, min(body.max_links, 2000))))
    return _brief(run)


@router.get("")
def list_runs(limit: int = 30, offset: int = 0, host: str | None = None, db: Session = Depends(get_db)):
    stmt = select(OutlinkRun).options(defer(OutlinkRun.results)).order_by(OutlinkRun.created_at.desc())
    if host:
        stmt = stmt.where(OutlinkRun.host == host_key(host.lower()))
    rows = db.execute(stmt.limit(min(limit, 100)).offset(offset)).scalars().all()
    return [_brief(r) for r in rows]


@router.get("/{run_id}")
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = db.get(OutlinkRun, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    return dict(_brief(run), results=run.results or [])


@router.get("/{run_id}/export")
def export_run(run_id: int, db: Session = Depends(get_db)):
    run = db.get(OutlinkRun, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["url", "state", "status", "final_url", "redirects", "internal", "nofollow", "sponsored", "ugc",
                "occurrences", "anchor_text", "response_ms", "error"])
    for x in run.results or []:
        w.writerow([x["url"], x.get("state"), x.get("status"), x.get("final_url"), x.get("redirects"), x["internal"],
                    x["nofollow"], x["sponsored"], x["ugc"], x["occurrences"], " | ".join(x.get("anchors", [])),
                    x.get("ms"), x.get("error")])
    return Response(buf.getvalue().encode("utf-8"), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="outlinks_{run_id}.csv"'})


@router.delete("/{run_id}")
def delete_run(run_id: int, db: Session = Depends(get_db)):
    run = db.get(OutlinkRun, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    db.delete(run)
    db.commit()
    return {"deleted": True}
