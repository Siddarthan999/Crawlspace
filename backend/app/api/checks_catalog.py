from fastapi import APIRouter
from ..analysis.registry import catalog, default_checks_config
from ..analysis.runner import run_analysis  # noqa: F401 ensures checks are registered on import

router = APIRouter(prefix="/api/checks", tags=["checks"])


@router.get("")
def get_catalog():
    return catalog()


@router.get("/defaults")
def get_defaults():
    return default_checks_config()
