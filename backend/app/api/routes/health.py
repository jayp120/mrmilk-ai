from fastapi import APIRouter

from ...config import get_settings
from ...db import get_db_last_error, is_db_available, is_db_configured
from ...schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
    db_configured = is_db_configured()
    db_available = is_db_available()
    return HealthResponse(
        status="ok" if (not db_configured or db_available) else "degraded",
        app_env=settings.app_env,
        db_configured=db_configured,
        db_available=db_available,
        db_error=get_db_last_error(),
        llm_provider=settings.llm_provider,
    )
