from datetime import datetime

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    app_env: str
    db_configured: bool
    db_available: bool
    db_error: str | None = None
    llm_provider: str


class ImportProfileResponse(BaseModel):
    file_name: str
    sheet_name: str
    header_count: int
    row_count: int
    headers: list[str]
    non_empty_counts: dict[str, int]
    status_samples: list[str]
    subscription_status_samples: list[str]
    wallet_fields: dict[str, str]
    warnings: list[str]
    blocked: bool
    duplicate_of_current: bool
    duplicate_of_job_id: str | None
    current_file_name: str | None
    current_row_count: int | None
    recommended_action: str
    allowed_upload_roles: list[str]


class ImportIngestResponse(BaseModel):
    import_job_id: str
    dataset_snapshot_id: str | None = None
    row_count: int | None = None
    file_name: str
    imported_at: datetime | None = None
    status: str
    queued_at: datetime
    warnings: list[str]
    duplicate_of_current: bool
    duplicate_of_job_id: str | None
    message: str


class ImportHistoryItem(BaseModel):
    import_job_id: str
    file_name: str
    status: str
    row_count: int | None
    fingerprint: str | None
    created_at: datetime
    updated_at: datetime
    error_summary: str | None
    is_current_dataset: bool
    file_retained: bool


class ImportHistoryResponse(BaseModel):
    items: list[ImportHistoryItem]
    current_import_job_id: str | None
    allowed_upload_roles: list[str]
