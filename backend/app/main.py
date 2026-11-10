import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import init_db
from .workers.manager import manager
from .workers.scheduler import scheduler_loop
from .api import domains, crawls, pages, issues, checks_catalog, presets, schedules, compare, exports, search, lighthouse, outlinks, backlinks, gsc, dashboard

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await asyncio.to_thread(init_db)
    manager.bind(asyncio.get_running_loop())
    await manager.recover_on_boot()
    task = asyncio.create_task(scheduler_loop())
    yield
    task.cancel()


app = FastAPI(title="SEO Crawler", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (domains.router, crawls.router, pages.router, issues.router,
          checks_catalog.router, presets.router, schedules.router, compare.router, exports.router, search.router,
          lighthouse.router, outlinks.router, backlinks.router, gsc.router, dashboard.router):
    app.include_router(r)


@app.get("/api/health")
def health():
    return {"ok": True}
