from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select, delete
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Preset
from ..schemas import PresetCreate
from ..crawler.defaults import BUILTIN_PRESETS

router = APIRouter(prefix="/api/presets", tags=["presets"])


@router.get("")
def list_presets(db: Session = Depends(get_db)):
    built = [dict(name=k, label=v["label"], config=v["config"], checks_config={}, builtin=True)
             for k, v in BUILTIN_PRESETS.items()]
    custom = db.execute(select(Preset)).scalars().all()
    return built + [dict(name=p.name, label=p.name, config=p.config, checks_config=p.checks_config,
                          builtin=False, id=p.id) for p in custom]


@router.post("")
def create_preset(body: PresetCreate, db: Session = Depends(get_db)):
    if body.name in BUILTIN_PRESETS:
        raise HTTPException(400, "Name collides with a built-in preset")
    existing = db.execute(select(Preset).where(Preset.name == body.name)).scalar_one_or_none()
    if existing:
        existing.config, existing.checks_config = body.config, body.checks_config
        db.commit()
        return dict(id=existing.id, name=existing.name, updated=True)
    p = Preset(name=body.name, config=body.config, checks_config=body.checks_config)
    db.add(p)
    db.commit()
    db.refresh(p)
    return dict(id=p.id, name=p.name, created=True)


@router.delete("/{name}")
def delete_preset(name: str, db: Session = Depends(get_db)):
    if name in BUILTIN_PRESETS:
        raise HTTPException(400, "Cannot delete a built-in preset")
    db.execute(delete(Preset).where(Preset.name == name))
    db.commit()
    return {"deleted": True}
