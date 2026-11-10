from typing import Optional
from urllib.parse import urlsplit
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy import select, func, or_
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Page, Link, Issue

router = APIRouter(prefix="/api/crawls/{cid}", tags=["pages"])

FILTER_PRESETS = {
    "all": lambda q: q,
    "indexable": lambda q: q.where(Page.indexable == True),  # noqa: E712
    "non_indexable": lambda q: q.where(Page.indexable == False),  # noqa: E712
    "4xx": lambda q: q.where(Page.status_code.between(400, 499)),
    "5xx": lambda q: q.where(Page.status_code.between(500, 599)),
    "redirects": lambda q: q.where(Page.status_code.between(300, 399)),
    "no_response": lambda q: q.where(Page.status_code.is_(None) | (Page.status_code == 0)),
    "missing_title": lambda q: q.where(or_(Page.title.is_(None), Page.title == "")),
    "missing_meta": lambda q: q.where(or_(Page.meta_desc.is_(None), Page.meta_desc == "")),
    "missing_h1": lambda q: q.where((Page.h1_count.is_(None)) | (Page.h1_count == 0)),
    "missing_canonical": lambda q: q.where(Page.canonical.is_(None)),
    "external": lambda q: q.where(Page.is_internal == False),  # noqa: E712
    "in_sitemap": lambda q: q.where(Page.in_sitemap == True),  # noqa: E712
    "orphans": lambda q: q.where(Page.inlinks == 0, Page.depth > 0, Page.resource_type == "page"),
    "images": lambda q: q.where(Page.resource_type == "image"),
    "videos": lambda q: q.where(Page.resource_type.in_(["video", "audio"])),
    "pdfs": lambda q: q.where(Page.resource_type == "pdf"),
    "documents": lambda q: q.where(Page.resource_type == "document"),
    "other_assets": lambda q: q.where(Page.resource_type.in_(["stylesheet", "script", "font", "other"])),
}

SORTABLE = {"url", "status_code", "depth", "title_len", "meta_desc_len", "word_count",
            "inlinks", "outlinks", "response_ms", "size", "h1_count", "fetched_at"}


@router.get("/pages")
def list_pages(cid: int, filter: str = "all", resource_type: Optional[str] = None, search: Optional[str] = None,
               sort: str = "url", dir: str = "asc", limit: int = 100, offset: int = 0,
               db: Session = Depends(get_db)):
    stmt = select(Page).where(Page.crawl_id == cid)
    if resource_type:
        types = [t.strip() for t in resource_type.split(",") if t.strip()]
        if types:
            stmt = stmt.where(Page.resource_type.in_(types))
    stmt = FILTER_PRESETS.get(filter, FILTER_PRESETS["all"])(stmt)
    if search:
        stmt = stmt.where(or_(Page.url.ilike(f"%{search}%"), Page.title.ilike(f"%{search}%")))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    col = getattr(Page, sort if sort in SORTABLE else "url")
    col = col.desc() if dir == "desc" else col.asc()
    rows = db.execute(stmt.order_by(col).limit(min(limit, 1000)).offset(offset)).scalars().all()
    items = [dict(id=p.id, url=p.url, status_code=p.status_code, indexable=p.indexable,
                   indexability_reason=p.indexability_reason, depth=p.depth, title=p.title,
                   title_len=p.title_len, meta_desc_len=p.meta_desc_len, h1_count=p.h1_count,
                   word_count=p.word_count, canonical=p.canonical, inlinks=p.inlinks, outlinks=p.outlinks,
                   response_ms=p.response_ms, size=p.size, content_type=p.content_type,
                   redirect_url=p.redirect_url, in_sitemap=p.in_sitemap, is_internal=p.is_internal,
                   resource_type=p.resource_type, rendered=p.rendered,
                   error=p.error) for p in rows]
    return dict(total=total, items=items)


@router.get("/resource-counts")
def resource_counts(cid: int, db: Session = Depends(get_db)):
    rows = db.execute(select(Page.resource_type, func.count()).where(Page.crawl_id == cid).group_by(Page.resource_type)).all()
    return {rt or "other": n for rt, n in rows}


@router.get("/pages/{page_id}")
def page_detail(cid: int, page_id: int, db: Session = Depends(get_db)):
    p = db.get(Page, page_id)
    if not p or p.crawl_id != cid:
        raise HTTPException(404, "Page not found")
    inlinks = db.execute(select(Link.from_url, Link.anchor, Link.nofollow)
                          .where(Link.crawl_id == cid, Link.to_url == p.url).limit(200)).all()
    outlinks = db.execute(select(Link.to_url, Link.anchor, Link.nofollow, Link.is_internal)
                           .where(Link.crawl_id == cid, Link.from_page_id == p.id).limit(500)).all()
    issues = db.execute(select(Issue).where(Issue.crawl_id == cid, Issue.page_id == p.id)).scalars().all()
    data = {k: v for k, v in p.__dict__.items() if not k.startswith("_sa")}
    data["inlinks_list"] = [dict(url=i[0], anchor=i[1], nofollow=i[2]) for i in inlinks]
    data["outlinks_list"] = [dict(url=o[0], anchor=o[1], nofollow=o[2], internal=o[3]) for o in outlinks]
    data["issues"] = [dict(id=i.id, check_id=i.check_id, category=i.category, severity=i.severity,
                            message=i.message, details=i.details) for i in issues]
    return data


@router.get("/url-tree")
def url_tree(cid: int, db: Session = Depends(get_db)):
    """
    Groups every crawled page by its URL path segments into a left-to-right tree
    (e.g. /resources/guide-1 branches under a "resources" node), rather than the
    actual hyperlink graph — this is what makes it read as site architecture
    instead of a tangled mess of links.
    """
    rows = db.execute(
        select(Page.id, Page.url, Page.status_code, Page.title, Page.indexable)
        .where(Page.crawl_id == cid, Page.resource_type == "page")
        .order_by(Page.url)
    ).all()
    if not rows:
        return None

    host = urlsplit(rows[0][1]).hostname or "site"
    root = {"name": host, "path": "/", "children": {}, "page": None}

    for pid, url, status, title, indexable in rows:
        segments = [s for s in urlsplit(url).path.split("/") if s]
        node = root
        cur = ""
        for seg in segments:
            cur += "/" + seg
            if seg not in node["children"]:
                node["children"][seg] = {"name": seg, "path": cur, "children": {}, "page": None}
            node = node["children"][seg]
        page_info = {"id": pid, "url": url, "status": status, "title": title, "indexable": indexable}
        if segments:
            node["page"] = page_info
        else:
            root["page"] = page_info  # the homepage itself

    MAX_NODES = 2500

    def finalize(node, budget):
        kids_raw = sorted(node["children"].values(), key=lambda n: n["name"])
        kids, truncated = [], 0
        for k in kids_raw:
            if budget[0] <= 0:
                truncated += 1
                continue
            budget[0] -= 1
            kids.append(finalize(k, budget))
        count = (1 if node["page"] else 0) + sum(k["count"] for k in kids)
        out = {"name": node["name"], "path": node["path"], "page": node["page"], "children": kids, "count": count}
        if truncated:
            out["truncated"] = truncated
        return out

    budget = [MAX_NODES]
    return finalize(root, budget)


@router.get("/link-graph")
def link_graph(cid: int, limit: int = 500, db: Session = Depends(get_db)):
    pages = db.execute(select(Page.id, Page.url, Page.depth, Page.status_code, Page.inlinks)
                        .where(Page.crawl_id == cid, Page.is_internal == True)  # noqa: E712
                        .order_by(Page.inlinks.desc()).limit(limit)).all()
    ids = {p[0] for p in pages}
    links = db.execute(select(Link.from_page_id, Link.to_page_id)
                        .where(Link.crawl_id == cid, Link.is_internal == True,  # noqa: E712
                               Link.from_page_id.in_(ids), Link.to_page_id.in_(ids))).all()
    nodes = [dict(id=p[0], url=p[1], depth=p[2], status=p[3], inlinks=p[4]) for p in pages]
    edges = [dict(source=l[0], target=l[1]) for l in links if l[1] is not None]
    return dict(nodes=nodes, edges=edges)
