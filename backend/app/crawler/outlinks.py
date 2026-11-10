"""Outgoing-link scanning for a single page: parse every <a href>, then check each
unique target. Kept separate from the crawl engine — this is a one-page, on-demand
tool, so it has none of the frontier/queue/persistence machinery."""
import time
from urllib.parse import urljoin

import httpx
from selectolax.parser import HTMLParser

from .normalize import normalize, host_key, host_of, is_internal

UA = "Mozilla/5.0 (compatible; CrawlspaceLinkCheck/1.0; +local)"
SEO_RELS = ("nofollow", "sponsored", "ugc")

# Status codes where the server answered but is refusing *us* (bots, auth walls, rate limits).
# Reported as "restricted" rather than "broken" so the broken list stays trustworthy.
RESTRICTED = {401, 403, 405, 406, 429, 451, 999}


def parse_page(html: str, base_url: str) -> dict:
    tree = HTMLParser(html)
    title_node = tree.css_first("title")
    title = " ".join((title_node.text() or "").split()) if title_node else ""
    base = base_url
    b = tree.css_first("base[href]")
    if b:
        base = urljoin(base_url, b.attributes.get("href") or base_url)

    anchors, skipped = [], {"mailto": 0, "tel": 0, "javascript": 0, "other": 0}
    for a in tree.css("a[href]"):
        href = (a.attributes.get("href") or "").strip()
        if not href or href.startswith("#"):
            continue
        low = href.lower()
        if low.startswith("mailto:"):
            skipped["mailto"] += 1
            continue
        if low.startswith("tel:"):
            skipped["tel"] += 1
            continue
        if low.startswith("javascript:"):
            skipped["javascript"] += 1
            continue
        url = normalize(href, base)
        if not url:
            skipped["other"] += 1
            continue
        text = " ".join((a.text() or "").split())
        if not text:
            img = a.css_first("img")
            if img:
                text = "[img] " + (img.attributes.get("alt") or "").strip()
        rel = (a.attributes.get("rel") or "").lower().split()
        anchors.append({"url": url, "anchor": text[:160], "rel": rel})
    return {"title": title, "anchors": anchors, "skipped": skipped}


def aggregate(anchors: list[dict], page_url: str, subdomains: bool = True) -> list[dict]:
    """Collapse repeated links to one row per unique target, keeping the first few anchor texts."""
    seed_key = host_key(host_of(page_url))
    merged: dict[str, dict] = {}
    for a in anchors:
        d = merged.setdefault(a["url"], {"url": a["url"], "occurrences": 0, "anchors": [], "rels": set()})
        d["occurrences"] += 1
        if a["anchor"] and a["anchor"] not in d["anchors"] and len(d["anchors"]) < 3:
            d["anchors"].append(a["anchor"])
        d["rels"].update(a["rel"])
    rows = []
    for d in merged.values():
        rels = sorted(r for r in d["rels"] if r in SEO_RELS)
        rows.append({
            "url": d["url"],
            "occurrences": d["occurrences"],
            "anchors": d["anchors"],
            "rel": rels,
            "nofollow": "nofollow" in rels,
            "sponsored": "sponsored" in rels,
            "ugc": "ugc" in rels,
            "internal": is_internal(d["url"], seed_key, subdomains),
        })
    return rows


async def check_link(client: httpx.AsyncClient, url: str, timeout: float = 15) -> dict:
    """HEAD first (cheap), falling back to GET when HEAD is refused or errors — plenty of
    servers answer HEAD with 404/405 while serving the page fine."""
    t0 = time.perf_counter()
    err = None
    for method in ("HEAD", "GET"):
        try:
            async with client.stream(method, url, timeout=timeout) as r:
                res = {
                    "status": r.status_code,
                    "final_url": str(r.url),
                    "redirects": len(r.history),
                    "chain": [f"{h.status_code} {h.url}" for h in r.history][:5],
                    "content_type": (r.headers.get("content-type") or "").split(";")[0].strip().lower() or None,
                    "error": None,
                }
            if method == "HEAD" and res["status"] >= 400:
                continue
            res["ms"] = int((time.perf_counter() - t0) * 1000)
            return res
        except httpx.TooManyRedirects:
            err = "Too many redirects"
            break
        except httpx.TimeoutException:
            err = "Timed out"
        except httpx.ConnectError as e:
            err = f"Connection failed ({str(e)[:60]})" if str(e) else "Connection failed"
        except Exception as e:  # noqa: BLE001 — a bad target must never take down the whole scan
            err = f"{type(e).__name__}"
    return {"status": 0, "final_url": None, "redirects": 0, "chain": [], "content_type": None,
            "ms": int((time.perf_counter() - t0) * 1000), "error": err or "Request failed"}


def classify(res: dict) -> str:
    st = res.get("status") or 0
    if res.get("error") or st == 0:
        return "broken"
    if st in RESTRICTED:
        return "restricted"
    if st >= 400:
        return "broken"
    if res.get("redirects", 0) > 0:
        return "redirect"
    return "ok"
