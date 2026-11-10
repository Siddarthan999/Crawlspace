import gzip
import re
import httpx


async def fetch_sitemap_urls(client: httpx.AsyncClient, sitemap_urls: list[str], limit: int = 500000) -> list[str]:
    """Follows sitemap indexes (max 3 levels). Returns page URLs."""
    found: list[str] = []
    seen: set[str] = set()
    queue = [(u, 0) for u in sitemap_urls]
    while queue and len(found) < limit:
        u, lvl = queue.pop(0)
        if u in seen or lvl > 3:
            continue
        seen.add(u)
        try:
            r = await client.get(u, follow_redirects=True)
            if r.status_code != 200:
                continue
            data = r.content
            if u.endswith(".gz") or data[:2] == b"\x1f\x8b":
                data = gzip.decompress(data)
            text = data.decode("utf-8", "ignore")
        except Exception:
            continue
        locs = re.findall(r"<loc>\s*(?:<!\[CDATA\[)?\s*(.*?)\s*(?:\]\]>)?\s*</loc>", text, re.S)
        if "<sitemapindex" in text:
            queue.extend((l, lvl + 1) for l in locs)
        else:
            found.extend(locs)
    return found
