from ..registry import check
from .onpage import issue


@check("response.4xx", "response_codes", "Client error (4xx)", "error")
def c4xx(p, params):
    s = p.get("status_code") or 0
    if 400 <= s < 500:
        return issue("response.4xx", "response_codes", "error", p, f"Returned HTTP {s}", status=s)


@check("response.5xx", "response_codes", "Server error (5xx)", "error")
def c5xx(p, params):
    s = p.get("status_code") or 0
    if 500 <= s < 600:
        return issue("response.5xx", "response_codes", "error", p, f"Returned HTTP {s}", status=s)


@check("response.no_response", "response_codes", "No response / connection error", "error")
def no_resp(p, params):
    if not p.get("status_code") and p.get("error"):
        return issue("response.no_response", "response_codes", "error", p, p["error"][:200])


@check("response.blocked_robots", "response_codes", "Blocked by robots.txt", "warning")
def blocked(p, params):
    if p.get("blocked_robots"):
        return issue("response.blocked_robots", "response_codes", "warning", p, "URL is disallowed by robots.txt")


@check("redirects.chain", "redirects", "Redirect chain (2+ hops)", "warning", min_hops=2)
def redirect_chain(p, params):
    hops = p.get("redirect_hops") or 0
    if hops >= params["min_hops"]:
        return issue("redirects.chain", "redirects", "warning", p, f"Redirect chain of {hops} hops before reaching final URL", hops=hops)


@check("redirects.loop", "redirects", "Redirect loop", "error")
def redirect_loop(p, params):
    if p.get("_redirect_loop"):
        return issue("redirects.loop", "redirects", "error", p, "Redirect loop detected")


@check("links.broken_internal", "links", "Broken internal link target", "error", scope="crawl")
def broken_internal(pages_by_url, params):
    return []  # implemented in runner (needs cross-page link data)
