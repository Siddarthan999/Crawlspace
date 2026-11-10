import asyncio
import logging
from datetime import datetime

from ..config import MAX_PARALLEL_CRAWLS
from ..db import SessionLocal
from ..models import Crawl
from ..crawler.engine import CrawlEngine, db_set_status
from ..analysis.runner import run_analysis

log = logging.getLogger("manager")


class JobManager:
    def __init__(self):
        self.tasks: dict[int, asyncio.Task] = {}
        self.sema: asyncio.Semaphore | None = None
        self.loop: asyncio.AbstractEventLoop | None = None

    def bind(self, loop: asyncio.AbstractEventLoop):
        """Called once from the app's lifespan, on the running event loop."""
        self.loop = loop
        self.sema = asyncio.Semaphore(MAX_PARALLEL_CRAWLS)

    def running(self, cid: int) -> bool:
        t = self.tasks.get(cid)
        return bool(t and not t.done())

    def start(self, cid: int):
        """Safe to call from the event-loop thread or from a FastAPI sync (threadpool) endpoint."""
        if self.running(cid):
            return

        def _spawn():
            self.tasks[cid] = self.loop.create_task(self._run(cid))

        try:
            running_loop = asyncio.get_running_loop()
        except RuntimeError:
            running_loop = None
        if running_loop is self.loop:
            _spawn()
        else:
            self.loop.call_soon_threadsafe(_spawn)

    async def _run(self, cid: int):
        async with self.sema:
            try:
                outcome = await CrawlEngine(cid).run()
            except Exception as e:
                log.exception("crawl %s crashed", cid)
                await asyncio.to_thread(db_set_status, cid, "failed", error=str(e)[:500], finished_at=datetime.utcnow())
                return
            if outcome == "pause":
                await asyncio.to_thread(db_set_status, cid, "paused")
                return
            if outcome == "stop":
                await asyncio.to_thread(db_set_status, cid, "stopped", finished_at=datetime.utcnow())
                return
            if outcome == "failed":
                return  # engine already recorded the error and set status=failed
            await asyncio.to_thread(db_set_status, cid, "analyzing")
            try:
                await asyncio.to_thread(run_analysis, cid)
                await asyncio.to_thread(db_set_status, cid, "completed", finished_at=datetime.utcnow())
            except Exception as e:
                log.exception("analysis %s crashed", cid)
                await asyncio.to_thread(db_set_status, cid, "failed", error=f"Analysis error: {e}"[:500], finished_at=datetime.utcnow())

    def resume(self, cid: int):
        self.start(cid)

    async def pause(self, cid: int):
        await asyncio.to_thread(db_set_status, cid, "pausing")

    async def stop(self, cid: int):
        await asyncio.to_thread(db_set_status, cid, "stopping")

    async def recover_on_boot(self):
        """Mark crawls that were 'running'/'analyzing' when the process died as paused, so they can be resumed."""
        def _fix():
            with SessionLocal() as db:
                stuck = db.query(Crawl).filter(Crawl.status.in_(["running", "pausing", "stopping", "analyzing"])).all()
                for c in stuck:
                    c.status = "paused"
                db.commit()
        await asyncio.to_thread(_fix)


manager = JobManager()
