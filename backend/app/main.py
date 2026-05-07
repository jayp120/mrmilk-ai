from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

from .api.routes.chat import router as chat_router
from .api.routes.customers import router as customers_router
from .api.routes.health import router as health_router
from .api.routes.imports import router as imports_router
from .config import get_settings
from .db import init_db, is_db_available, is_db_configured, session_scope
from .services.customer_analytics import warmup_records_cache
from .services.import_service import recover_interrupted_import_jobs


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    if is_db_configured() and is_db_available():
        with session_scope() as session:
            recover_interrupted_import_jobs(session)
        # Warm the records cache in the background so the first user query
        # (including run_python) doesn't pay the cross-region fetch cost.
        # Uses disk cache if present → instant; otherwise paginates from DB.
        import asyncio

        async def _warm_in_background() -> None:
            import logging
            log = logging.getLogger(__name__)

            def _do_warm() -> dict[str, int]:
                """Warm: records cache + schema summary + embedding index."""
                from .services.data_summary import build_schema_summary
                from .services.embeddings import warmup as warmup_embeddings
                out = {"records": 0, "schema_categories": 0, "embeddings": 0}
                try:
                    with session_scope() as s:
                        out["records"] = warmup_records_cache(s)
                except Exception:  # noqa: BLE001
                    pass
                try:
                    with session_scope() as s:
                        payload = build_schema_summary(s)
                        out["schema_categories"] = len(payload.get("summary") or {})
                except Exception:  # noqa: BLE001
                    pass
                try:
                    with session_scope() as s:
                        out["embeddings"] = warmup_embeddings(s)
                except Exception:  # noqa: BLE001
                    pass
                return out

            stats = await asyncio.to_thread(_do_warm)
            log.info(
                "warmup: records=%d rows, schema=%d categories, embeddings=%d values",
                stats.get("records", 0), stats.get("schema_categories", 0), stats.get("embeddings", 0),
            )

        asyncio.create_task(_warm_in_background())
    yield


settings = get_settings()
app = FastAPI(title="Mr Milk AI API", version="0.1.0", lifespan=lifespan)

# GZip responses >500 bytes. The /api/customers/records payload for a 20k+
# row snapshot is ~8 MB uncompressed; gzip brings it down to ~1 MB. Applied
# before CORS so the compressed response still carries the CORS headers.
app.add_middleware(GZipMiddleware, minimum_size=500, compresslevel=5)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(imports_router)
app.include_router(customers_router)
app.include_router(chat_router)


@app.get("/api")
def api_root() -> dict[str, str]:
    return {
        "name": "Mr Milk AI API",
        "status": "ok",
        "docs": "/docs",
        "env": settings.app_env,
    }


# ---------------------------------------------------------------------------
# Production: serve the built React frontend from dist/ folder.
# When `npm run build` creates dist/, FastAPI serves it on all non-API paths.
# This makes the entire app (frontend + backend) run as ONE process.
# ---------------------------------------------------------------------------
DIST_DIR = Path(__file__).resolve().parent.parent.parent / "dist"

if DIST_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(DIST_DIR), html=True), name="frontend")
else:
    # dev mode — no dist/ folder, just show API info on root
    @app.get("/")
    def root() -> dict[str, str]:
        return {
            "name": "Mr Milk AI API",
            "status": "ok",
            "docs": "/docs",
            "env": settings.app_env,
            "hint": "Run 'npm run build' to create dist/ and serve the frontend from here.",
        }
