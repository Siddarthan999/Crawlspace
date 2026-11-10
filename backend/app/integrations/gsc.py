"""
Google Search Console, end to end: OAuth 2.0 (authorization-code flow with offline access),
automatic token refresh, and the handful of API calls the app needs.

Why OAuth rather than a service account: a service account has to be added as a user on every
property by hand. With OAuth you click "Connect Google", approve once, and every property your
Google account can see shows up.
"""
import asyncio
import base64
import json
import secrets
import time
from datetime import date, datetime, timedelta
from urllib.parse import quote, urlencode, urlsplit

import httpx
from sqlalchemy import delete, select

from .. import config
from ..crawler.normalize import host_key
from ..db import SessionLocal
from ..models import GscAccount

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
API = "https://www.googleapis.com/webmasters/v3"
INSPECT_URL = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect"
# readonly is all we ever need — this app never changes anything in your Search Console.
SCOPES = "https://www.googleapis.com/auth/webmasters.readonly openid email"

_states: dict[str, float] = {}
_cache: dict[tuple, tuple[float, dict]] = {}
CACHE_TTL = 300


class GscError(Exception):
    def __init__(self, message: str, status: int = 400, code: str = "error"):
        super().__init__(message)
        self.message, self.status, self.code = message, status, code


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=30)


def is_configured() -> bool:
    return bool(config.GSC_CLIENT_ID and config.GSC_CLIENT_SECRET)


# ------------------------------------------------------------------ OAuth
def build_auth_url() -> str:
    if not is_configured():
        raise GscError("GSC_CLIENT_ID and GSC_CLIENT_SECRET are not set.", 400, "not_configured")
    now = time.time()
    for k in [k for k, exp in _states.items() if exp < now]:
        _states.pop(k, None)
    state = secrets.token_urlsafe(24)
    _states[state] = now + 600
    return AUTH_URL + "?" + urlencode(dict(
        client_id=config.GSC_CLIENT_ID, redirect_uri=config.GSC_REDIRECT_URI, response_type="code",
        scope=SCOPES, access_type="offline", prompt="consent", include_granted_scopes="true", state=state))


def consume_state(state: str | None) -> bool:
    exp = _states.pop(state or "", None)
    return bool(exp and exp >= time.time())


def _email_from_id_token(id_token: str | None) -> str | None:
    try:
        payload = (id_token or "").split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload)).get("email")
    except Exception:  # noqa: BLE001 — the email is cosmetic; never fail a connect over it
        return None


def _get_account() -> GscAccount | None:
    with SessionLocal() as db:
        return db.execute(select(GscAccount).order_by(GscAccount.id.desc())).scalars().first()


def _store_tokens(email, access_token, refresh_token, expires_in, scope):
    with SessionLocal() as db:
        acc = db.execute(select(GscAccount).order_by(GscAccount.id.desc())).scalars().first() or GscAccount()
        if email:
            acc.email = email
        acc.access_token = access_token
        if refresh_token:
            acc.refresh_token = refresh_token
        acc.expires_at = datetime.utcnow() + timedelta(seconds=max(60, int(expires_in) - 30))
        acc.scope = scope
        db.add(acc)
        db.commit()


def _clear_account():
    with SessionLocal() as db:
        db.execute(delete(GscAccount))
        db.commit()
    _cache.clear()


def status() -> dict:
    acc = _get_account()
    return dict(configured=is_configured(), connected=bool(acc and acc.refresh_token),
                email=acc.email if acc else None, redirect_uri=config.GSC_REDIRECT_URI)


async def disconnect():
    await asyncio.to_thread(_clear_account)


async def exchange_code(code: str):
    async with _client() as c:
        r = await c.post(TOKEN_URL, data=dict(
            code=code, client_id=config.GSC_CLIENT_ID, client_secret=config.GSC_CLIENT_SECRET,
            redirect_uri=config.GSC_REDIRECT_URI, grant_type="authorization_code"))
    data = r.json() if r.content else {}
    if r.status_code != 200 or "access_token" not in data:
        raise GscError(data.get("error_description") or data.get("error") or "Google rejected the sign-in", 400)
    if "webmasters.readonly" not in (data.get("scope") or ""):
        raise GscError("Search Console access wasn't granted — tick the Search Console permission on the consent screen.", 400)
    await asyncio.to_thread(_store_tokens, _email_from_id_token(data.get("id_token")), data["access_token"],
                            data.get("refresh_token"), data.get("expires_in", 3600), data.get("scope"))


async def access_token() -> str:
    acc = await asyncio.to_thread(_get_account)
    if not acc or not acc.refresh_token:
        raise GscError("Not connected to Google Search Console.", 401, "not_connected")
    if acc.access_token and acc.expires_at and acc.expires_at > datetime.utcnow() + timedelta(seconds=30):
        return acc.access_token
    async with _client() as c:
        r = await c.post(TOKEN_URL, data=dict(
            client_id=config.GSC_CLIENT_ID, client_secret=config.GSC_CLIENT_SECRET,
            refresh_token=acc.refresh_token, grant_type="refresh_token"))
    data = r.json() if r.content else {}
    if r.status_code != 200:
        if data.get("error") == "invalid_grant":
            # Happens when the token was revoked, or after 7 days if the OAuth app is still in "Testing".
            await asyncio.to_thread(_clear_account)
            raise GscError("Google rejected the saved login — it expired or was revoked. Please reconnect.", 401, "reauth")
        raise GscError(data.get("error_description") or "Could not refresh the Google login", 502)
    await asyncio.to_thread(_store_tokens, None, data["access_token"], data.get("refresh_token"),
                            data.get("expires_in", 3600), data.get("scope"))
    return data["access_token"]


async def _request(method: str, url: str, **kw) -> dict:
    token = await access_token()
    async with _client() as c:
        r = await c.request(method, url, headers={"Authorization": f"Bearer {token}"}, **kw)
    if r.status_code >= 400:
        msg = ""
        try:
            err = r.json().get("error")
            msg = err.get("message", "") if isinstance(err, dict) else str(err or "")
        except Exception:  # noqa: BLE001
            msg = r.text[:200]
        if r.status_code == 401:
            raise GscError("Google rejected the access token — try reconnecting.", 401, "reauth")
        if r.status_code == 403:
            raise GscError(msg or "Your Google account doesn't have access to that property.", 403, "forbidden")
        raise GscError(msg or f"Google API returned HTTP {r.status_code}", r.status_code if r.status_code < 500 else 502)
    return r.json() if r.content else {}


# ------------------------------------------------------------------ data
def property_host(site_url: str) -> str:
    if site_url.startswith("sc-domain:"):
        return host_key(site_url[len("sc-domain:"):].lower())
    return host_key((urlsplit(site_url).hostname or "").lower())


async def list_sites() -> list[dict]:
    data = await _request("GET", f"{API}/sites")
    sites = [dict(site_url=e["siteUrl"], permission=e.get("permissionLevel"), host=property_host(e["siteUrl"]))
             for e in data.get("siteEntry", [])]
    return sorted(sites, key=lambda s: (s["host"], s["site_url"]))


async def search_analytics(site_url: str, start: str, end: str, dimensions: list[str], row_limit: int = 1000) -> list[dict]:
    body = dict(startDate=start, endDate=end, dimensions=dimensions, rowLimit=row_limit)
    data = await _request("POST", f"{API}/sites/{quote(site_url, safe='')}/searchAnalytics/query", json=body)
    return data.get("rows", [])


def _date_ranges(days: int):
    end = date.today() - timedelta(days=2)  # Search Console data trails by ~2 days
    start = end - timedelta(days=days - 1)
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=days - 1)
    return start, end, prev_start, prev_end


def _fill(rows: list[dict], start: date, end: date) -> list[dict]:
    by = {r["keys"][0]: r for r in rows}
    out, d = [], start
    while d <= end:
        r = by.get(d.isoformat())
        out.append(dict(date=d.isoformat(), clicks=r["clicks"] if r else 0, impressions=r["impressions"] if r else 0,
                        ctr=r["ctr"] if r else 0, position=r["position"] if r else None))
        d += timedelta(days=1)
    return out


def _totals(series: list[dict]) -> dict:
    clicks = sum(s["clicks"] for s in series)
    imps = sum(s["impressions"] for s in series)
    pos = sum((s["position"] or 0) * s["impressions"] for s in series) / imps if imps else None
    return dict(clicks=clicks, impressions=imps, ctr=clicks / imps if imps else 0, position=pos)


def _table(rows: list[dict]) -> list[dict]:
    return [dict(key=r["keys"][0], clicks=r["clicks"], impressions=r["impressions"], ctr=r["ctr"], position=r["position"])
            for r in rows]


async def overview(site_url: str, days: int = 28, refresh: bool = False) -> dict:
    days = days if days in (7, 28, 90, 180) else 28
    key = ("overview", site_url, days)
    hit = _cache.get(key)
    if hit and not refresh and hit[0] > time.time():
        return hit[1]
    start, end, pstart, pend = _date_ranges(days)
    s, e, ps, pe = (d.isoformat() for d in (start, end, pstart, pend))
    cur, prev, queries, pages, countries, devices = await asyncio.gather(
        search_analytics(site_url, s, e, ["date"]),
        search_analytics(site_url, ps, pe, ["date"]),
        search_analytics(site_url, s, e, ["query"], 25),
        search_analytics(site_url, s, e, ["page"], 25),
        search_analytics(site_url, s, e, ["country"], 10),
        search_analytics(site_url, s, e, ["device"], 5),
    )
    series, pseries = _fill(cur, start, end), _fill(prev, pstart, pend)
    data = dict(site_url=site_url, days=days,
                range=dict(start=s, end=e, prev_start=ps, prev_end=pe),
                totals=_totals(series), previous=_totals(pseries), series=series, previous_series=pseries,
                queries=_table(queries), pages=_table(pages), countries=_table(countries), devices=_table(devices))
    _cache[key] = (time.time() + CACHE_TTL, data)
    return data


async def top_pages(site_url: str, days: int = 28, limit: int = 200) -> list[dict]:
    start, end, _, _ = _date_ranges(days)
    return _table(await search_analytics(site_url, start.isoformat(), end.isoformat(), ["page"], limit))


async def inspect_url(site_url: str, url: str) -> dict:
    data = await _request("POST", INSPECT_URL, json=dict(inspectionUrl=url, siteUrl=site_url))
    res = data.get("inspectionResult", {})
    idx = res.get("indexStatusResult", {})
    return dict(
        url=url, verdict=idx.get("verdict"), coverage_state=idx.get("coverageState"),
        robots_txt_state=idx.get("robotsTxtState"), indexing_state=idx.get("indexingState"),
        page_fetch_state=idx.get("pageFetchState"), last_crawl_time=idx.get("lastCrawlTime"),
        crawled_as=idx.get("crawledAs"), google_canonical=idx.get("googleCanonical"),
        user_canonical=idx.get("userCanonical"), sitemaps=idx.get("sitemap", []),
        referring_urls=idx.get("referringUrls", [])[:10], link=res.get("inspectionResultLink"),
        mobile_usability=(res.get("mobileUsabilityResult") or {}).get("verdict"))


async def list_sitemaps(site_url: str) -> list[dict]:
    data = await _request("GET", f"{API}/sites/{quote(site_url, safe='')}/sitemaps")
    return [dict(
        path=s.get("path"), last_submitted=s.get("lastSubmitted"), last_downloaded=s.get("lastDownloaded"),
        is_pending=bool(s.get("isPending")), is_index=bool(s.get("isSitemapsIndex")),
        errors=int(s.get("errors") or 0), warnings=int(s.get("warnings") or 0),
        contents=[dict(type=c.get("type"), submitted=int(c.get("submitted") or 0), indexed=int(c.get("indexed") or 0))
                  for c in s.get("contents", [])])
        for s in data.get("sitemap", [])]
