from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status

from ...auth import AuthUser, require_permission
from ...config import get_settings
from ...db import get_db_last_error, is_db_available, is_db_configured, session_scope
from ...schemas import ImportHistoryItem, ImportHistoryResponse, ImportIngestResponse, ImportProfileResponse
from ...services.import_feedback import build_import_warnings
from ...services.import_parser import parse_milkmaster_customer_workbook
from ...services.customer_analytics import build_cached_customer_records
from ...services.import_service import (
    create_import_job,
    get_current_import_job,
    get_duplicate_import_job,
    get_import_history,
    process_import_job,
    summarize_job_for_history,
)
from ...services.storage import save_import_copy

router = APIRouter(prefix="/api/imports", tags=["imports"])


def _ensure_upload_user(actor: AuthUser) -> str:
    settings = get_settings()
    role = actor.role.strip().lower()
    if role not in settings.upload_allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{role}' is not allowed to replace the live dataset.",
        )
    return role


@router.post("/profile", response_model=ImportProfileResponse)
async def profile_import(
    file: UploadFile = File(...),
    actor: AuthUser = Depends(require_permission("imports:write")),
) -> ImportProfileResponse:
    _ensure_upload_user(actor)
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    settings = get_settings()
    parsed = parse_milkmaster_customer_workbook(file.filename or "snapshot.xlsx", payload)
    current_job = None
    duplicate_job = None
    if is_db_configured() and is_db_available():
        with session_scope() as session:
            current_job = get_current_import_job(session)
            duplicate_job = get_duplicate_import_job(session, fingerprint=parsed.fingerprint)
    warnings = build_import_warnings(parsed=parsed, current_job=current_job, duplicate_job=duplicate_job)

    return ImportProfileResponse(
        file_name=parsed.file_name,
        sheet_name=parsed.sheet_name,
        header_count=len(parsed.headers),
        row_count=parsed.row_count,
        headers=parsed.headers,
        non_empty_counts=parsed.non_empty_counts,
        status_samples=parsed.status_samples,
        subscription_status_samples=parsed.subscription_status_samples,
        wallet_fields={
            "wallet_balance": "Spend / ledger-side balance",
            "effective_wallet_balance": "Current actual balance",
        },
        warnings=warnings.warnings,
        blocked=warnings.blocked,
        duplicate_of_current=warnings.duplicate_of_current,
        duplicate_of_job_id=warnings.duplicate_of_job_id,
        current_file_name=current_job.file_name if current_job else None,
        current_row_count=current_job.row_count if current_job else None,
        recommended_action=warnings.recommended_action,
        allowed_upload_roles=settings.upload_allowed_roles,
    )


@router.get("/history", response_model=ImportHistoryResponse)
def import_history(
    limit: int = 50,
    _actor: AuthUser = Depends(require_permission("imports:read")),
) -> ImportHistoryResponse:
    settings = get_settings()
    if not is_db_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="DATABASE_URL is not configured for history.",
        )
    if not is_db_available():
        if settings.allow_local_file_fallback:
            cached = build_cached_customer_records()
            if cached is not None:
                cached_at = cached.get("cached_at")
                try:
                    timestamp = datetime.fromisoformat(cached_at) if cached_at else datetime.now()
                except ValueError:
                    timestamp = datetime.now()
                item = ImportHistoryItem(
                    import_job_id=f"cache-{cached['snapshot_id']}",
                    file_name="Cached customer snapshot",
                    status="cached",
                    row_count=len(cached["records"]),
                    fingerprint=None,
                    created_at=timestamp,
                    updated_at=timestamp,
                    error_summary="Served from local disk cache because the database is unavailable.",
                    is_current_dataset=True,
                    file_retained=True,
                )
                return ImportHistoryResponse(
                    current_import_job_id=item.import_job_id,
                    allowed_upload_roles=settings.upload_allowed_roles,
                    items=[item],
                )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database is configured but not reachable. {get_db_last_error()}",
        )

    with session_scope() as session:
        jobs, current_import_job_id = get_import_history(session, limit=max(1, min(limit, 200)))

    return ImportHistoryResponse(
        current_import_job_id=current_import_job_id,
        allowed_upload_roles=settings.upload_allowed_roles,
        items=[ImportHistoryItem(**summarize_job_for_history(job, current_import_job_id)) for job in jobs],
    )


@router.post("", response_model=ImportIngestResponse)
async def ingest_import(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    snapshot_kind: str = Form(default="full"),
    confirm_replace: bool = Form(default=False),
    actor: AuthUser = Depends(require_permission("imports:write")),
) -> ImportIngestResponse:
    if snapshot_kind != "full":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This backend currently supports full customer snapshots only.",
        )
    if not is_db_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="DATABASE_URL is not configured for ingest.",
        )
    if not is_db_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database is configured but not reachable. {get_db_last_error()}",
        )
    _ensure_upload_user(actor)

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    parsed = parse_milkmaster_customer_workbook(file.filename or "snapshot.xlsx", payload)
    with session_scope() as session:
        current_job = get_current_import_job(session)
        duplicate_job = get_duplicate_import_job(session, fingerprint=parsed.fingerprint)
        warnings = build_import_warnings(parsed=parsed, current_job=current_job, duplicate_job=duplicate_job)
        if warnings.blocked:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": warnings.recommended_action,
                    "warnings": warnings.warnings,
                    "duplicate_of_current": warnings.duplicate_of_current,
                    "duplicate_of_job_id": warnings.duplicate_of_job_id,
                },
            )
        if warnings.warnings and not confirm_replace:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "Review the validation warnings before replacing the live dataset.",
                    "warnings": warnings.warnings,
                    "duplicate_of_current": warnings.duplicate_of_current,
                    "duplicate_of_job_id": warnings.duplicate_of_job_id,
                },
            )

        storage_key = save_import_copy(parsed.file_name, payload, parsed.fingerprint)
        job = create_import_job(
            session,
            file_name=parsed.file_name,
            fingerprint=parsed.fingerprint,
            storage_key=storage_key,
            parsed=parsed,
        )
    background_tasks.add_task(process_import_job, job.id, parsed)

    return ImportIngestResponse(
        import_job_id=job.id,
        dataset_snapshot_id=None,
        row_count=parsed.row_count,
        file_name=parsed.file_name,
        imported_at=None,
        status="queued",
        queued_at=job.created_at,
        warnings=warnings.warnings,
        duplicate_of_current=warnings.duplicate_of_current,
        duplicate_of_job_id=warnings.duplicate_of_job_id,
        message="Import queued. The background worker will validate and replace the live dataset.",
    )


# ----------------------------------------------------------------------
# Sales transactions import — separate flow from the customer master.
# Customer data lives in Supabase; sales data lives on local disk as
# Parquet (+ CSV.gz fallback). This pipeline parses an uploaded sales
# CSV/XLSX, validates, atomically replaces the live store, invalidates
# embedding/schema caches, and kicks a background re-warmup so the chat
# picks up new product names.
# ----------------------------------------------------------------------
from ...services import sales_import as _sales


async def _read_upload_with_cap(file: UploadFile) -> bytes:
    """Read an UploadFile in chunks, rejecting anything over MAX_UPLOAD_BYTES.
    Prevents a single malicious upload from OOMing the worker process."""
    cap = _sales.MAX_UPLOAD_BYTES
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)  # 1 MB
        if not chunk:
            break
        total += len(chunk)
        if total > cap:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Upload exceeds {cap // (1024 * 1024)} MB cap. Split the export or contact ops.",
            )
        chunks.append(chunk)
    return b"".join(chunks)


@router.post("/sales/profile")
async def profile_sales(
    file: UploadFile = File(...),
    actor: AuthUser = Depends(require_permission("imports:write")),
) -> dict:
    # Role-gate profile too — it's a full parse, same expense as preview.
    _ensure_upload_user(actor)
    payload = await _read_upload_with_cap(file)
    if not payload:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded sales file is empty.")
    return _sales.profile(payload, file.filename or "sales.csv")


@router.post("/sales")
async def commit_sales(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    confirm_replace: str = Form("false"),
    actor: AuthUser = Depends(require_permission("imports:write")),
) -> dict:
    role = _ensure_upload_user(actor)
    payload = await _read_upload_with_cap(file)
    if not payload:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded sales file is empty.")

    # Re-validate to detect blocked uploads even if the client skipped /profile
    profile_result = _sales.profile(payload, file.filename or "sales.csv")
    if profile_result.get("blocked"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Sales file is missing required columns.",
                "missing_required": profile_result.get("missing_required", []),
                "warnings": profile_result.get("warnings", []),
            },
        )
    has_warnings = bool(profile_result.get("warnings"))
    if has_warnings and confirm_replace.lower() != "true":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Validation warnings present. Re-submit with confirm_replace=true to override.",
                "warnings": profile_result.get("warnings", []),
            },
        )

    result = _sales.commit(payload, file.filename or "sales.csv")
    if not result.get("ok"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Sales import failed.", "error": result.get("error"), "detail": result.get("detail")},
        )

    # Background: re-warm the embedding index so new product names are searchable.
    # Done after returning so the user sees "imported" immediately.
    def _rewarm() -> None:
        try:
            with session_scope() as s:
                _sales.schedule_embedding_rewarm(s)
        except Exception:  # noqa: BLE001
            # Non-fatal — first chat query will rebuild lazily.
            pass

    background_tasks.add_task(_rewarm)

    return {
        "ok": True,
        "role": role,
        "meta": result["meta"],
        "message": (
            f"Sales report imported: {result['meta']['row_count']:,} rows. "
            "Embedding index is rebuilding in the background — new product/area names "
            "will be searchable in chat within ~30 seconds."
        ),
    }


@router.get("/sales/status")
async def sales_status(_actor: AuthUser = Depends(require_permission("imports:read"))) -> dict:
    meta = _sales.read_meta()
    return {"current": meta, "has_data": meta is not None}


# ----------------------------------------------------------------------
# Append mode — non-destructive merge of a new 2-month export into the
# existing dataset. See sales_import.analyze_for_append / commit_append
# for the dedup-key + strategy semantics.
# ----------------------------------------------------------------------
@router.post("/sales/append/preview")
async def preview_sales_append(
    file: UploadFile = File(...),
    actor: AuthUser = Depends(require_permission("imports:write")),
) -> dict:
    """Dry-run: parse the new file, compare with existing parquet, return a diff
    the UI can render before commit. Does not write anything.

    Role-gated: preview triggers a full file parse + dedup against existing
    data — expensive enough that we don't want unauthenticated callers
    triggering it. Same role rules as the actual commit.
    """
    _ensure_upload_user(actor)
    payload = await _read_upload_with_cap(file)
    if not payload:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded sales file is empty.")
    result = _sales.analyze_for_append(payload, file.filename or "sales.csv")
    if not result.get("ok"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Could not analyze the sales file.",
                "error": result.get("error"),
                "detail": result.get("detail"),
                "warnings": result.get("warnings", []),
            },
        )
    return result


@router.post("/sales/append")
async def commit_sales_append(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    strategy: str = Form("skip"),  # "skip" (safe default) | "replace"
    confirm_partial: str = Form("false"),
    actor: AuthUser = Depends(require_permission("imports:write")),
) -> dict:
    """Append-merge a 2-month export into the existing sales dataset.

    strategy:
      - 'skip'    → on collision (same date/customer_id/product_id/mobile), keep
                    the existing row. Adds only truly new rows. SAFE DEFAULT.
      - 'replace' → on collision, overwrite the existing row with the new one.
                    Use when MilkMaster fixed an error and you're pulling
                    the correction.

    Rejects with 409 when the file looks like a PARTIAL export (e.g. one hub
    missing) unless `confirm_partial=true`. A hub-filtered file collides with
    nothing, so without this gate it imports "successfully" and silently
    understates the period — exactly how May 2026 lost Rs 9.28L.
    """
    role = _ensure_upload_user(actor)
    payload = await _read_upload_with_cap(file)
    if not payload:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded sales file is empty.")

    strategy_clean = (strategy or "skip").strip().lower()
    if strategy_clean not in ("skip", "replace"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"strategy must be 'skip' or 'replace', got {strategy!r}.",
        )

    result = _sales.commit_append(
        payload, file.filename or "sales.csv",
        strategy=strategy_clean,
        confirm_partial=confirm_partial.strip().lower() == "true",
    )
    if not result.get("ok"):
        # A partial export is a distinct, recoverable case: the operator can
        # re-export with all hubs, or deliberately override. 409 (not 400) so
        # the UI can tell "fix your file" apart from "this file is broken".
        if result.get("error") == "incomplete_export":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "This looks like a PARTIAL export — importing it would silently understate the period.",
                    "error": "incomplete_export",
                    "issues": result.get("detail", []),
                    "completeness": result.get("completeness"),
                    "hint": "Re-export from MilkMaster with ALL hubs selected, or re-submit with confirm_partial=true if the filter was intentional.",
                },
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Sales append failed.",
                "error": result.get("error"),
                "detail": result.get("detail"),
                "warnings": result.get("warnings", []),
            },
        )

    def _rewarm() -> None:
        try:
            with session_scope() as s:
                _sales.schedule_embedding_rewarm(s)
        except Exception:  # noqa: BLE001
            pass

    background_tasks.add_task(_rewarm)

    summary = result["meta"].get("append_summary") or {}
    added = summary.get("rows_added", 0)
    dups = summary.get("duplicates_detected", 0)
    return {
        "ok": True,
        "role": role,
        "meta": result["meta"],
        "message": (
            f"Sales report appended: {added:,} new rows added"
            + (f", {dups:,} duplicates handled with '{strategy_clean}'" if dups else "")
            + f". Dataset is now {result['meta']['row_count']:,} rows "
            f"({result['meta']['date_range'].get('from','?')} → {result['meta']['date_range'].get('to','?')})."
        ),
    }
