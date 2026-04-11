from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="backend/.env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_env: str = Field(default="development", alias="APP_ENV")
    app_host: str = Field(default="0.0.0.0", alias="APP_HOST")
    app_port: int = Field(default=8100, alias="APP_PORT")

    database_url: str | None = Field(default=None, alias="DATABASE_URL")

    supabase_url: str | None = Field(default=None, alias="SUPABASE_URL")
    supabase_project_ref: str | None = Field(default=None, alias="SUPABASE_PROJECT_REF")
    supabase_publishable_key: str | None = Field(default=None, alias="SUPABASE_PUBLISHABLE_KEY")
    supabase_anon_key: str | None = Field(default=None, alias="SUPABASE_ANON_KEY")
    supabase_secret_key: str | None = Field(default=None, alias="SUPABASE_SECRET_KEY")
    supabase_service_role_key: str | None = Field(default=None, alias="SUPABASE_SERVICE_ROLE_KEY")
    supabase_storage_bucket: str = Field(default="imports", alias="SUPABASE_STORAGE_BUCKET")

    llm_provider: str = Field(default="gemini", alias="LLM_PROVIDER")
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    nvidia_api_key: str | None = Field(default=None, alias="NVIDIA_API_KEY")
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")

    allowed_origins_raw: str = Field(
        default="http://localhost:5000,http://localhost:5173,http://127.0.0.1:5000,http://127.0.0.1:5173",
        alias="ALLOWED_ORIGINS",
    )

    allow_local_file_fallback: bool = Field(default=True, alias="ALLOW_LOCAL_FILE_FALLBACK")
    upload_allowed_roles_raw: str = Field(default="owner,ops", alias="UPLOAD_ALLOWED_ROLES")

    @property
    def db_configured(self) -> bool:
        return bool(self.database_url)

    @property
    def supabase_configured(self) -> bool:
        return bool(self.supabase_url and (self.supabase_service_role_key or self.supabase_secret_key))

    @property
    def upload_allowed_roles(self) -> list[str]:
        return [role.strip().lower() for role in self.upload_allowed_roles_raw.split(",") if role.strip()]

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins_raw.split(",") if o.strip()]

    def api_key_for(self, provider: str) -> str | None:
        p = provider.strip().lower()
        if p == "gemini":
            return self.gemini_api_key
        if p == "nvidia":
            return self.nvidia_api_key
        if p == "openai":
            return self.openai_api_key
        return None


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
