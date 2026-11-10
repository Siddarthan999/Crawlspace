import re
from collections import defaultdict
from sqlalchemy import select, delete, update

from ..db import SessionLocal
from ..models import Page, Link, Issue, SitemapUrl, Crawl
from . import registry
from .checks import onpage, responses, links_content  # noqa: F401  (registers checks)
from .scoring import health_score

GENERIC_ANCHORS = {"click here", "here", "read more", "more", "link", "this page", "learn more"}


def run_analysis(crawl_id: int):
    with SessionLocal() as db:
        crawl = db.get(Crawl, crawl_id)
        checks_cfg = crawl.checks_config or registry.default_checks_config()
        enabled = registry.enabled_ids(checks_cfg)

        pages = [dict(row.__dict__) for row in db.execute(select(Page).where(Page.crawl_id == crawl_id)).scalars()]
        for p in pages:
            p.pop("_sa_instance_state", None)
        by_url = {p["url"]: p for p in pages}

        links = db.execute(select(Link.from_url, Link.to_url, Link.anchor, Link.nofollow, Link.is_internal)
                            .where(Link.crawl_id == crawl_id)).all()

        # backfill Link.to_page_id now that every page is known (used by the link-graph view)
        id_by_url = {p["url"]: p["id"] for p in pages}
        link_rows = db.execute(select(Link.id, Link.to_url).where(Link.crawl_id == crawl_id, Link.to_page_id.is_(None))).all()
        updates = [{"id": lid, "to_page_id": id_by_url[to_url]} for lid, to_url in link_rows if to_url in id_by_url]
        if updates:
            db.bulk_update_mappings(Link, updates)
        db.commit()
        sitemap_urls = {r[0] for r in db.execute(select(SitemapUrl.url).where(SitemapUrl.crawl_id == crawl_id)).all()}

        # ---- link aggregation: inlinks, anchor quality, links-to-redirect/noindex, hreflang matrix
        inlink_sets = defaultdict(set)
        outlink_count, ext_out_count = defaultdict(int), defaultdict(int)
        empty_anchor, generic_anchor, to_redirect, to_noindex = defaultdict(int), defaultdict(int), defaultdict(int), defaultdict(int)
        for frm, to, anchor, nofollow, internal in links:
            if internal:
                outlink_count[frm] += 1
                inlink_sets[to].add(frm)
                a = (anchor or "").strip().lower()
                if not a:
                    empty_anchor[frm] += 1
                elif a in GENERIC_ANCHORS:
                    generic_anchor[frm] += 1
                tgt = by_url.get(to)
                if tgt:
                    if tgt.get("redirect_url") or (300 <= (tgt.get("status_code") or 0) < 400):
                        to_redirect[frm] += 1
                    elif tgt.get("indexable") is False:
                        to_noindex[frm] += 1
            else:
                ext_out_count[frm] += 1

        hreflang_targets = defaultdict(set)  # url -> set of langs pointing AT it
        for p in pages:
            for h in (p.get("hreflang") or []):
                hreflang_targets[h["href"]].add(p["url"])

        for p in pages:
            u = p["url"]
            p["inlinks"] = len(inlink_sets.get(u, ()))
            p["unique_inlinks"] = p["inlinks"]
            p["outlinks"] = outlink_count.get(u, 0)
            p["external_outlinks"] = ext_out_count.get(u, 0)
            p["in_sitemap"] = u in sitemap_urls
            p["_empty_anchor_count"] = empty_anchor.get(u, 0)
            p["_generic_anchor_count"] = generic_anchor.get(u, 0)
            p["_links_to_redirect"] = to_redirect.get(u, 0)
            p["_links_to_noindex"] = to_noindex.get(u, 0)
            missing = []
            for h in (p.get("hreflang") or []):
                if u not in hreflang_targets.get(h["href"], ()) and by_url.get(h["href"]):
                    missing.append(h["href"])
            p["_hreflang_missing_return"] = missing
            if p.get("canonical") and p["canonical"] != u:
                tgt = by_url.get(p["canonical"])
                p["_canon_target_status"] = tgt["status_code"] if tgt else None
            # simple redirect loop check
            seen, cur, loop = set(), u, False
            for _ in range(10):
                nxt = by_url.get(cur, {}).get("redirect_url")
                if not nxt:
                    break
                if nxt in seen or nxt == u:
                    loop = True
                    break
                seen.add(nxt)
                cur = nxt
            p["_redirect_loop"] = loop

        # persist aggregated link stats back to pages table
        db.execute(delete(Issue).where(Issue.crawl_id == crawl_id))
        for p in pages:
            db.execute(update(Page).where(Page.id == p["id"]).values(
                inlinks=p["inlinks"], unique_inlinks=p["unique_inlinks"], outlinks=p["outlinks"],
                external_outlinks=p["external_outlinks"], in_sitemap=p["in_sitemap"]))
        db.commit()

        # ---- run checks
        all_issues: list[dict] = []
        for cid, cdef in registry.CHECKS.items():
            if cid not in enabled:
                continue
            fn = _FUNCS[cid]
            params = {**cdef.params, **{k: v for k, v in (checks_cfg.get(cid) or {}).items() if k != "enabled"}}
            if cdef.scope == "page":
                for p in pages:
                    res = fn(p, params)
                    if res:
                        all_issues.append(res)
            else:
                res = fn(pages, params)
                all_issues.extend(res or [])

        db.bulk_insert_mappings(Issue, [dict(crawl_id=crawl_id, **i) for i in all_issues])

        sev_counts = defaultdict(int)
        for i in all_issues:
            sev_counts[i["severity"]] += 1
        score = health_score(len(pages), sev_counts)

        status_dist, ctype_dist, depth_dist = defaultdict(int), defaultdict(int), defaultdict(int)
        indexable = 0
        for p in pages:
            status_dist[str(p.get("status_code") or "error")] += 1
            ctype_dist[(p.get("content_type") or "unknown").split(";")[0]] += 1
            depth_dist[str(p.get("depth") if p.get("depth") is not None else "?")] += 1
            indexable += bool(p.get("indexable"))

        stats = dict(crawl.stats or {})
        stats.update(
            total_pages=len(pages), indexable=indexable, non_indexable=len(pages) - indexable,
            issues_total=len(all_issues), issues_by_severity=dict(sev_counts),
            status_dist=dict(status_dist), content_type_dist=dict(ctype_dist), depth_dist=dict(depth_dist),
            avg_response_ms=round(sum(p.get("response_ms") or 0 for p in pages) / max(len(pages), 1)),
        )
        crawl.stats = stats
        crawl.health_score = score
        db.commit()
        return dict(score=score, issues=len(all_issues))


# map "a.b" -> function object, built once at import
_FUNCS = {}


def _collect():
    import inspect
    for mod in (onpage, responses, links_content):
        for name, fn in inspect.getmembers(mod, inspect.isfunction):
            cid = getattr(fn, "_check_id", None)
            if cid:
                _FUNCS[cid] = fn


_collect()
