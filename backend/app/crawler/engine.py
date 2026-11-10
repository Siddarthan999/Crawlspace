import asyncio
import collections
import logging
import re
import time
from datetime import datetime

import httpx
from sqlalchemy import select, func, update

from ..db import SessionLocal
from ..models import Crawl, Domain, Page, Link, Frontier, SitemapUrl
from .defaults import DEFAULT_CRAWL_CONFIG, merge
from .extract import extract, classify_resource_type
from .normalize import normalize, clean_seed, host_of, host_key, is_internal
from .robots import Robots
from .sitemap import fetch_sitemap_urls
from .browser import Renderer, BrowserUnavailable

log = logging.getLogger("engine")
PAGE_COLS = {c.name for c in Page.__table__.columns}


# ------------------------------------------------------------------ sync DB helpers (run in threads)
def db_prepare(cid: int) -> dict:
    with SessionLocal() as db:
        c = db.get(Crawl, cid)
        d = db.get(Domain, c.domain_id)
        c.status, c.error = "running", None
        c.started_at = c.started_at or datetime.utcnow()
        db.commit()
        rows = db.execute(select(Frontier.url, Frontier.depth, Frontier.kind, Frontier.done).where(Frontier.crawl_id == cid)).all()
        seen = {r[0] for r in rows}
        pending = [(r[0], r[1], r[2]) for r in rows if not r[3]]
        accepted = sum(1 for r in rows if r[2] == "internal")
        crawled = db.scalar(select(func.count()).select_from(Page).where(Page.crawl_id == cid)) or 0
        return dict(host=d.host, seeds=list(c.seeds or []), config=merge(DEFAULT_CRAWL_CONFIG, c.config),
                    fresh=not rows, seen=seen, pending=pending, accepted=accepted, crawled=crawled)


def db_add_frontier(cid: int, items: list[dict]):
    with SessionLocal() as db:
        db.bulk_insert_mappings(Frontier, [dict(crawl_id=cid, done=False, **i) for i in items])
        db.commit()


def db_add_sitemap(cid: int, urls: list[str]):
    with SessionLocal() as db:
        db.bulk_insert_mappings(SitemapUrl, [dict(crawl_id=cid, url=u) for u in urls])
        db.commit()


def db_save(cid: int, url: str, page: dict, links: list[dict], new_items: list[dict]):
    with SessionLocal() as db:
        p = Page(crawl_id=cid, **{k: v for k, v in page.items() if k in PAGE_COLS})
        db.add(p)
        db.flush()
        if links:
            db.bulk_insert_mappings(Link, [dict(crawl_id=cid, from_page_id=p.id, from_url=url, **l) for l in links])
        if new_items:
            db.bulk_insert_mappings(Frontier, [dict(crawl_id=cid, done=False, **i) for i in new_items])
        db.execute(update(Frontier).where(Frontier.crawl_id == cid, Frontier.url == url).values(done=True))
        db.commit()


def db_tick(cid: int, stats: dict) -> str:
    with SessionLocal() as db:
        c = db.get(Crawl, cid)
        c.stats = stats
        st = c.status
        db.commit()
        return st


def db_set_status(cid: int, status: str, **kw):
    with SessionLocal() as db:
        c = db.get(Crawl, cid)
        c.status = status
        for k, v in kw.items():
            setattr(c, k, v)
        db.commit()


# ------------------------------------------------------------------ engine
class CrawlEngine:
    def __init__(self, crawl_id: int):
        self.cid = crawl_id
        self.stopping = False
        self.busy: set = set()
        self.done_times = collections.deque(maxlen=200)
        self.recent = collections.deque(maxlen=15)
        self.next_slot: dict[str, float] = {}
        self.lock = asyncio.Lock()
        self.crawled = 0
        self.errors = 0

    # ---- helpers
    def norm(self, url, base=None):
        return normalize(url, base, self.cfg["param_mode"], self.cfg["strip_params"])

    def inc_ok(self, url: str) -> bool:
        if any(r.search(url) for r in self.exclude):
            return False
        return not self.include or any(r.search(url) for r in self.include)

    def add(self, url: str, depth: int, internal: bool, out: list, force_kind: str | None = None):
        if url in self.seen:
            return
        cfg = self.cfg
        if force_kind == "asset":
            if not cfg["discover_assets"] or not self.inc_ok(url):
                return
            if cfg["max_urls"] and self.accepted >= cfg["max_urls"]:
                return
            self.accepted += 1
            kind = "asset"
        elif internal:
            if not self.inc_ok(url):
                return
            if cfg["max_depth"] and depth > cfg["max_depth"]:
                return
            if cfg["max_urls"] and self.accepted >= cfg["max_urls"]:
                return
            self.accepted += 1
            kind = "internal"
        else:
            if not cfg["check_external"]:
                return
            kind = "external"
        self.seen.add(url)
        out.append(dict(url=url, depth=depth, kind=kind))

    async def throttle(self, host: str):
        delay = self.cfg["delay_ms"] / 1000
        if delay <= 0:
            return
        async with self.lock:
            now = time.monotonic()
            t = max(now, self.next_slot.get(host, 0))
            self.next_slot[host] = t + delay
        if t > now:
            await asyncio.sleep(t - now)

    async def fetch(self, url: str, method: str, internal: bool, read_body: bool) -> dict:
        cfg = self.cfg
        res = dict(status=0, headers={}, body=None, ctype=None, size=0, ms=0, error=None)
        for attempt in range(cfg["retries"] + 1):
            t0 = time.perf_counter()
            try:
                async with self.client.stream(method, url, follow_redirects=False,
                                              auth=self.auth if internal else None,
                                              headers=cfg["headers"] if internal else None) as r:
                    h = {k.lower(): v for k, v in r.headers.items()}
                    ctype = h.get("content-type", "").split(";")[0].strip().lower()
                    size = int(h.get("content-length") or 0) if (h.get("content-length") or "").isdigit() else 0
                    body = None
                    if read_body and "html" in ctype and 200 <= r.status_code < 300:
                        buf, limit = bytearray(), int(cfg["max_size_mb"] * 1024 * 1024)
                        async for chunk in r.aiter_bytes():
                            buf.extend(chunk)
                            if len(buf) > limit:
                                break
                        size = len(buf)
                        body = bytes(buf).decode(r.encoding or "utf-8", "replace")
                    ms = int((time.perf_counter() - t0) * 1000)
                    if r.status_code in (429, 503) and attempt < cfg["retries"]:
                        await asyncio.sleep(2 ** attempt)
                        continue
                    if method == "HEAD" and r.status_code in (403, 405, 501):
                        return await self.fetch(url, "GET", internal, False)
                    return dict(status=r.status_code, headers=h, body=body, ctype=ctype, size=size, ms=ms, error=None)
            except Exception as e:  # network/timeout/ssl
                res["error"] = f"{type(e).__name__}: {e}"[:300]
                res["ms"] = int((time.perf_counter() - t0) * 1000)
                if attempt < cfg["retries"]:
                    await asyncio.sleep(2 ** attempt)
        return res

    async def fetch_rendered(self, url: str) -> dict:
        cfg = self.cfg
        try:
            res = await self.renderer.render(url, wait_ms=cfg["js_wait_ms"], wait_selector=cfg["js_wait_selector"], timeout_s=cfg["timeout"])
            res["headers"] = {k.lower(): v for k, v in (res.get("headers") or {}).items()}
            return res
        except Exception as e:
            return dict(status=0, headers={}, body=None, ctype=None, size=0, ms=0, error=f"{type(e).__name__}: {e}"[:300])

    async def process(self, url: str, depth: int, kind: str):
        cfg = self.cfg
        is_page = kind == "internal"
        is_asset = kind == "asset"
        page = dict(url=url, depth=depth, is_internal=kind != "external")
        links, new = [], []
        try:
            if kind != "external" and cfg["respect_robots"] != "ignore" and not await self.robots.allowed(url):
                page["blocked_robots"] = True
                if cfg["respect_robots"] == "respect":
                    page.update(status_code=0, indexable=False, indexability_reason="Blocked by robots.txt", error="Blocked by robots.txt")
                    await asyncio.to_thread(db_save, self.cid, url, page, [], [])
                    self.note(url, 0)
                    return
            await self.throttle(host_of(url))
            use_js = is_page and cfg["render_js"] and self.renderer is not None
            if use_js:
                res = await self.fetch_rendered(url)
                page["rendered"] = True
            else:
                res = await self.fetch(url, "GET" if is_page else "HEAD", kind != "external", is_page)
            st, h = res["status"], res["headers"]
            page.update(status_code=st, content_type=res["ctype"], size=res["size"], response_ms=res["ms"], error=res["error"])
            page["resource_type"] = classify_resource_type(res["ctype"], url)
            if kind != "external":
                page["headers"] = h
                page["x_robots"] = h.get("x-robots-tag")
            loc = h.get("location")
            if 300 <= st < 400 and loc and kind != "external":
                tgt = self.norm(loc, url)
                page["redirect_url"] = tgt
                if tgt and cfg["mode"] != "list" and is_page:
                    self.add(tgt, depth + 1, is_internal(tgt, self.seed_key, cfg["crawl_subdomains"]), new)
            if res["body"] is not None and is_page:
                data = await asyncio.to_thread(extract, res["body"], url, cfg)
                lk, canon, asset_urls = data.pop("links"), data.pop("canonical_raw"), data.pop("asset_urls", [])
                page.update(data)
                page["canonical"] = self.norm(canon) if canon else None
                seen_l = set()
                for l in lk:
                    to = self.norm(l["href"])
                    if not to or (to, l["anchor"]) in seen_l:
                        continue
                    seen_l.add((to, l["anchor"]))
                    inter = is_internal(to, self.seed_key, cfg["crawl_subdomains"])
                    links.append(dict(to_url=to, anchor=l["anchor"], nofollow=l["nofollow"], is_internal=inter))
                    if cfg["mode"] == "spider" and (cfg["follow_nofollow"] or not l["nofollow"]):
                        self.add(to, depth + 1, inter, new)
                if cfg["mode"] != "spider" and cfg["check_external"]:
                    for l in links:
                        if not l["is_internal"]:
                            self.add(l["to_url"], depth + 1, False, new)
                for au in asset_urls:
                    to = self.norm(au)
                    if not to:
                        continue
                    if is_internal(to, self.seed_key, cfg["crawl_subdomains"]):
                        self.add(to, depth + 1, True, new, force_kind="asset")
                    elif cfg["check_external"]:
                        self.add(to, depth + 1, False, new)
                for k in ("rel_next", "rel_prev"):
                    if page.get(k):
                        page[k] = self.norm(page[k])
            # indexability only means anything for actual pages
            if is_page:
                mr = (page.get("meta_robots") or "") + " " + (page.get("x_robots") or "")
                reason = None
                if page.get("blocked_robots"):
                    reason = "Blocked by robots.txt"
                elif st == 0 or st >= 400:
                    reason = f"HTTP {st}" if st else "No response"
                elif 300 <= st < 400:
                    reason = "Redirected"
                elif "noindex" in mr.lower():
                    reason = "noindex"
                elif page.get("canonical") and page["canonical"] != url:
                    reason = "Canonicalised"
                page["indexable"], page["indexability_reason"] = reason is None, reason
            elif is_asset:
                page["indexable"] = st == 0 or (200 <= st < 400)
            await asyncio.to_thread(db_save, self.cid, url, page, links, new)
            for it in new:
                self.queue.put_nowait((it["url"], it["depth"], it["kind"]))
            self.note(url, st)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.exception("process failed %s", url)
            try:
                page.update(status_code=0, error=f"Internal error: {e}"[:300])
                await asyncio.to_thread(db_save, self.cid, url, page, [], [])
            except Exception:
                pass
            self.note(url, 0)

    def note(self, url, status):
        self.crawled += 1
        if status == 0 or status >= 400:
            self.errors += 1
        self.done_times.append(time.monotonic())
        self.recent.appendleft([url, status])

    async def worker(self):
        me = asyncio.current_task()
        while not self.stopping:
            url, depth, kind = await self.queue.get()
            if self.stopping:
                self.queue.task_done()
                break
            self.busy.add(me)
            try:
                await self.process(url, depth, kind)
            finally:
                self.busy.discard(me)
                self.queue.task_done()

    def stats(self) -> dict:
        now = time.monotonic()
        rate = sum(1 for t in self.done_times if now - t < 10) / 10
        return dict(crawled=self.crawled, queued=self.queue.qsize() + len(self.busy), errors=self.errors,
                    discovered=self.accepted, rate=round(rate, 1), elapsed=int(now - self.t0),
                    recent=list(self.recent), stop_reason=self.stop_reason)

    # ---- main
    async def run(self) -> str:
        st = await asyncio.to_thread(db_prepare, self.cid)
        cfg = self.cfg = st["config"]
        self.seed_key = host_key(st["host"])
        self.seen, self.accepted, self.stop_reason = st["seen"], st["accepted"], None
        self.crawled = st["crawled"]
        self.include = [re.compile(x) for x in cfg["include"] if x]
        self.exclude = [re.compile(x) for x in cfg["exclude"] if x]
        a = cfg["auth"]
        self.auth = httpx.BasicAuth(a["user"], a["password"]) if a.get("user") else None
        self.queue: asyncio.Queue = asyncio.Queue()
        self.t0 = time.monotonic()
        self.renderer: Renderer | None = None
        if cfg["render_js"]:
            self.renderer = Renderer(cfg["concurrency"], cfg["user_agent"])
            try:
                await self.renderer.start()
            except BrowserUnavailable as e:
                await asyncio.to_thread(db_set_status, self.cid, "failed", error=str(e), finished_at=datetime.utcnow())
                return "failed"
        limits = httpx.Limits(max_connections=cfg["concurrency"] * 2 + 2, max_keepalive_connections=cfg["concurrency"])
        headers = {"User-Agent": cfg["user_agent"], "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"}
        try:
            async with httpx.AsyncClient(headers=headers, timeout=cfg["timeout"], limits=limits, verify=cfg["verify_ssl"]) as client:
                self.client = client
                self.robots = Robots(client, cfg["user_agent"])
                if st["fresh"]:
                    await self.seed(st["seeds"])
                else:
                    for it in st["pending"]:
                        self.queue.put_nowait(it)
                workers = [asyncio.create_task(self.worker()) for _ in range(cfg["concurrency"])]
                joiner = asyncio.create_task(self.queue.join())
                state = "done"
                while not joiner.done():
                    await asyncio.sleep(1)
                    status = await asyncio.to_thread(db_tick, self.cid, self.stats())
                    if status == "pausing":
                        state = "pause"
                        break
                    if status == "stopping":
                        state = "stop"
                        break
                    lim = cfg["max_time_min"]
                    if lim and time.monotonic() - self.t0 > lim * 60:
                        self.stop_reason = f"time limit ({lim} min)"
                        break
                self.stopping = True
                joiner.cancel()
                deadline = time.monotonic() + 90
                while any(not w.done() for w in workers) and time.monotonic() < deadline:
                    for w in workers:
                        if not w.done() and w not in self.busy:
                            w.cancel()
                    await asyncio.sleep(0.3)
                for w in workers:
                    w.cancel()
                await asyncio.gather(*workers, return_exceptions=True)
        finally:
            if self.renderer:
                await self.renderer.stop()
        await asyncio.to_thread(db_tick, self.cid, self.stats())
        return state

    async def seed(self, seeds: list[str]):
        cfg = self.cfg
        items: list[dict] = []
        seed_urls = [u for u in (self.norm(clean_seed(s)) for s in seeds) if u]
        sm_urls: list[str] = []
        if seed_urls and (cfg["use_sitemap"] or cfg["mode"] == "sitemap"):
            origin = re.match(r"https?://[^/]+", seed_urls[0]).group(0)
            declared = await self.robots.sitemaps(seed_urls[0])
            found = await fetch_sitemap_urls(self.client, list(dict.fromkeys(declared + [origin + "/sitemap.xml"])))
            for u in found:
                n = self.norm(u)
                if n and is_internal(n, self.seed_key, cfg["crawl_subdomains"]):
                    sm_urls.append(n)
            sm_urls = list(dict.fromkeys(sm_urls))
            if sm_urls:
                await asyncio.to_thread(db_add_sitemap, self.cid, sm_urls)
        add = lambda u: (self.seen.add(u), items.append(dict(url=u, depth=0, kind="internal")), setattr(self, "accepted", self.accepted + 1))
        for u in seed_urls:
            if u not in self.seen:
                add(u)
        if cfg["mode"] in ("spider", "sitemap"):
            for u in sm_urls:
                if u not in self.seen and self.inc_ok(u) and not (cfg["max_urls"] and self.accepted >= cfg["max_urls"]):
                    add(u)
        if items:
            await asyncio.to_thread(db_add_frontier, self.cid, items)
        for it in items:
            self.queue.put_nowait((it["url"], 0, "internal"))
