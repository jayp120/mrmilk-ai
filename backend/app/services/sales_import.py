"""
Sales-transactions import pipeline.

Mirrors the customer import flow (`import_service.py`) but for the sales
report. Customer data lives in Supabase; sales data lives on local disk
as Parquet (and a CSV.gz fallback) — this avoids putting 400k+ rows on
the free-tier DB while keeping queries fast for `run_python` in the
chat sandbox.

Storage layout (all under backend/.cache/):
  sales.parquet           — primary store, ~12 MB compressed
  sales.csv.gz            — bulletproof fallback for sandboxes lacking pyarrow
  sales_meta.json         — { file_name, row_count, date_range, uploaded_at,
                              columns, warnings }
  sales-pending.parquet   — staging area during validate-then-commit
  sales-pending.csv.gz

Atomic-write contract: every write goes to a `.tmp` sibling first, then
`os.replace()` — partial uploads can never corrupt the live store.

Validation: we accept either MilkMaster's canonical column names
("Mobile Number", "Product Name", "Sub Total", ...) or already-renamed
snake_case ("mobile", "product_name", "sub_total", ...). Required
columns must be present; everything else is best-effort. We surface
column matches and warnings to the UI for review BEFORE commit.
"""
from __future__ import annotations

import io
import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).resolve().parent.parent.parent / ".cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

PARQUET_PATH = CACHE_DIR / "sales.parquet"
CSVGZ_PATH = CACHE_DIR / "sales.csv.gz"
META_PATH = CACHE_DIR / "sales_meta.json"

# Required columns (after rename). Either the canonical name or any of the
# accepted aliases must be present in the input.
REQUIRED_COLUMNS = {
    "mobile":         ["mobile", "Mobile Number", "Mobile", "mobile_number"],
    "product_name":   ["product_name", "Product Name", "Product", "product"],
    "sub_total":      ["sub_total", "Sub Total", "subtotal", "amount", "Amount"],
    "date":           ["date", "Date", "delivery_date", "Delivery Date"],
}

# Optional columns we like to have (warning emitted if missing, but not blocking).
PREFERRED_COLUMNS = {
    "qty_net":          ["qty_net", "Net Quantity", "quantity", "Quantity"],
    "delivery_status":  ["delivery_status", "Delivery Status", "status"],
    "area":             ["area", "Area"],
    "hub":              ["hub", "Hub Name", "Hub"],
    "product_id":       ["product_id", "Product ID"],
    "customer_id":      ["customer_id", "Customer ID"],
}

# Full canonical schema — matches what `run_python` expects in `sales_df`.
# Any rename map below uses these snake_case names as targets.
RENAME_MAP = {
    "Date": "date", "Invoice ID": "invoice_id", "Hub Name": "hub",
    "Delivery Boy Name": "delivery_boy", "Product Name": "product_name",
    "Product Weight": "product_weight", "Customer ID": "customer_id",
    "Mobile Number": "mobile", "Alternate Number": "alternate_mobile",
    "Effective Wallet Balance": "effective_wallet_balance",
    "Credit Limit": "credit_limit", "Delivery Location": "delivery_location",
    "Product ID": "product_id", "Quantity Delivered": "qty_delivered",
    "Quantity Ordered": "qty_ordered", "Cancelled Quantity": "qty_cancelled",
    "Disputed Quantity": "qty_disputed", "Curdled Quantity": "qty_curdled",
    "Net Quantity": "qty_net", "Delivery Status": "delivery_status",
    "Product Price": "product_price", "Tax Rate": "tax_rate",
    "Discount Price": "discount_price", "Net Price": "net_price",
    "Sub Total": "sub_total", "Total Tax": "total_tax",
    "Cancel Charge": "cancel_charge", "Delivery Boy ID": "delivery_boy_id",
    "Delivery Time": "delivery_time", "Delivery Shift": "delivery_shift",
    "Subscription ID": "subscription_id", "Subscription Type": "subscription_type",
    "Customer Name": "name", "Street": "street", "Area": "area",
    "Sub Area": "sub_area", "Hub ID": "hub_id", "State": "state",
    "Invoice Date": "invoice_date", "Delivery ID": "delivery_id",
    "Created": "created", "Note": "note",
    "Bottle Collected": "bottle_collected", "Bottle Remaining": "bottle_remaining",
    "Delivery Note": "delivery_note", "Sub. created by": "sub_created_by",
    "Sub. Created By Delivery Boy": "sub_created_by_boy",
    "Proof of Delivery Image": "proof_of_delivery_image",
}

NUMERIC_COLUMNS = [
    "qty_delivered", "qty_ordered", "qty_cancelled", "qty_disputed",
    "qty_curdled", "qty_net", "product_price", "tax_rate", "discount_price",
    "net_price", "sub_total", "total_tax", "cancel_charge",
    "effective_wallet_balance", "credit_limit", "bottle_collected",
    "bottle_remaining",
]
DATE_COLUMNS = ["date", "delivery_time", "invoice_date", "created"]


# ----------------------------------------------------------------------
# Loading + normalising
# ----------------------------------------------------------------------
def _read_input(buffer: bytes, file_name: str):
    """Read uploaded bytes into a pandas DataFrame. Auto-detects CSV vs XLSX
    from extension. Returns the DataFrame."""
    import pandas as pd

    name = file_name.lower()
    if name.endswith(".csv") or name.endswith(".csv.gz") or name.endswith(".tsv"):
        compression = "gzip" if name.endswith(".gz") else None
        sep = "\t" if name.endswith(".tsv") else ","
        return pd.read_csv(io.BytesIO(buffer), compression=compression, sep=sep, low_memory=False)
    if name.endswith(".xlsx") or name.endswith(".xls"):
        return pd.read_excel(io.BytesIO(buffer), engine="openpyxl" if name.endswith(".xlsx") else None)
    # Default to CSV
    return pd.read_csv(io.BytesIO(buffer), low_memory=False)


def _normalize(df) -> dict[str, Any]:
    """Apply rename + type coercion. Returns {df, columns_matched,
    columns_unknown, warnings}."""
    import pandas as pd

    columns_in = list(df.columns)
    # Rename canonical names to snake_case
    rename_pairs = {src: dst for src, dst in RENAME_MAP.items() if src in df.columns}
    if rename_pairs:
        df = df.rename(columns=rename_pairs)

    # Strip whitespace on string columns we care about
    for col in ("mobile", "alternate_mobile", "customer_id", "product_id", "product_name", "area", "hub", "delivery_status", "subscription_type"):
        if col in df.columns:
            df[col] = df[col].astype("string").str.strip()
            # Mobile: drop trailing .0 from float-coerced numbers
            if col == "mobile":
                df[col] = df[col].str.replace(r"\.0$", "", regex=True)

    # Coerce numerics
    for col in NUMERIC_COLUMNS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Coerce dates
    for col in DATE_COLUMNS:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    # Track what we matched vs what's leftover
    matched = []
    for canonical, aliases in REQUIRED_COLUMNS.items():
        if canonical in df.columns:
            matched.append(canonical)

    # Optional / preferred columns matched
    preferred_matched = [c for c in PREFERRED_COLUMNS if c in df.columns]
    unknown = [c for c in df.columns if c not in RENAME_MAP.values() and c not in df.columns.tolist()]

    warnings = []
    missing_required = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing_required:
        warnings.append(f"Missing REQUIRED columns: {', '.join(missing_required)}")
    missing_preferred = [c for c in PREFERRED_COLUMNS if c not in df.columns]
    if missing_preferred:
        warnings.append(f"Missing nice-to-have columns: {', '.join(missing_preferred)}")
    # Mobile sanity
    if "mobile" in df.columns:
        n_blank = int(df["mobile"].isna().sum() + (df["mobile"] == "").sum())
        if n_blank > 0:
            pct = 100 * n_blank / max(1, len(df))
            warnings.append(f"{n_blank:,} rows ({pct:.1f}%) have a blank mobile — these won't join to the customer master")

    return {
        "df": df,
        "columns_in": columns_in,
        "columns_matched": matched,
        "columns_preferred_matched": preferred_matched,
        "warnings": warnings,
        "missing_required": missing_required,
    }


# ----------------------------------------------------------------------
# Profile = validate-only (no commit)
# ----------------------------------------------------------------------
def profile(buffer: bytes, file_name: str) -> dict[str, Any]:
    """Inspect an uploaded file without committing it. Returns enough
    info for the UI to show a confirmation dialog."""
    import pandas as pd

    try:
        df = _read_input(buffer, file_name)
    except Exception as exc:  # noqa: BLE001
        return {"blocked": True, "error": "parse_failed", "detail": str(exc)}

    if df is None or len(df) == 0:
        return {"blocked": True, "error": "empty_file"}

    info = _normalize(df)
    df = info["df"]
    blocked = bool(info["missing_required"])

    # Date range
    date_min, date_max = "", ""
    if "date" in df.columns:
        try:
            date_min = pd.to_datetime(df["date"]).min().strftime("%Y-%m-%d")
            date_max = pd.to_datetime(df["date"]).max().strftime("%Y-%m-%d")
        except Exception:  # noqa: BLE001
            pass

    # Distinct counts (small + cheap)
    distinct = {}
    for col in ("product_name", "area", "hub", "mobile"):
        if col in df.columns:
            distinct[col] = int(df[col].nunique())

    # Compare with current
    current = read_meta()

    return {
        "blocked": blocked,
        "file_name": file_name,
        "row_count": int(len(df)),
        "columns_matched": info["columns_matched"],
        "columns_preferred_matched": info["columns_preferred_matched"],
        "warnings": info["warnings"],
        "missing_required": info["missing_required"],
        "date_range": {"from": date_min, "to": date_max},
        "distinct_counts": distinct,
        "current": current,
    }


# ----------------------------------------------------------------------
# Commit = write parquet + csv.gz atomically + invalidate caches
# ----------------------------------------------------------------------
def commit(buffer: bytes, file_name: str) -> dict[str, Any]:
    """Write the parsed dataframe to disk, replace the live store atomically,
    and invalidate downstream caches (embeddings, schema summary)."""
    import pandas as pd

    df = _read_input(buffer, file_name)
    info = _normalize(df)
    df = info["df"]
    if info["missing_required"]:
        return {
            "ok": False,
            "error": "missing_required_columns",
            "detail": info["missing_required"],
        }
    if df.empty:
        return {"ok": False, "error": "empty_after_parse"}

    parquet_tmp = PARQUET_PATH.with_suffix(".parquet.tmp")
    csvgz_tmp = CSVGZ_PATH.with_suffix(".csv.gz.tmp")
    try:
        df.to_parquet(parquet_tmp, compression="snappy", index=False)
    except Exception as exc:  # noqa: BLE001
        logger.warning("sales_import: parquet write failed: %s — falling back to CSV.gz only", exc)
        try:
            parquet_tmp.unlink(missing_ok=True)
        except Exception:  # noqa: BLE001
            pass
    try:
        df.to_csv(csvgz_tmp, index=False, compression="gzip")
    except Exception as exc:  # noqa: BLE001
        logger.error("sales_import: csv.gz write failed: %s", exc)
        return {"ok": False, "error": "write_failed", "detail": str(exc)}

    # Atomic swap — both files at once
    if parquet_tmp.is_file():
        os.replace(parquet_tmp, PARQUET_PATH)
    if csvgz_tmp.is_file():
        os.replace(csvgz_tmp, CSVGZ_PATH)

    # Date range for meta
    date_range = {"from": "", "to": ""}
    if "date" in df.columns:
        try:
            date_range["from"] = pd.to_datetime(df["date"]).min().strftime("%Y-%m-%d")
            date_range["to"] = pd.to_datetime(df["date"]).max().strftime("%Y-%m-%d")
        except Exception:  # noqa: BLE001
            pass

    distinct_counts = {}
    for col in ("product_name", "area", "hub", "mobile"):
        if col in df.columns:
            distinct_counts[col] = int(df[col].nunique())

    meta = {
        "file_name": file_name,
        "row_count": int(len(df)),
        "uploaded_at": datetime.utcnow().isoformat() + "Z",
        "date_range": date_range,
        "distinct_counts": distinct_counts,
        "columns": list(df.columns),
        "warnings": info["warnings"],
    }
    write_meta(meta)

    # Invalidate downstream caches so the next chat / dashboard pull
    # rebuilds against the new sales data.
    try:
        from .data_summary import invalidate as invalidate_summary
        from .embeddings import invalidate as invalidate_embeddings
        invalidate_summary()
        invalidate_embeddings()
    except Exception as exc:  # noqa: BLE001
        logger.warning("sales_import: cache invalidation warning: %s", exc)

    return {"ok": True, "meta": meta}


# ----------------------------------------------------------------------
# Meta read/write
# ----------------------------------------------------------------------
def write_meta(meta: dict[str, Any]) -> None:
    tmp = META_PATH.with_suffix(".json.tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=2)
    os.replace(tmp, META_PATH)


def read_meta() -> dict[str, Any] | None:
    """Inspect the live sales meta. If meta is missing but the parquet exists
    (e.g. legacy hand-loaded data), synthesize a minimal meta from the file."""
    if META_PATH.is_file():
        try:
            with META_PATH.open("r", encoding="utf-8") as fh:
                return json.load(fh)
        except Exception:  # noqa: BLE001
            pass
    if PARQUET_PATH.is_file():
        size = PARQUET_PATH.stat().st_size
        return {
            "file_name": "(pre-existing sales.parquet)",
            "row_count": None,
            "uploaded_at": datetime.utcfromtimestamp(PARQUET_PATH.stat().st_mtime).isoformat() + "Z",
            "date_range": {"from": "", "to": ""},
            "distinct_counts": {},
            "columns": [],
            "warnings": [],
            "size_bytes": size,
        }
    return None


# ----------------------------------------------------------------------
# Background re-warmup of embeddings after a sales upload.
# Called by the route handler after commit so the user gets an immediate
# response while the index rebuilds in the background.
# ----------------------------------------------------------------------
def schedule_embedding_rewarm(session) -> None:
    """Run embeddings.warmup synchronously on a worker thread. Caller
    handles the asyncio.to_thread / BackgroundTasks scheduling — this just
    runs the work."""
    try:
        from .embeddings import warmup
        warmup(session)
    except Exception as exc:  # noqa: BLE001
        logger.warning("sales_import: embedding rewarm failed: %s", exc)
