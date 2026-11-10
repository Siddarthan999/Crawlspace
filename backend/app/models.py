from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, Float, DateTime, JSON, Index, ForeignKey
from .db import Base


def now():
    return datetime.utcnow()


class Domain(Base):
    __tablename__ = "domains"
    id = Column(Integer, primary_key=True)
    host = Column(String(255), unique=True, index=True)
    created_at = Column(DateTime, default=now)


class Crawl(Base):
    __tablename__ = "crawls"
    id = Column(Integer, primary_key=True)
    domain_id = Column(Integer, ForeignKey("domains.id"), index=True)
    # queued running pausing paused stopping stopped analyzing completed failed
    status = Column(String(20), index=True, default="queued")
    seeds = Column(JSON, default=list)
    config = Column(JSON, default=dict)
    checks_config = Column(JSON, default=dict)
    note = Column(Text, default="")
    created_at = Column(DateTime, default=now, index=True)
    started_at = Column(DateTime)
    finished_at = Column(DateTime)
    stats = Column(JSON, default=dict)
    health_score = Column(Float)
    error = Column(Text)


class Page(Base):
    __tablename__ = "pages"
    id = Column(Integer, primary_key=True)
    crawl_id = Column(Integer, index=True)
    url = Column(Text)
    is_internal = Column(Boolean, default=True)
    resource_type = Column(String(20), default="page", index=True)  # page|image|video|audio|pdf|document|stylesheet|script|font|other
    depth = Column(Integer)
    status_code = Column(Integer)
    content_type = Column(String(120))
    size = Column(Integer)
    response_ms = Column(Integer)
    redirect_url = Column(Text)
    redirect_chain = Column(JSON)
    redirect_hops = Column(Integer, default=0)
    indexable = Column(Boolean, default=True)
    indexability_reason = Column(String(80))
    blocked_robots = Column(Boolean, default=False)
    error = Column(Text)
    title = Column(Text)
    title_len = Column(Integer)
    meta_desc = Column(Text)
    meta_desc_len = Column(Integer)
    meta_keywords = Column(Text)
    h1_1 = Column(Text)
    h1_count = Column(Integer)
    h2_count = Column(Integer)
    h1 = Column(JSON)
    headings = Column(JSON)
    word_count = Column(Integer)
    text_ratio = Column(Float)
    content_hash = Column(String(32))
    simhash = Column(String(16))
    canonical = Column(Text)
    meta_robots = Column(String(200))
    x_robots = Column(String(200))
    lang = Column(String(40))
    rel_next = Column(Text)
    rel_prev = Column(Text)
    og = Column(JSON)
    hreflang = Column(JSON)
    hreflang_count = Column(Integer, default=0)
    structured = Column(JSON)
    structured_count = Column(Integer, default=0)
    structured_errors = Column(Integer, default=0)
    images = Column(JSON)
    images_count = Column(Integer, default=0)
    images_missing_alt = Column(Integer, default=0)
    images_missing_dims = Column(Integer, default=0)
    mixed_content = Column(JSON)
    mixed_count = Column(Integer, default=0)
    custom = Column(JSON)
    headers = Column(JSON)
    inlinks = Column(Integer, default=0)
    unique_inlinks = Column(Integer, default=0)
    outlinks = Column(Integer, default=0)
    external_outlinks = Column(Integer, default=0)
    link_score = Column(Float)
    in_sitemap = Column(Boolean, default=False)
    rendered = Column(Boolean, default=False)
    fetched_at = Column(DateTime, default=now)
    __table_args__ = (Index("ix_pages_crawl_url", "crawl_id", "url"),)


class Link(Base):
    __tablename__ = "links"
    id = Column(Integer, primary_key=True)
    crawl_id = Column(Integer, index=True)
    from_page_id = Column(Integer, index=True)
    to_page_id = Column(Integer, index=True)
    from_url = Column(Text)
    to_url = Column(Text)
    anchor = Column(Text)
    nofollow = Column(Boolean, default=False)
    is_internal = Column(Boolean, default=True)


class Issue(Base):
    __tablename__ = "issues"
    id = Column(Integer, primary_key=True)
    crawl_id = Column(Integer)
    page_id = Column(Integer, index=True)
    url = Column(Text)
    check_id = Column(String(80))
    category = Column(String(40))
    severity = Column(String(10))
    message = Column(Text)
    details = Column(JSON)
    __table_args__ = (Index("ix_issues_crawl_check", "crawl_id", "check_id"),)


class Frontier(Base):
    __tablename__ = "frontier"
    id = Column(Integer, primary_key=True)
    crawl_id = Column(Integer)
    url = Column(String(2048))
    depth = Column(Integer, default=0)
    kind = Column(String(10), default="internal")  # internal | external
    done = Column(Boolean, default=False)
    __table_args__ = (Index("ix_frontier_crawl_url", "crawl_id", "url"), Index("ix_frontier_crawl_done", "crawl_id", "done"))


class SitemapUrl(Base):
    __tablename__ = "sitemap_urls"
    id = Column(Integer, primary_key=True)
    crawl_id = Column(Integer, index=True)
    url = Column(Text)


class Preset(Base):
    __tablename__ = "presets"
    id = Column(Integer, primary_key=True)
    name = Column(String(80), unique=True)
    config = Column(JSON, default=dict)
    checks_config = Column(JSON, default=dict)
    created_at = Column(DateTime, default=now)


class LighthouseRun(Base):
    __tablename__ = "lighthouse_runs"
    id = Column(Integer, primary_key=True)
    url = Column(Text)
    strategy = Column(String(10), default="mobile")  # mobile | desktop
    status = Column(String(20), default="running", index=True)  # running | completed | failed
    scores = Column(JSON)   # {performance, accessibility, best_practices, seo} 0-100
    metrics = Column(JSON)  # {lcp_ms, cls, tbt_ms, fcp_ms, si_ms, inp_ms?}
    field_data = Column(JSON)  # real-world CrUX data, when Google has enough traffic data for the URL
    error = Column(Text)
    error_kind = Column(String(20))  # quota_no_key | quota_with_key | other — lets the UI show a targeted fix
    created_at = Column(DateTime, default=now, index=True)
    finished_at = Column(DateTime)


class OutlinkRun(Base):
    """One on-demand scan of every link found on a single page."""
    __tablename__ = "outlink_runs"
    id = Column(Integer, primary_key=True)
    url = Column(Text)
    host = Column(String(255), index=True)
    status = Column(String(20), index=True, default="running")  # running | completed | failed
    error = Column(Text)
    total = Column(Integer, default=0)
    checked = Column(Integer, default=0)
    include_internal = Column(Boolean, default=True)
    summary = Column(JSON)
    results = Column(JSON)
    created_at = Column(DateTime, default=now, index=True)
    finished_at = Column(DateTime)


class BacklinkLookup(Base):
    __tablename__ = "backlink_lookups"
    id = Column(Integer, primary_key=True)
    target = Column(Text)
    host = Column(String(255), index=True)
    path = Column(Text)
    status = Column(String(20), default="completed")
    error = Column(Text)
    providers = Column(JSON)   # per-provider outcome: {local: {ok, count, error}, bing: {...}, ...}
    summary = Column(JSON)
    results = Column(JSON)
    created_at = Column(DateTime, default=now, index=True)


class GscAccount(Base):
    """The single connected Google account (this is a single-user tool)."""
    __tablename__ = "gsc_accounts"
    id = Column(Integer, primary_key=True)
    email = Column(String(255))
    access_token = Column(Text)
    refresh_token = Column(Text)
    expires_at = Column(DateTime)
    scope = Column(Text)
    created_at = Column(DateTime, default=now)


class Schedule(Base):
    __tablename__ = "schedules"
    id = Column(Integer, primary_key=True)
    domain_id = Column(Integer, index=True)
    seeds = Column(JSON, default=list)
    config = Column(JSON, default=dict)
    checks_config = Column(JSON, default=dict)
    every_hours = Column(Integer, default=24)
    next_run_at = Column(DateTime)
    enabled = Column(Boolean, default=True)
    last_crawl_id = Column(Integer)
