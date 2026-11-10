import time
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from .config import DATABASE_URL

_sqlite = DATABASE_URL.startswith("sqlite")
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    **({"connect_args": {"check_same_thread": False, "timeout": 30}} if _sqlite else {"pool_size": 10, "max_overflow": 20}),
)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db(retries: int = 30):
    from . import models  # noqa
    for _ in range(retries):
        try:
            with engine.connect() as c:
                c.execute(text("select 1"))
            break
        except Exception:
            time.sleep(2)
    Base.metadata.create_all(engine)
