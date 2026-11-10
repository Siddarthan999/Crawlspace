from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Page, Issue
from ..reports.exporters import to_csv, to_json, to_xlsx, PAGE_EXPORT_COLS, ISSUE_EXPORT_COLS

router = APIRouter(prefix="/api/crawls/{cid}/export", tags=["export"])
MEDIA = {"csv": "text/csv", "json": "application/json",
         "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}


@router.get("")
def export(cid: int, type: str = "pages", format: str = "csv", db: Session = Depends(get_db)):
    if type == "pages":
        rows = db.execute(select(Page).where(Page.crawl_id == cid)).scalars().all()
        objs, cols = [{k: v for k, v in r.__dict__.items()} for r in rows], PAGE_EXPORT_COLS
    elif type == "issues":
        rows = db.execute(select(Issue).where(Issue.crawl_id == cid)).scalars().all()
        objs, cols = [{k: v for k, v in r.__dict__.items()} for r in rows], ISSUE_EXPORT_COLS
    else:
        raise HTTPException(400, "type must be 'pages' or 'issues'")
    if format == "csv":
        body = to_csv(objs, cols)
    elif format == "json":
        body = to_json(objs, cols)
    elif format == "xlsx":
        body = to_xlsx(objs, cols, sheet_name=type)
    else:
        raise HTTPException(400, "format must be csv, json or xlsx")
    fname = f"crawl_{cid}_{type}.{format}"
    return Response(content=body, media_type=MEDIA[format],
                     headers={"Content-Disposition": f'attachment; filename="{fname}"'})
