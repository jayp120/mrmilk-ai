from contextlib import contextmanager
from logging import getLogger
from typing import Iterator
from urllib.parse import quote, urlsplit, urlunsplit

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings

logger = getLogger(__name__)


class Base(DeclarativeBase):
    pass


settings = get_settings()


def normalize_database_url(url: str | None) -> str | None:
    if not url:
        return None
    normalized = url
    if normalized.startswith("postgresql://"):
        normalized = normalized.replace("postgresql://", "postgresql+psycopg://", 1)

    split_url = urlsplit(normalized)
    if split_url.netloc.count("@") <= 1:
        return normalized

    userinfo, hostport = split_url.netloc.rsplit("@", 1)
    if ":" not in userinfo:
        return normalized

    username, password = userinfo.split(":", 1)
    repaired_netloc = f"{quote(username, safe='')}:{quote(password, safe='')}@{hostport}"
    return urlunsplit(split_url._replace(netloc=repaired_netloc))


# Small QueuePool against the Supabase TRANSACTION pooler (port 6543).
# - pool_size=3 + max_overflow=2 = max 5 warm connections. Transaction-mode
#   pooler caps at 200+ clients, so this is safe even with multiple workers.
# - pool_recycle=1800: Supabase's transaction pooler drops idle conns after
#   ~10 min — recycling ours at 30 min is paranoid but harmless.
# - pool_pre_ping: one cheap "SELECT 1" before handing out a stale conn
#   (protects against mid-restart or idle-drop).
# - prepare_threshold=None: NEVER use server-side prepared statements.
#   Supabase's transaction pooler routes each transaction to a potentially
#   different backend connection, which invalidates psycopg's prepared-
#   statement cache and surfaces as "prepared statement _pg3_X does not
#   exist" 500s. (Confusingly, 0 means "prepare everything from the first
#   execution" — we want the opposite.)
engine = (
    create_engine(
        normalize_database_url(settings.database_url),
        future=True,
        pool_size=3,
        max_overflow=2,
        pool_timeout=10,
        pool_recycle=1800,
        pool_pre_ping=True,
        connect_args={"prepare_threshold": None},
    )
    if settings.db_configured
    else None
)
SessionLocal = (
    sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    if engine is not None
    else None
)
db_last_error: str | None = None


def is_db_configured() -> bool:
    return engine is not None and SessionLocal is not None


def is_db_available() -> bool:
    return is_db_configured() and db_last_error is None


def get_db_last_error() -> str | None:
    return db_last_error


def init_db() -> bool:
    global db_last_error
    if not is_db_configured():
        db_last_error = None
        return False
    from . import models  # noqa: F401

    try:
        Base.metadata.create_all(bind=engine)
        db_last_error = None
        return True
    except Exception as exc:
        db_last_error = str(exc)
        logger.exception("Database initialization failed.")
        return False


@contextmanager
def session_scope() -> Iterator[Session]:
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured.")
    if db_last_error is not None:
        raise RuntimeError(f"DATABASE_URL is configured but unavailable: {db_last_error}")
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
