import copy

DEFAULT_CRAWL_CONFIG = {
    "mode": "spider",            # spider | list | sitemap
    "max_urls": 0,               # 0 = unlimited
    "max_depth": 0,              # 0 = unlimited
    "max_time_min": 0,           # 0 = unlimited
    "max_size_mb": 10,           # max body bytes read per page
    "concurrency": 5,
    "delay_ms": 200,             # per-host delay between requests
    "timeout": 20,
    "retries": 2,
    "user_agent": "SEOCrawler/1.0 (+local)",
    "respect_robots": "respect",  # respect | ignore | report
    "crawl_subdomains": False,
    "check_external": False,
    "use_sitemap": True,          # discover + compare sitemap.xml
    "discover_assets": True,      # also verify embedded images/video/audio as their own rows
    "render_js": False,           # fetch internal HTML pages through headless Chromium
    "js_wait_ms": 2000,           # extra wait after DOMContentLoaded before reading the DOM
    "js_wait_selector": "",       # optional CSS selector to wait for instead of a fixed delay
    "follow_nofollow": True,
    "verify_ssl": True,
    "include": [],               # regex list, empty = everything internal
    "exclude": [],
    "param_mode": "crawl",       # crawl | ignore (drop query string)
    "strip_params": [],          # names of query params to remove
    "auth": {"user": "", "password": ""},
    "headers": {},
    "extract": {"images": True, "structured_data": True},
    "custom_extraction": [],     # [{name,type:css|xpath|regex,expression,attr}]
    "custom_search": [],         # [{name,text,regex}]
}

BUILTIN_PRESETS = {
    "quick": {"label": "Quick (500 URLs, depth 5)", "config": {"max_urls": 500, "max_depth": 5, "check_external": False}},
    "full": {"label": "Full site (unlimited)", "config": {"max_urls": 0, "max_depth": 0}},
    "full_external": {"label": "Full + external link check", "config": {"check_external": True}},
    "list": {"label": "List mode (only pasted URLs)", "config": {"mode": "list", "use_sitemap": False}},
    "sitemap": {"label": "Sitemap only", "config": {"mode": "sitemap"}},
    "js_rendered": {"label": "JS-rendered (headless Chromium, slower)", "config": {"render_js": True, "concurrency": 2, "max_urls": 200}},
}


def merge(base: dict, over: dict | None) -> dict:
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict) and k not in ("headers",):
            out[k] = merge(out[k], v)
        else:
            out[k] = v
    return out
