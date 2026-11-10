from collections import defaultdict
from ..registry import check
from .onpage import issue


@check("links.empty_anchor", "links", "Link with no anchor text", "notice")
def empty_anchor(p, params):
    n = p.get("_empty_anchor_count") or 0
    if n:
        return issue("links.empty_anchor", "links", "notice", p, f"{n} internal link(s) with no anchor text or alt text", count=n)


@check("links.generic_anchor", "links", "Generic anchor text", "notice")
def generic_anchor(p, params):
    n = p.get("_generic_anchor_count") or 0
    if n:
        return issue("links.generic_anchor", "links", "notice", p, f"{n} link(s) use generic anchor text like 'click here'", count=n)


@check("links.to_redirect", "links", "Links to a redirecting URL", "notice")
def links_redirect(p, params):
    n = p.get("_links_to_redirect") or 0
    if n:
        return issue("links.to_redirect", "links", "notice", p, f"{n} internal link(s) point to a URL that redirects", count=n)


@check("links.to_noindex", "links", "Links to a noindex page", "notice")
def links_noindex(p, params):
    n = p.get("_links_to_noindex") or 0
    if n:
        return issue("links.to_noindex", "links", "notice", p, f"{n} internal link(s) point to a noindex page", count=n)


@check("content.exact_duplicate", "content", "Exact duplicate content", "warning", scope="crawl")
def exact_duplicates(pages, params):
    groups = defaultdict(list)
    for p in pages:
        if p.get("content_hash") and p.get("status_code") == 200:
            groups[p["content_hash"]].append(p)
    out = []
    for _, grp in groups.items():
        if len(grp) > 1:
            urls = [g["url"] for g in grp]
            for g in grp:
                out.append(issue("content.exact_duplicate", "content", "warning", g,
                                  f"Identical body content to {len(grp) - 1} other page(s)", duplicates=[u for u in urls if u != g["url"]][:15]))
    return out


def _hamming(a_hex: str, b_hex: str) -> int:
    return bin(int(a_hex, 16) ^ int(b_hex, 16)).count("1")


@check("content.near_duplicate", "content", "Near-duplicate content", "notice", scope="crawl", max_distance=8, max_pages=3000)
def near_duplicates(pages, params):
    """Pages whose body text is substantially similar without being byte-identical
    (a different exact-match content_hash but a close SimHash). Compared only
    within this crawl — in practice, within one domain's scan."""
    candidates = [p for p in pages
                  if p.get("simhash") and p.get("status_code") == 200 and p.get("resource_type", "page") == "page"]
    n = len(candidates)
    if n < 2 or n > params["max_pages"]:
        return []
    threshold = params["max_distance"]
    similar = defaultdict(set)
    for i in range(n):
        a = candidates[i]
        for j in range(i + 1, n):
            b = candidates[j]
            if a.get("content_hash") and a["content_hash"] == b.get("content_hash"):
                continue  # exact duplicates are reported by content.exact_duplicate instead
            if _hamming(a["simhash"], b["simhash"]) <= threshold:
                similar[a["url"]].add(b["url"])
                similar[b["url"]].add(a["url"])
    out = []
    for p in candidates:
        matches = similar.get(p["url"])
        if matches:
            out.append(issue("content.near_duplicate", "content", "notice", p,
                              f"Substantially similar content to {len(matches)} other page(s)",
                              similar_to=sorted(matches)[:15]))
    return out


@check("titles.duplicate", "titles", "Duplicate title tag", "warning", scope="crawl")
def duplicate_titles(pages, params):
    groups = defaultdict(list)
    for p in pages:
        if p.get("title") and p.get("status_code") == 200:
            groups[p["title"].strip().lower()].append(p)
    out = []
    for _, grp in groups.items():
        if len(grp) > 1:
            urls = [g["url"] for g in grp]
            for g in grp:
                out.append(issue("titles.duplicate", "titles", "warning", g,
                                  f"Same title used on {len(grp)} pages", duplicates=[u for u in urls if u != g["url"]][:15]))
    return out


@check("meta.duplicate", "meta_description", "Duplicate meta description", "notice", scope="crawl")
def duplicate_meta(pages, params):
    groups = defaultdict(list)
    for p in pages:
        if p.get("meta_desc") and p.get("status_code") == 200:
            groups[p["meta_desc"].strip().lower()].append(p)
    out = []
    for _, grp in groups.items():
        if len(grp) > 1:
            urls = [g["url"] for g in grp]
            for g in grp:
                out.append(issue("meta.duplicate", "meta_description", "notice", g,
                                  f"Same meta description used on {len(grp)} pages", duplicates=[u for u in urls if u != g["url"]][:15]))
    return out


@check("links.orphan", "site_structure", "Orphan page (0 internal inlinks)", "warning", scope="crawl")
def orphans(pages, params):
    out = []
    for p in pages:
        if p.get("resource_type", "page") != "page":
            continue
        if p.get("status_code") == 200 and p.get("depth", 0) > 0 and (p.get("inlinks") or 0) == 0:
            out.append(issue("links.orphan", "site_structure", "warning", p, "No internal links point to this page"))
    return out


@check("sitemap.not_indexable", "sitemaps", "Sitemap contains a non-indexable URL", "warning", scope="crawl")
def sitemap_bad(pages, params):
    out = []
    for p in pages:
        if p.get("in_sitemap") and not p.get("indexable"):
            out.append(issue("sitemap.not_indexable", "sitemaps", "warning", p,
                              f"URL is in the sitemap but not indexable ({p.get('indexability_reason')})"))
    return out


@check("sitemap.orphan_indexable", "sitemaps", "Indexable page missing from sitemap", "notice", scope="crawl")
def sitemap_missing(pages, params):
    out = []
    for p in pages:
        if p.get("status_code") == 200 and p.get("indexable") and not p.get("in_sitemap"):
            out.append(issue("sitemap.orphan_indexable", "sitemaps", "notice", p, "Indexable page is not listed in the sitemap"))
    return out
