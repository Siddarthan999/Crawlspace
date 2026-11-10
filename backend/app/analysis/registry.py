"""
Check registry: every check is one function (page, cfg) -> Issue|None or a crawl-level
function (pages, cfg) -> [Issue]. Each has an id, category, default severity and
default params, so the frontend can render a settings screen from CHECKS alone.
"""
from dataclasses import dataclass, field


@dataclass
class CheckDef:
    id: str
    category: str
    label: str
    severity: str = "warning"     # error | warning | notice
    default_enabled: bool = True
    params: dict = field(default_factory=dict)
    scope: str = "page"           # page | crawl


CHECKS: dict[str, CheckDef] = {}


def check(id, category, label, severity="warning", enabled=True, scope="page", **params):
    def deco(fn):
        CHECKS[id] = CheckDef(id, category, label, severity, enabled, params, scope)
        fn._check_id = id
        return fn
    return deco


def default_checks_config() -> dict:
    return {cid: {"enabled": c.default_enabled, **c.params} for cid, c in CHECKS.items()}


def enabled_ids(cfg: dict) -> set[str]:
    return {cid for cid, c in CHECKS.items() if (cfg or {}).get(cid, {}).get("enabled", c.default_enabled)}


def catalog() -> list[dict]:
    return [dict(id=c.id, category=c.category, label=c.label, severity=c.severity,
                 default_enabled=c.default_enabled, params=c.params, scope=c.scope)
            for c in CHECKS.values()]
