from datetime import datetime
from threading import Lock

import psycopg
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import CustomerRecord, DatasetSnapshot, ImportJob, ImportJobStatus
from .import_feedback import summarize_import_error
from .import_parser import ParsedWorkbook
from .storage import delete_import_copy

INSERT_BATCH_SIZE = 1000
IMPORT_REPLACE_LOCK = Lock()


def create_import_job(
    session: Session,
    *,
    file_name: str,
    fingerprint: str,
    storage_key: str | None,
    parsed: ParsedWorkbook,
) -> ImportJob:
    job = ImportJob(
        file_name=file_name,
        fingerprint=fingerprint,
        storage_key=storage_key,
        status=ImportJobStatus.queued.value,
        row_count=parsed.row_count,
        detected_schema={
            "sheet_name": parsed.sheet_name,
            "headers": parsed.headers,
            "non_empty_counts": parsed.non_empty_counts,
            "status_samples": parsed.status_samples,
            "subscription_status_samples": parsed.subscription_status_samples,
        },
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    return job


def ingest_full_snapshot(session: Session, *, job_id: str, parsed: ParsedWorkbook) -> DatasetSnapshot:
    job = session.get(ImportJob, job_id)
    if job is None:
        raise ValueError(f"Import job {job_id} was not found.")

    job.status = ImportJobStatus.processing.value
    session.commit()

    try:
        previous_snapshots = session.execute(
            select(DatasetSnapshot).where(
                DatasetSnapshot.source_system == "milkmaster",
                DatasetSnapshot.source_entity == "customers",
            )
        ).scalars().all()
        previous_snapshot_ids = [snapshot.id for snapshot in previous_snapshots]
        previous_import_job_ids = [snapshot.import_job_id for snapshot in previous_snapshots]
        previous_storage_refs = {
            import_job.id: import_job.storage_key
            for import_job in session.execute(
                select(ImportJob).where(ImportJob.id.in_(previous_import_job_ids))
            ).scalars()
            if import_job.storage_key
        }

        with IMPORT_REPLACE_LOCK:
            snapshot = DatasetSnapshot(
                import_job_id=job.id,
                source_file_name=parsed.file_name,
                fingerprint=parsed.fingerprint,
                row_count=parsed.row_count,
                imported_at=datetime.utcnow(),
                is_current=False,
            )
            session.add(snapshot)
            session.commit()
            session.refresh(snapshot)

            _bulk_insert_customer_rows(snapshot.id, parsed.rows)

            if previous_snapshot_ids:
                session.execute(delete(CustomerRecord).where(CustomerRecord.dataset_snapshot_id.in_(previous_snapshot_ids)))
                session.execute(delete(DatasetSnapshot).where(DatasetSnapshot.id.in_(previous_snapshot_ids)))
                session.execute(
                    update(ImportJob)
                    .where(ImportJob.id.in_(previous_import_job_ids))
                    .values(storage_key=None)
                )

            snapshot.is_current = True

            job.status = ImportJobStatus.succeeded.value
            job.updated_at = datetime.utcnow()
            session.commit()
            session.refresh(snapshot)

        for storage_key in previous_storage_refs.values():
            try:
                delete_import_copy(storage_key)
            except Exception:
                pass

        return snapshot
    except Exception as exc:
        session.rollback()
        job = session.get(ImportJob, job_id)
        if job is not None:
            failed_storage_key = job.storage_key
            job.status = ImportJobStatus.failed.value
            job.error_message = str(exc)
            job.updated_at = datetime.utcnow()
            job.storage_key = None
            session.commit()
        if "snapshot" in locals():
            _cleanup_failed_snapshot(snapshot.id)
        if "failed_storage_key" in locals():
            try:
                delete_import_copy(failed_storage_key)
            except Exception:
                pass
        raise


def _bulk_insert_customer_rows(snapshot_id: str, rows: list[dict]) -> None:
    if not rows:
        return

    settings = get_settings()
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not configured.")

    payload_keys = [*rows[0].keys(), "created_at"]
    columns = ["dataset_snapshot_id", *payload_keys]
    column_list = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))
    query = f"INSERT INTO customer_records ({column_list}) VALUES ({placeholders})"

    with psycopg.connect(settings.database_url) as conn:
        with conn.cursor() as cur:
            for start in range(0, len(rows), INSERT_BATCH_SIZE):
                batch_rows = rows[start : start + INSERT_BATCH_SIZE]
                batch_created_at = datetime.utcnow()
                payload = [
                    tuple([snapshot_id, *[row[column] for column in rows[0].keys()], batch_created_at])
                    for row in batch_rows
                ]
                cur.executemany(query, payload)
            conn.commit()


def _cleanup_failed_snapshot(snapshot_id: str) -> None:
    settings = get_settings()
    if not settings.database_url:
        return

    with psycopg.connect(settings.database_url) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM customer_records WHERE dataset_snapshot_id = %s", (snapshot_id,))
            cur.execute("DELETE FROM dataset_snapshots WHERE id = %s", (snapshot_id,))
            conn.commit()


def get_import_history(session: Session, *, limit: int = 50) -> tuple[list[ImportJob], str | None]:
    current_import_job_id = session.execute(
        select(DatasetSnapshot.import_job_id)
        .where(DatasetSnapshot.is_current.is_(True))
        .limit(1)
    ).scalar_one_or_none()

    jobs = session.execute(
        select(ImportJob).order_by(ImportJob.created_at.desc()).limit(limit)
    ).scalars().all()

    return jobs, current_import_job_id


def get_current_import_job(session: Session) -> ImportJob | None:
    current_import_job_id = session.execute(
        select(DatasetSnapshot.import_job_id)
        .where(DatasetSnapshot.is_current.is_(True))
        .limit(1)
    ).scalar_one_or_none()
    if not current_import_job_id:
        return None
    return session.get(ImportJob, current_import_job_id)


def get_duplicate_import_job(session: Session, *, fingerprint: str) -> ImportJob | None:
    return session.execute(
        select(ImportJob)
        .where(ImportJob.fingerprint == fingerprint)
        .order_by(ImportJob.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()


def process_import_job(job_id: str, parsed: ParsedWorkbook) -> None:
    from ..db import session_scope

    with session_scope() as session:
        ingest_full_snapshot(session, job_id=job_id, parsed=parsed)


def recover_interrupted_import_jobs(session: Session) -> int:
    interrupted_jobs = session.execute(
        select(ImportJob).where(ImportJob.status.in_([ImportJobStatus.queued.value, ImportJobStatus.processing.value]))
    ).scalars().all()

    recovered = 0
    for job in interrupted_jobs:
        interrupted_snapshot_ids = session.execute(
            select(DatasetSnapshot.id).where(
                DatasetSnapshot.import_job_id == job.id,
                DatasetSnapshot.is_current.is_(False),
            )
        ).scalars().all()
        if interrupted_snapshot_ids:
            session.execute(delete(CustomerRecord).where(CustomerRecord.dataset_snapshot_id.in_(interrupted_snapshot_ids)))
            session.execute(delete(DatasetSnapshot).where(DatasetSnapshot.id.in_(interrupted_snapshot_ids)))

        storage_key = job.storage_key
        job.status = ImportJobStatus.failed.value
        job.error_message = "Interrupted before completion."
        job.updated_at = datetime.utcnow()
        job.storage_key = None
        recovered += 1
        if storage_key:
            try:
                delete_import_copy(storage_key)
            except Exception:
                pass

    if recovered:
        session.commit()
    return recovered


def summarize_job_for_history(job: ImportJob, current_import_job_id: str | None) -> dict:
    return {
        "import_job_id": job.id,
        "file_name": job.file_name,
        "status": job.status,
        "row_count": job.row_count,
        "fingerprint": job.fingerprint,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
        "error_summary": summarize_import_error(job.error_message),
        "is_current_dataset": job.id == current_import_job_id,
        "file_retained": bool(job.storage_key),
    }
