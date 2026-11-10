import re
from urllib.parse import urlsplit, urljoin, quote, parse_qsl, urlencode

_SAFE_PATH = "/%:@!$&'()*+,;=-._~"
_SKIP = ("javascript:", "mailto:", "tel:", "data:", "sms:", "whatsapp:", "ftp:", "file:")


def clean_seed(s: str) -> str:
    s = s.strip()
    if s and not re.match(r"^https?://", s, re.I):
        s = "https://" + s
    return s


def normalize(url: str | None, base: str | None = None, param_mode: str = "crawl", strip_params=None) -> str | None:
    if not url:
        return None
    url = url.strip()
    if url.lower().startswith(_SKIP) or url.startswith("#"):
        return None
    try:
        if base:
            url = urljoin(base, url)
        s = urlsplit(url)
        if s.scheme not in ("http", "https") or not s.hostname:
            return None
        host = s.hostname.lower().encode("idna").decode()
        port = s.port
    except (ValueError, UnicodeError):
        return None
    netloc = host
    if port and not ((s.scheme == "http" and port == 80) or (s.scheme == "https" and port == 443)):
        netloc += f":{port}"
    path = quote(s.path or "/", safe=_SAFE_PATH)
    query = ""
    if s.query and param_mode != "ignore":
        pairs = parse_qsl(s.query, keep_blank_values=True)
        if strip_params:
            drop = {p.lower() for p in strip_params}
            pairs = [(k, v) for k, v in pairs if k.lower() not in drop]
        query = urlencode(pairs, quote_via=quote, safe="/:@,")
    out = f"{s.scheme}://{netloc}{path}" + (f"?{query}" if query else "")
    return out if len(out) <= 2000 else None


def host_key(host: str) -> str:
    host = (host or "").lower()
    return host[4:] if host.startswith("www.") else host


def host_of(url: str) -> str:
    return urlsplit(url).hostname or ""


def is_internal(url: str, seed_host_key: str, subdomains: bool) -> bool:
    k = host_key(host_of(url))
    return k == seed_host_key or (subdomains and k.endswith("." + seed_host_key))
