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


engine = (
    create_engine(normalize_database_url(settings.database_url), future=True, pool_pre_ping=True)
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
