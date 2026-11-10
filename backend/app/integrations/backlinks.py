"""
Backlink data from free sources only. Worth being upfront about what "free" can mean here:
no free API will hand you the backlinks of an arbitrary website — building that index is
what Ahrefs/Majestic/Moz charge for. What *is* genuinely free:

  local          Links found in your own crawls that point at the target. Needs no key and
                 no network. Limited to sites you've crawled, but exact.
  bing           Bing Webmaster Tools API. Free, real backlink data (counts + source URLs +
                 anchor text) — for sites you've verified in your own Bing Webmaster account.
  openpagerank   Open PageRank API. Free key; a domain authority score derived from the
                 Common Crawl link graph. Authority only, not a link list.
"""
import asyncio
from collections import Counter
from urllib.parse import urlsplit

import httpx
from sqlalchemy import func, or_, select

from .. import config
from ..crawler.normalize import host_key, host_of
from ..db import SessionLocal
from ..models import Crawl, Link

BING_BASE = "https://ssl.bing.com/webmaster/api.svc/json"
OPR_URL = "https://openpagerank.com/api/v1.0/getPageRank"


class ProviderError(Exception):
    pass


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=25, follow_redirects=True)


def provider_catalog() -> list[dict]:
    return [
        dict(id="local", name="Your own crawls", configured=True, env=None,
             description="Links from the sites you've crawled in this app that point at the target. Exact, instant, no key — but only covers sites you've scanned.",
             setup_url=None),
        dict(id="bing", name="Bing Webmaster Tools", configured=bool(config.BING_WEBMASTER_API_KEY),
             env="BING_WEBMASTER_API_KEY",
             description="Real backlink counts, source URLs and anchor text from Bing's index. Free, but only returns data for sites you have verified in your own Bing Webmaster account.",
             setup_url="https://www.bing.com/webmasters"),
        dict(id="openpagerank", name="Open PageRank", configured=bool(config.OPENPAGERANK_API_KEY),
             env="OPENPAGERANK_API_KEY",
             description="A 0–10 domain authority score and global rank from the Common Crawl link graph. Works for any domain; gives authority, not a link list.",
             setup_url="https://www.domcop.com/openpagerank/"),
    ]


def parse_target(raw: str) -> tuple[str, str | None, str]:
    raw = (raw or "").strip()
    if not raw:
        raise ValueError("Enter a domain or URL")
    url = raw if "://" in raw else "https://" + raw
    s = urlsplit(url)
    host = host_key((s.hostname or "").lower())
    if not host or "." not in host:
        raise ValueError(f"'{raw}' doesn't look like a domain or URL")
    path = s.path if s.path and s.path != "/" else None
    return host, path, url


# ------------------------------------------------------------------ local
def _local_sync(host: str, path: str | None, limit: int) -> list[dict]:
    with SessionLocal() as db:
        latest = db.execute(
            select(func.max(Crawl.id)).where(Crawl.status == "completed").group_by(Crawl.domain_id)
        ).scalars().all()
        if not latest:
            return []
        pats = [f"%://{host}/%", f"%://www.{host}/%", f"%://{host}", f"%://www.{host}"]
        rows = db.execute(
            select(Link.from_url, Link.to_url, Link.anchor, Link.nofollow)
            .where(Link.crawl_id.in_(latest), Link.is_internal == False,  # noqa: E712
                   or_(*[Link.to_url.ilike(p) for p in pats]))
            .limit(limit * 4)
        ).all()
    seen, out = set(), []
    for frm, to, anchor, nofollow in rows:
        if host_key(host_of(to)) != host or host_key(host_of(frm)) == host:
            continue
        if path and not urlsplit(to).path.startswith(path):
            continue
        if (frm, to) in seen:
            continue
        seen.add((frm, to))
        out.append(dict(source_url=frm, source_host=host_key(host_of(frm)), target_url=to,
                        anchor=anchor or "", nofollow=bool(nofollow), provider="local"))
        if len(out) >= limit:
            break
    return out


async def local_provider(host: str, path: str | None) -> dict:
    links = await asyncio.to_thread(_local_sync, host, path, 2000)
    return dict(backlinks=links, total=None, authority=None)


# ------------------------------------------------------------------ bing
def _bing_items(data: dict) -> tuple[list[dict], int]:
    d = data.get("d", data) if isinstance(data, dict) else data
    if isinstance(d, list):
        return d, 1
    if not isinstance(d, dict):
        return [], 1
    items = d.get("Details") or d.get("Links") or d.get("Items") or []
    return items, int(d.get("TotalPages") or 1)


async def _bing_get(c: httpx.AsyncClient, method: str, **params) -> dict:
    r = await c.get(f"{BING_BASE}/{method}", params={"apikey": config.BING_WEBMASTER_API_KEY, **params})
    try:
        body = r.json()
    except Exception:
        body = {}
    if r.status_code != 200 or (isinstance(body, dict) and body.get("ErrorCode") not in (None, 0)):
        msg = (body.get("Message") if isinstance(body, dict) else None) or f"HTTP {r.status_code}"
        raise ProviderError(msg)
    return body


async def bing_provider(host: str, path: str | None, target_url: str) -> dict:
    if not config.BING_WEBMASTER_API_KEY:
        raise ProviderError("BING_WEBMASTER_API_KEY is not set")
    sites = [f"https://{host}/", f"https://www.{host}/", f"http://{host}/", f"http://www.{host}/"]
    async with _client() as c:
        site, counts, last_err = None, [], None
        for candidate in sites:
            try:
                first = await _bing_get(c, "GetLinkCounts", siteUrl=candidate, page=0)
            except (ProviderError, httpx.HTTPError) as e:
                last_err = e
                continue
            site = candidate
            items, total_pages = _bing_items(first)
            counts.extend(items)
            for page in range(1, min(total_pages, 3)):
                try:
                    more = await _bing_get(c, "GetLinkCounts", siteUrl=site, page=page)
                    counts.extend(_bing_items(more)[0])
                except (ProviderError, httpx.HTTPError):
                    break
            break
        if not site:
            raise ProviderError(
                f"Bing has no verified site matching {host} in your account ({last_err}). "
                "Verify it at bing.com/webmasters first — Bing only shares backlinks for your own sites.")

        total = sum(int(x.get("Count") or 0) for x in counts)
        if path:
            targets = [target_url]
        else:
            top = sorted(counts, key=lambda x: int(x.get("Count") or 0), reverse=True)[:5]
            targets = [x.get("Url") for x in top if x.get("Url")]

        async def detail(link: str):
            try:
                return await _bing_get(c, "GetUrlLinks", siteUrl=site, link=link, page=0)
            except (ProviderError, httpx.HTTPError):
                return {}

        details = await asyncio.gather(*(detail(t) for t in targets))

    backlinks, seen = [], set()
    for tgt, body in zip(targets, details):
        for item in _bing_items(body)[0]:
            src = item.get("Url") or item.get("SourceUrl")
            if not src or (src, tgt) in seen:
                continue
            seen.add((src, tgt))
            backlinks.append(dict(source_url=src, source_host=host_key(host_of(src)), target_url=tgt,
                                  anchor=item.get("AnchorText") or "", nofollow=False, provider="bing"))
    pages_with_links = sorted(
        ({"url": x.get("Url"), "count": int(x.get("Count") or 0)} for x in counts if x.get("Url")),
        key=lambda x: x["count"], reverse=True)[:10]
    return dict(backlinks=backlinks, total=total, authority=None, extra=dict(site=site, top_linked_pages=pages_with_links))


# ------------------------------------------------------------------ open page rank
async def opr_provider(host: str) -> dict:
    if not config.OPENPAGERANK_API_KEY:
        raise ProviderError("OPENPAGERANK_API_KEY is not set")
    async with _client() as c:
        r = await c.get(OPR_URL, params=[("domains[]", host)], headers={"API-OPR": config.OPENPAGERANK_API_KEY})
    if r.status_code != 200:
        raise ProviderError(f"Open PageRank returned HTTP {r.status_code}")
    body = r.json()
    items = body.get("response") or []
    item = items[0] if items else {}
    if item.get("status_code") not in (200, None) and not item.get("page_rank_decimal"):
        raise ProviderError(item.get("error") or "Domain not found in Open PageRank")
    rank = item.get("rank")
    return dict(backlinks=[], total=None, authority=dict(
        page_rank=item.get("page_rank_decimal"), page_rank_int=item.get("page_rank_integer"),
        global_rank=int(rank) if str(rank or "").isdigit() else None, provider="openpagerank"))


# ------------------------------------------------------------------ orchestration
def build_summary(backlinks: list[dict], authority: dict | None, total_reported: int | None, extra: dict | None) -> dict:
    domains = Counter(b["source_host"] for b in backlinks)
    anchors = Counter(b["anchor"].strip().lower() for b in backlinks if (b.get("anchor") or "").strip())
    return dict(
        sample_size=len(backlinks),
        total_reported=total_reported,
        referring_domains=len(domains),
        nofollow=sum(1 for b in backlinks if b.get("nofollow")),
        by_provider=dict(Counter(b["provider"] for b in backlinks)),
        top_domains=[{"host": h, "count": c} for h, c in domains.most_common(10)],
        top_anchors=[{"anchor": a, "count": c} for a, c in anchors.most_common(10)],
        authority=authority,
        extra=extra or {},
    )


async def lookup(raw_target: str) -> dict:
    host, path, url = parse_target(raw_target)
    tasks = {"local": local_provider(host, path)}
    if config.BING_WEBMASTER_API_KEY:
        tasks["bing"] = bing_provider(host, path, url)
    if config.OPENPAGERANK_API_KEY:
        tasks["openpagerank"] = opr_provider(host)
    names = list(tasks)
    outcomes = await asyncio.gather(*tasks.values(), return_exceptions=True)

    status = {p["id"]: dict(ok=False, configured=p["configured"], count=0, error=None) for p in provider_catalog()}
    backlinks, authority, total_reported, extra = [], None, None, {}
    for name, out in zip(names, outcomes):
        if isinstance(out, Exception):
            status[name]["error"] = str(out) if isinstance(out, ProviderError) else f"{type(out).__name__}: {out}"
            continue
        status[name].update(ok=True, count=len(out["backlinks"]))
        backlinks.extend(out["backlinks"])
        authority = out.get("authority") or authority
        if out.get("total") is not None:
            total_reported = out["total"]
        if out.get("extra"):
            extra.update(out["extra"])
    return dict(host=host, path=path, target=url, providers=status, results=backlinks,
                summary=build_summary(backlinks, authority, total_reported, extra))
