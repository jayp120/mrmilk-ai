from __future__ import annotations

from dataclasses import dataclass
from math import fabs

from ..models import ImportJob
from .import_parser import ParsedWorkbook

REQUIRED_COLUMNS = {
    "Id",
    "Name",
    "Temp Customer Status",
    "Sub. Status",
    "Area",
    "Mobile",
    "Hub",
    "Wallet Balance",
    "Effective Wallet Balance",
}


@dataclass
class ImportWarnings:
    warnings: list[str]
    blocked: bool
    duplicate_of_current: bool
    duplicate_of_job_id: str | None
    recommended_action: str


def summarize_import_error(error_message: str | None) -> str | None:
    if not error_message:
        return None

    text = error_message.lower()
    if "password authentication failed" in text:
        return "Database credentials were rejected. Check the configured Supabase pooler password."
    if "value too long for type character varying" in text:
        return "One or more workbook values exceeded the current database field size. The import was stopped safely."
    if "null value in column" in text:
        return "A required field was missing during import. The live dataset was left unchanged."
    if "duplicate" in text and "current dataset" in text:
        return "This upload matches the current live dataset, so no replacement was performed."
    if "queued" in text:
        return "The import is queued and waiting for the background worker."
    if "interrupted" in text:
        return "This import was interrupted before completion."
    if "database is configured but not reachable" in text:
        return "The database was unreachable when this import ran."
    return error_message.splitlines()[0][:220]


def build_import_warnings(
    *,
    parsed: ParsedWorkbook,
    current_job: ImportJob | None,
    duplicate_job: ImportJob | None,
) -> ImportWarnings:
    warnings: list[str] = []
    missing_columns = sorted(REQUIRED_COLUMNS.difference(parsed.headers))

    if missing_columns:
        warnings.append(
            f"Missing required columns: {', '.join(missing_columns)}. The upload cannot replace the live dataset."
        )

    duplicate_of_current = bool(
        current_job and current_job.fingerprint and current_job.fingerprint == parsed.fingerprint
    )
    duplicate_of_job_id = duplicate_job.id if duplicate_job else None

    if duplicate_of_current:
        warnings.append("This file matches the current live dataset exactly. Uploading it again would not change the business data.")
    elif duplicate_job is not None:
        warnings.append(
            f"This file fingerprint matches an earlier upload: {duplicate_job.file_name}. Replacing the live dataset will reuse already-seen data."
        )

    current_row_count = current_job.row_count if current_job else None
    if current_row_count:
        delta_ratio = fabs(parsed.row_count - current_row_count) / max(current_row_count, 1)
        if delta_ratio >= 0.15:
            direction = "lower" if parsed.row_count < current_row_count else "higher"
            warnings.append(
                f"Row count is {direction} than the current live dataset ({parsed.row_count:,} vs {current_row_count:,}). Review before replacing."
            )

    area_populated = parsed.non_empty_counts.get("Area", 0)
    name_populated = parsed.non_empty_counts.get("Name", 0)
    if parsed.row_count and area_populated / parsed.row_count < 0.75:
        warnings.append("Area coverage is sparse in this file. Some locality analysis may be weaker after replacement.")
    if parsed.row_count and name_populated / parsed.row_count < 0.75:
        warnings.append("Customer names are missing for a noticeable share of rows. Team call lists may be less usable.")

    blocked = bool(missing_columns or duplicate_of_current)
    if blocked:
        recommended_action = "Fix the blocking issue before replacing the live dataset."
    elif warnings:
        recommended_action = "Review the warnings, then confirm the replacement if the upload is intentional."
    else:
        recommended_action = "The file is ready to replace the live dataset."

    return ImportWarnings(
        warnings=warnings,
        blocked=blocked,
        duplicate_of_current=duplicate_of_current,
        duplicate_of_job_id=duplicate_of_job_id,
        recommended_action=recommended_action,
    )
