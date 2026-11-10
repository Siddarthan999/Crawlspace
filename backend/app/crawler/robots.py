import httpx
from urllib.robotparser import RobotFileParser
from urllib.parse import urlsplit


class Robots:
    def __init__(self, client: httpx.AsyncClient, ua: str):
        self.client, self.ua = client, ua
        self.cache: dict[str, RobotFileParser] = {}

    async def _get(self, url: str) -> RobotFileParser:
        s = urlsplit(url)
        origin = f"{s.scheme}://{s.netloc}"
        if origin in self.cache:
            return self.cache[origin]
        rp = RobotFileParser()
        try:
            r = await self.client.get(origin + "/robots.txt", follow_redirects=True)
            rp.parse(r.text.splitlines() if r.status_code == 200 else [])
        except Exception:
            rp.parse([])
        rp.modified()  # without this can_fetch() returns False for everything
        self.cache[origin] = rp
        return rp

    async def allowed(self, url: str) -> bool:
        rp = await self._get(url)
        return rp.can_fetch(self.ua, url)

    async def sitemaps(self, url: str) -> list[str]:
        rp = await self._get(url)
        return list(rp.site_maps() or [])
