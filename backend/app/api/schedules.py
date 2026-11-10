from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Schedule
from ..schemas import ScheduleCreate, ScheduleUpdate

router = APIRouter(prefix="/api/schedules", tags=["schedules"])


@router.get("")
def list_schedules(db: Session = Depends(get_db)):
    return db.execute(select(Schedule)).scalars().all()


@router.post("")
def create_schedule(body: ScheduleCreate, db: Session = Depends(get_db)):
    s = Schedule(seeds=body.seeds, config=body.config, checks_config=body.checks_config,
                 every_hours=body.every_hours, enabled=body.enabled,
                 next_run_at=datetime.utcnow() + timedelta(hours=body.every_hours))
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.patch("/{sid}")
def update_schedule(sid: int, body: ScheduleUpdate, db: Session = Depends(get_db)):
    s = db.get(Schedule, sid)
    if not s:
        raise HTTPException(404, "Schedule not found")
    if body.every_hours is not None:
        s.every_hours = body.every_hours
    if body.enabled is not None:
        s.enabled = body.enabled
    db.commit()
    return s


@router.delete("/{sid}")
def delete_schedule(sid: int, db: Session = Depends(get_db)):
    s = db.get(Schedule, sid)
    if not s:
        raise HTTPException(404, "Schedule not found")
    db.delete(s)
    db.commit()
    return {"deleted": True}
