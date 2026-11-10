import hashlib
import json
import re
from urllib.parse import urljoin, urlsplit
from selectolax.parser import HTMLParser

WS = re.compile(r"\s+")

_EXT_MAP = {
    "image": (".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".bmp", ".avif", ".tif", ".tiff"),
    "video": (".mp4", ".mov", ".webm", ".avi", ".mkv", ".m4v", ".ogv"),
    "audio": (".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"),
    "pdf": (".pdf",),
    "document": (".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv", ".zip", ".rar", ".7z", ".txt", ".rtf"),
    "stylesheet": (".css",),
    "script": (".js", ".mjs"),
    "font": (".woff", ".woff2", ".ttf", ".otf", ".eot"),
}


def simhash64(text: str) -> str | None:
    """A 64-bit SimHash over 4-word shingles, used for near-duplicate detection.
    Two pages with a small Hamming distance between their SimHashes have
    substantially similar body text even when not byte-identical."""
    tokens = re.findall(r"\w+", text.lower())
    if not tokens:
        return None
    shingles = {" ".join(tokens[i:i + 4]) for i in range(max(1, len(tokens) - 3))}
    weights = [0] * 64
    for sh in shingles:
        h = int(hashlib.md5(sh.encode("utf-8")).hexdigest(), 16)
        for b in range(64):
            weights[b] += 1 if (h >> b) & 1 else -1
    out = 0
    for b in range(64):
        if weights[b] > 0:
            out |= (1 << b)
    return format(out, "016x")


def classify_resource_type(content_type: str | None, url: str) -> str:
    ctype = (content_type or "").lower()
    path = urlsplit(url).path.lower()
    if ctype.startswith("text/html") or ctype.startswith("application/xhtml"):
        return "page"
    if ctype.startswith("image/"):
        return "image"
    if ctype.startswith("video/"):
        return "video"
    if ctype.startswith("audio/"):
        return "audio"
    if "pdf" in ctype:
        return "pdf"
    if ctype.startswith("text/css"):
        return "stylesheet"
    if "javascript" in ctype or "ecmascript" in ctype:
        return "script"
    if ctype.startswith("font/") or "font" in ctype:
        return "font"
    for kind, exts in _EXT_MAP.items():
        if path.endswith(exts):
            return kind
    if not ctype or ctype.startswith("text/plain"):
        # unknown / failed fetch — most of these came from <a> links, treat as a page
        return "page"
    return "other"


def _t(s):
    return WS.sub(" ", s or "").strip()


def extract(html: str, url: str, cfg: dict) -> dict:
    tree = HTMLParser(html)
    out: dict = {}
    ex = cfg.get("extract", {})

    tnode = tree.css_first("title")
    title = _t(tnode.text()) if tnode else ""
    out["title"], out["title_len"] = title, len(title)

    robots, og, canonical, nxt, prv, hreflang = [], {}, None, None, None, []
    desc = keywords = None
    for m in tree.css("meta"):
        a = m.attributes
        name = (a.get("name") or "").lower()
        prop = (a.get("property") or "").lower()
        content = a.get("content") or ""
        if name == "description" and desc is None:
            desc = _t(content)
        elif name == "keywords":
            keywords = _t(content)
        elif name in ("robots", "googlebot"):
            robots.append(content.lower())
        if prop.startswith("og:"):
            og[prop] = content[:300]
        elif name.startswith("twitter:"):
            og[name] = content[:300]
    out["meta_desc"] = desc
    out["meta_desc_len"] = len(desc) if desc else 0
    out["meta_keywords"] = keywords
    out["meta_robots"] = ", ".join(robots) or None
    out["og"] = og or None

    base = url
    b = tree.css_first("base[href]")
    if b:
        base = urljoin(url, b.attributes.get("href") or url)
    for l in tree.css("link[rel]"):
        a = l.attributes
        rel = (a.get("rel") or "").lower().split()
        href = a.get("href")
        if not href:
            continue
        full = urljoin(base, href)
        if "canonical" in rel and canonical is None:
            canonical = full
        elif "next" in rel:
            nxt = full
        elif "prev" in rel or "previous" in rel:
            prv = full
        elif "alternate" in rel and a.get("hreflang"):
            hreflang.append({"lang": a["hreflang"], "href": full})
    out["canonical_raw"], out["rel_next"], out["rel_prev"] = canonical, nxt, prv
    out["hreflang"] = hreflang or None
    out["hreflang_count"] = len(hreflang)
    root = tree.css_first("html")
    out["lang"] = (root.attributes.get("lang") if root else None)

    heads = []
    h1s = []
    for h in tree.css("h1,h2,h3,h4,h5,h6"):
        lvl = int(h.tag[1])
        heads.append(lvl)
        if lvl == 1:
            h1s.append(_t(h.text()))
    out["headings"] = heads[:300]
    out["h1"] = h1s[:10]
    out["h1_1"] = h1s[0] if h1s else None
    out["h1_count"] = len(h1s)
    out["h2_count"] = heads.count(2)

    imgs, missing_alt, missing_dims = [], 0, 0
    asset_urls: set[str] = set()
    if ex.get("images", True):
        for im in tree.css("img"):
            a = im.attributes
            src = a.get("src") or a.get("data-src")
            if "alt" not in a:
                missing_alt += 1
            if not (a.get("width") and a.get("height")):
                missing_dims += 1
            if src:
                asset_urls.add(urljoin(base, src.strip()))
            if len(imgs) < 200:
                imgs.append({"src": (src or "")[:300], "alt": a.get("alt")})
        out["images"] = imgs
    out["images_count"] = len(tree.css("img"))
    out["images_missing_alt"], out["images_missing_dims"] = missing_alt, missing_dims
    for sel in ("video source", "audio source", "video[src]", "audio[src]"):
        for n in tree.css(sel):
            src = n.attributes.get("src")
            if src:
                asset_urls.add(urljoin(base, src.strip()))
    out["asset_urls"] = list(asset_urls)[:500]

    links = []
    for a in tree.css("a[href]"):
        href = a.attributes.get("href")
        if not href:
            continue
        rel = (a.attributes.get("rel") or "").lower()
        anchor = _t(a.text())
        if not anchor:
            im = a.css_first("img")
            if im:
                anchor = "[img] " + _t(im.attributes.get("alt") or "")
        links.append({"href": urljoin(base, href.strip()), "anchor": anchor[:200], "nofollow": "nofollow" in rel})
    out["links"] = links

    mixed = []
    if url.startswith("https:"):
        for sel, attr in (("img", "src"), ("script", "src"), ("link[rel=stylesheet]", "href"), ("iframe", "src"), ("source", "src")):
            for n in tree.css(sel):
                v = n.attributes.get(attr) or ""
                if v.startswith("http://"):
                    mixed.append(v[:300])
    out["mixed_content"] = mixed[:20] or None
    out["mixed_count"] = len(mixed)

    if ex.get("structured_data", True):
        types, errors = [], 0
        for s in tree.css('script[type="application/ld+json"]'):
            try:
                data = json.loads(s.text() or "")
                items = data if isinstance(data, list) else data.get("@graph", [data]) if isinstance(data, dict) else []
                for it in items:
                    if isinstance(it, dict):
                        t = it.get("@type")
                        types.extend(t if isinstance(t, list) else [t or "?"])
            except Exception:
                errors += 1
        micro = [n.attributes.get("itemtype", "").rsplit("/", 1)[-1] for n in tree.css("[itemtype]")]
        out["structured"] = {"jsonld": types[:30], "jsonld_errors": errors, "microdata": micro[:30]}
        out["structured_count"] = len(types) + len(micro)
        out["structured_errors"] = errors

    custom = {}
    for rule in cfg.get("custom_extraction", []) or []:
        try:
            custom[rule["name"]] = _custom(rule, tree, html)
        except Exception as e:
            custom[rule["name"]] = f"error: {e}"
    for rule in cfg.get("custom_search", []) or []:
        try:
            pat = rule["text"] if rule.get("regex") else re.escape(rule["text"])
            custom["search:" + rule["name"]] = len(re.findall(pat, html, re.I))
        except Exception as e:
            custom["search:" + rule["name"]] = f"error: {e}"
    out["custom"] = custom or None

    tree.strip_tags(["script", "style", "noscript", "template"])
    text = _t(tree.body.text(separator=" ")) if tree.body else ""
    words = len(text.split())
    out["word_count"] = words
    out["text_ratio"] = round(len(text) / max(len(html), 1) * 100, 1)
    out["content_hash"] = hashlib.md5(text.lower().encode("utf-8", "ignore")).hexdigest() if words else None
    out["simhash"] = simhash64(text) if words else None
    return out


def _custom(rule, tree, html):
    kind, expr = rule.get("type", "css"), rule["expression"]
    if kind == "css":
        vals = []
        for n in tree.css(expr)[:20]:
            vals.append(n.attributes.get(rule["attr"], "") if rule.get("attr") else _t(n.text()))
        return " | ".join(v for v in vals if v)[:500]
    if kind == "regex":
        m = re.findall(expr, html)
        return " | ".join(x if isinstance(x, str) else x[0] for x in m[:20])[:500]
    if kind == "xpath":
        import lxml.html
        res = lxml.html.fromstring(html).xpath(expr)
        res = res if isinstance(res, list) else [res]
        return " | ".join(_t(r if isinstance(r, str) else r.text_content()) for r in res[:20])[:500]
    return ""
