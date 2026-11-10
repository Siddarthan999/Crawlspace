from ..registry import check


def issue(check_id, cat, sev, page, msg, **details):
    return dict(check_id=check_id, category=cat, severity=sev, page_id=page["id"], url=page["url"],
                message=msg, details=details or None)


def _is_html_page(p):
    """Gate for checks that only mean something on an actual crawled HTML document —
    without this, 'missing title/H1/meta' would fire on every image, PDF, and other
    asset row too, since those never had HTML to extract a title from in the first place."""
    return p.get("resource_type", "page") == "page" and p.get("status_code") == 200 and "html" in (p.get("content_type") or "")


@check("title.missing", "titles", "Missing title", "error")
def title_missing(p, params):
    if _is_html_page(p) and not p.get("title"):
        return issue("title.missing", "titles", "error", p, "Page has no <title> tag")


@check("title.too_long", "titles", "Title too long", "warning", max_len=60)
def title_long(p, params):
    n = p.get("title_len") or 0
    if n > params["max_len"]:
        return issue("title.too_long", "titles", "warning", p, f"Title is {n} characters (recommended <= {params['max_len']})", length=n)


@check("title.too_short", "titles", "Title too short", "warning", min_len=30)
def title_short(p, params):
    n = p.get("title_len") or 0
    if 0 < n < params["min_len"]:
        return issue("title.too_short", "titles", "warning", p, f"Title is only {n} characters (recommended >= {params['min_len']})", length=n)


@check("meta.missing", "meta_description", "Missing meta description", "warning")
def meta_missing(p, params):
    if _is_html_page(p) and not p.get("meta_desc"):
        return issue("meta.missing", "meta_description", "warning", p, "Page has no meta description")


@check("meta.too_long", "meta_description", "Meta description too long", "notice", max_len=160)
def meta_long(p, params):
    n = p.get("meta_desc_len") or 0
    if n > params["max_len"]:
        return issue("meta.too_long", "meta_description", "notice", p, f"Meta description is {n} characters (recommended <= {params['max_len']})", length=n)


@check("meta.too_short", "meta_description", "Meta description too short", "notice", min_len=50)
def meta_short(p, params):
    n = p.get("meta_desc_len") or 0
    if 0 < n < params["min_len"]:
        return issue("meta.too_short", "meta_description", "notice", p, f"Meta description is only {n} characters (recommended >= {params['min_len']})", length=n)


@check("h1.missing", "headings", "Missing H1", "error")
def h1_missing(p, params):
    if _is_html_page(p) and not p.get("h1_count"):
        return issue("h1.missing", "headings", "error", p, "Page has no H1 heading")


@check("h1.multiple", "headings", "Multiple H1 tags", "warning")
def h1_multi(p, params):
    n = p.get("h1_count") or 0
    if n > 1:
        return issue("h1.multiple", "headings", "warning", p, f"Page has {n} H1 headings", count=n)


@check("h1.same_as_title", "headings", "H1 same as title", "notice")
def h1_same(p, params):
    if p.get("h1_1") and p.get("title") and p["h1_1"].strip().lower() == p["title"].strip().lower():
        return issue("h1.same_as_title", "headings", "notice", p, "H1 is identical to the title tag")


@check("images.missing_alt", "images", "Images missing alt text", "warning")
def img_alt(p, params):
    n = p.get("images_missing_alt") or 0
    if n:
        return issue("images.missing_alt", "images", "warning", p, f"{n} image(s) missing alt text", count=n)


@check("images.missing_dims", "images", "Images missing width/height", "notice")
def img_dims(p, params):
    n = p.get("images_missing_dims") or 0
    if n:
        return issue("images.missing_dims", "images", "notice", p, f"{n} image(s) missing width/height attributes (can cause layout shift)", count=n)


@check("canonical.missing", "canonicals", "Missing canonical tag", "notice")
def canon_missing(p, params):
    if p.get("status_code") == 200 and p.get("content_type", "").find("html") >= 0 and not p.get("canonical"):
        return issue("canonical.missing", "canonicals", "notice", p, "Page has no canonical tag")


@check("canonical.non_indexable_target", "canonicals", "Canonical points to a non-200 URL", "error")
def canon_target(p, params):
    c = p.get("canonical")
    if c and p.get("_canon_target_status") not in (None, 200):
        return issue("canonical.non_indexable_target", "canonicals", "error", p,
                      f"Canonical target returns HTTP {p['_canon_target_status']}", target=c)


@check("directives.conflict", "directives", "Conflicting robots directives", "error")
def directive_conflict(p, params):
    mr, xr = (p.get("meta_robots") or "").lower(), (p.get("x_robots") or "").lower()
    if ("noindex" in mr) != ("noindex" in xr) and mr and xr:
        return issue("directives.conflict", "directives", "error", p, "Meta robots and X-Robots-Tag disagree on noindex", meta_robots=mr, x_robots=xr)


@check("hreflang.missing_return", "hreflang", "Hreflang missing return link", "warning")
def hreflang_return(p, params):
    missing = p.get("_hreflang_missing_return")
    if missing:
        return issue("hreflang.missing_return", "hreflang", "warning", p, f"{len(missing)} hreflang link(s) missing a return tag", targets=missing[:10])


@check("structured.errors", "structured_data", "Structured data syntax errors", "error")
def structured_errors(p, params):
    n = p.get("structured_errors") or 0
    if n:
        return issue("structured.errors", "structured_data", "error", p, f"{n} JSON-LD block(s) failed to parse", count=n)


@check("content.thin", "content", "Thin content", "warning", min_words=150)
def thin_content(p, params):
    if p.get("status_code") == 200 and p.get("content_type", "").find("html") >= 0:
        wc = p.get("word_count") or 0
        if wc < params["min_words"]:
            return issue("content.thin", "content", "warning", p, f"Only {wc} words of body text (recommended >= {params['min_words']})", words=wc)


@check("security.mixed_content", "security", "Mixed content (HTTP resources on HTTPS page)", "warning")
def mixed_content(p, params):
    n = p.get("mixed_count") or 0
    if n:
        return issue("security.mixed_content", "security", "warning", p, f"{n} resource(s) loaded over HTTP on an HTTPS page", count=n)


@check("url.too_long", "url_structure", "URL is very long", "notice", max_len=115)
def url_long(p, params):
    if len(p.get("url") or "") > params["max_len"]:
        return issue("url.too_long", "url_structure", "notice", p, "URL exceeds recommended length", length=len(p["url"]))


@check("url.underscores", "url_structure", "URL contains underscores", "notice")
def url_underscore(p, params):
    if "_" in (p.get("url") or "").split("?")[0]:
        return issue("url.underscores", "url_structure", "notice", p, "URL path uses underscores instead of hyphens")


@check("url.uppercase", "url_structure", "URL contains uppercase characters", "notice")
def url_upper(p, params):
    path = (p.get("url") or "").split("://", 1)[-1]
    if any(c.isupper() for c in path):
        return issue("url.uppercase", "url_structure", "notice", p, "URL contains uppercase characters")


@check("performance.slow_response", "performance", "Slow server response", "warning", max_ms=1000)
def slow_response(p, params):
    ms = p.get("response_ms") or 0
    if ms > params["max_ms"]:
        return issue("performance.slow_response", "performance", "warning", p, f"Server took {ms}ms to respond (recommended <= {params['max_ms']}ms)", ms=ms)


@check("performance.large_page", "performance", "Large page size", "notice", max_kb=2000)
def large_page(p, params):
    kb = (p.get("size") or 0) / 1024
    if kb > params["max_kb"]:
        return issue("performance.large_page", "performance", "notice", p, f"Page is {int(kb)}KB (recommended <= {params['max_kb']}KB)", kb=int(kb))
