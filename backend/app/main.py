from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api.routes.chat import router as chat_router
from .api.routes.customers import router as customers_router
from .api.routes.health import router as health_router
from .api.routes.imports import router as imports_router
from .config import get_settings
from .db import init_db, is_db_available, is_db_configured, session_scope
from .services.import_service import recover_interrupted_import_jobs


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    if is_db_configured() and is_db_available():
        with session_scope() as session:
            recover_interrupted_import_jobs(session)
    yield


settings = get_settings()
app = FastAPI(title="Mr Milk AI API", version="0.1.0", lifespan=lifespan)

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
