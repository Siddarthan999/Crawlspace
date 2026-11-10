"""Optional headless-Chromium rendering path, used only when a crawl has render_js
enabled. Kept isolated from the default httpx path so a crawl that doesn't use it
never touches Playwright at all."""
import asyncio
import logging

log = logging.getLogger("browser")


class BrowserUnavailable(Exception):
    pass


class Renderer:
    def __init__(self, concurrency: int, user_agent: str):
        self.concurrency = max(1, min(concurrency, 8))  # rendering is expensive; hard cap
        self.user_agent = user_agent
        self._pw = None
        self._browser = None
        self._sem = asyncio.Semaphore(self.concurrency)

    async def start(self):
        try:
            from playwright.async_api import async_playwright
        except ImportError as e:
            raise BrowserUnavailable(
                "The 'playwright' package is not installed in this image."
            ) from e
        try:
            self._pw = await async_playwright().start()
            self._browser = await self._pw.chromium.launch(
                args=["--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage"]
            )
        except Exception as e:
            await self.stop()
            raise BrowserUnavailable(
                "Could not launch headless Chromium. Run 'playwright install --with-deps "
                f"chromium' in the backend image. ({type(e).__name__}: {e})"
            ) from e

    async def stop(self):
        try:
            if self._browser:
                await self._browser.close()
        except Exception:
            pass
        try:
            if self._pw:
                await self._pw.stop()
        except Exception:
            pass
        self._browser = None
        self._pw = None

    async def render(self, url: str, wait_ms: int = 2000, wait_selector: str = "",
                      timeout_s: int = 30) -> dict:
        """Navigates to url with JS enabled and returns the fully rendered DOM HTML."""
        async with self._sem:
            ctx = await self._browser.new_context(user_agent=self.user_agent, ignore_https_errors=True)
            page = await ctx.new_page()
            t0 = asyncio.get_event_loop().time()
            try:
                resp = await page.goto(url, timeout=timeout_s * 1000, wait_until="domcontentloaded")
                if wait_selector:
                    try:
                        await page.wait_for_selector(wait_selector, timeout=min(wait_ms, timeout_s * 1000))
                    except Exception:
                        pass
                elif wait_ms:
                    await page.wait_for_timeout(wait_ms)
                html = await page.content()
                status = resp.status if resp else 0
                headers = dict(resp.headers) if resp else {}
                ms = int((asyncio.get_event_loop().time() - t0) * 1000)
                return dict(status=status, headers=headers, body=html, ctype="text/html",
                            size=len(html.encode("utf-8", "ignore")), ms=ms, error=None)
            except Exception as e:
                ms = int((asyncio.get_event_loop().time() - t0) * 1000)
                return dict(status=0, headers={}, body=None, ctype=None, size=0, ms=ms,
                            error=f"{type(e).__name__}: {e}"[:300])
            finally:
                await page.close()
                await ctx.close()
