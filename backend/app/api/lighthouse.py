import asyncio
import logging
from datetime import datetime

import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db, SessionLocal
from ..models import LighthouseRun
from ..config import PAGESPEED_API_KEY

log = logging.getLogger("lighthouse")
router = APIRouter(prefix="/api/lighthouse", tags=["lighthouse"])

PSI_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
CATEGORIES = ["performance", "accessibility", "best-practices", "seo"]


class LighthouseCreate(BaseModel):
    url: str
    strategy: str = "mobile"  # mobile | desktop


def parse_psi(data: dict) -> dict:
    """Pulls out exactly the numbers the UI shows, tolerating any missing field —
    Google can omit categories/audits/field data depending on the page and quota."""
    lr = data.get("lighthouseResult") or {}
    cats = lr.get("categories") or {}
    audits = lr.get("audits") or {}

    def score(key):
        v = (cats.get(key) or {}).get("score")
        return round(v * 100) if isinstance(v, (int, float)) else None

    def metric(key):
        v = (audits.get(key) or {}).get("numericValue")
        return round(v) if isinstance(v, (int, float)) else None

    scores = dict(
        performance=score("performance"),
        accessibility=score("accessibility"),
        best_practices=score("best-practices"),
        seo=score("seo"),
    )
    metrics = dict(
        lcp_ms=metric("largest-contentful-paint"),
        cls=(audits.get("cumulative-layout-shift") or {}).get("numericValue"),
        tbt_ms=metric("total-blocking-time"),
        fcp_ms=metric("first-contentful-paint"),
        si_ms=metric("speed-index"),
        tti_ms=metric("interactive"),
    )

    field = None
    le = data.get("loadingExperience") or {}
    le_metrics = le.get("metrics") or {}
    if le_metrics:
        def pct(key):
            return (le_metrics.get(key) or {}).get("percentile")
        field = dict(
            overall_category=le.get("overall_category"),
            lcp_ms=pct("LARGEST_CONTENTFUL_PAINT_MS"),
            cls=(pct("CUMULATIVE_LAYOUT_SHIFT_SCORE") or 0) / 100 if pct("CUMULATIVE_LAYOUT_SHIFT_SCORE") is not None else None,
            inp_ms=pct("INTERACTION_TO_NEXT_PAINT"),
            fcp_ms=pct("FIRST_CONTENTFUL_PAINT_MS"),
        )
    return dict(scores=scores, metrics=metrics, field_data=field)


def _save(run_id: int, **kw):
    with SessionLocal() as db:
        run = db.get(LighthouseRun, run_id)
        if not run:
            return
        for k, v in kw.items():
            setattr(run, k, v)
        db.commit()


def _classify_error(status_code: int, detail: str, has_key: bool) -> tuple[str, str]:
    """Returns (error_kind, message). Quota errors are by far the most common
    failure for this API and the fix differs depending on whether a key is set,
    so these get specific, actionable messages instead of just the raw HTTP text."""
    is_quota = status_code == 429 or "quota" in detail.lower() or "rate limit" in detail.lower()
    if is_quota and not has_key:
        return "quota_no_key", (
            "Daily quota exceeded. Without a PAGESPEED_API_KEY, every Crawlspace install "
            "shares Google's small free pool for anonymous requests, which runs out fast. "
            "Fix: get a free API key (takes ~2 minutes, no cost) and set PAGESPEED_API_KEY "
            "in your .env file, then restart — this raises your limit to 25,000 requests/day, "
            "dedicated to just you. See docs/ADVANCED.md (Integrations setup) for the exact steps."
        )
    if is_quota and has_key:
        return "quota_with_key", (
            "Your PageSpeed Insights API key has hit its quota. This is Google's limit on your "
            "key specifically — wait for it to reset, or check/raise the quota for the "
            "PageSpeed Insights API in Google Cloud Console under \"APIs & Services → Quotas\"."
        )
    return "other", f"PageSpeed Insights returned HTTP {status_code}: {detail}"[:500]


async def _execute(run_id: int, url: str, strategy: str):
    params = [("url", url), ("strategy", strategy)] + [("category", c) for c in CATEGORIES]
    has_key = bool(PAGESPEED_API_KEY)
    if has_key:
        params.append(("key", PAGESPEED_API_KEY))
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            r = await client.get(PSI_URL, params=params)
        if r.status_code != 200:
            detail = ""
            try:
                detail = r.json().get("error", {}).get("message", "")
            except Exception:
                detail = r.text[:200]
            kind, message = _classify_error(r.status_code, detail, has_key)
            await asyncio.to_thread(_save, run_id, status="failed", error_kind=kind,
                                     error=message, finished_at=datetime.utcnow())
            return
        parsed = parse_psi(r.json())
        await asyncio.to_thread(_save, run_id, status="completed", finished_at=datetime.utcnow(), **parsed)
    except httpx.TimeoutException:
        await asyncio.to_thread(_save, run_id, status="failed", error_kind="other",
                                 error="Timed out waiting for PageSpeed Insights (it can be slow under load — try again).",
                                 finished_at=datetime.utcnow())
    except Exception as e:
        log.exception("lighthouse run %s failed", run_id)
        await asyncio.to_thread(_save, run_id, status="failed", error_kind="other",
                                 error=f"{type(e).__name__}: {e}"[:500], finished_at=datetime.utcnow())


@router.get("/config")
def get_config():
    return {"has_api_key": bool(PAGESPEED_API_KEY)}


@router.post("")
async def create_run(body: LighthouseCreate, db: Session = Depends(get_db)):
    url = body.url.strip()
    if not url:
        raise HTTPException(400, "A URL is required")
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    strategy = body.strategy if body.strategy in ("mobile", "desktop") else "mobile"
    run = LighthouseRun(url=url, strategy=strategy, status="running")
    db.add(run)
    db.commit()
    db.refresh(run)
    asyncio.create_task(_execute(run.id, url, strategy))  # safe: this handler runs on the event loop already
    return run


@router.get("")
def list_runs(limit: int = 30, offset: int = 0, db: Session = Depends(get_db)):
    rows = db.execute(select(LighthouseRun).order_by(LighthouseRun.created_at.desc()).limit(min(limit, 100)).offset(offset)).scalars().all()
    return rows


@router.get("/{run_id}")
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = db.get(LighthouseRun, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    return run


@router.delete("/{run_id}")
def delete_run(run_id: int, db: Session = Depends(get_db)):
    run = db.get(LighthouseRun, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    db.delete(run)
    db.commit()
    return {"deleted": True}
