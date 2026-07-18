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
LOCK_PATH = CACHE_DIR / "sales_import.lock"

# Upload size guard — applied at the route layer. 200 MB is generous enough
# for a year of MilkMaster sales (~30 MB compressed) with 6x headroom but
# small enough that a malicious 10 GB upload can't OOM the server.
MAX_UPLOAD_BYTES = 200 * 1024 * 1024


# ----------------------------------------------------------------------
# Cross-process write lock — prevents two concurrent uploads from racing
# read-modify-write on sales.parquet (which would silently drop one side's
# rows). Built on a file lock so it survives process restart.
# ----------------------------------------------------------------------
import contextlib
import threading
import time

# In-process serialization for the same uvicorn worker
_write_lock = threading.Lock()


@contextlib.contextmanager
def _exclusive_dataset_lock(timeout_seconds: float = 60.0):
    """Best-effort cross-process + in-process write lock around the sales
    dataset. Uses an exclusive file create (O_EXCL) on POSIX/Windows so two
    workers can't both think they own the dataset. Falls back to in-process
    only if the OS file system doesn't support O_EXCL.
    """
    _write_lock.acquire(timeout=timeout_seconds)
    fd = None
    deadline = time.monotonic() + timeout_seconds
    try:
        while True:
            try:
                # O_EXCL: fail if file exists. Atomic on all major filesystems.
                fd = os.open(str(LOCK_PATH), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(fd, str(os.getpid()).encode("ascii"))
                break
            except FileExistsError:
                if time.monotonic() > deadline:
                    raise RuntimeError(
                        f"sales_import: could not acquire write lock within {timeout_seconds}s. "
                        "Another upload may be in progress, or a previous upload crashed without "
                        f"releasing the lock at {LOCK_PATH}."
                    )
                time.sleep(0.5)
            except OSError as exc:
                # Filesystem doesn't support O_EXCL — degrade gracefully to thread lock only.
                logger.warning("sales_import: file lock unavailable (%s), using in-process lock only", exc)
                break
        yield
    finally:
        if fd is not None:
            try:
                os.close(fd)
            except OSError:
                pass
            try:
                LOCK_PATH.unlink(missing_ok=True)
            except OSError:
                pass
        _write_lock.release()


def _atomic_write_dataset(df) -> None:
    """Write parquet + csv.gz together — either BOTH swap in or NEITHER.
    Raises RuntimeError on any write failure with the originals untouched."""
    parquet_tmp = PARQUET_PATH.with_suffix(".parquet.tmp")
    csvgz_tmp = CSVGZ_PATH.with_suffix(".csv.gz.tmp")
    # Clean stale tmps from any previous crash
    for p in (parquet_tmp, csvgz_tmp):
        try:
            p.unlink(missing_ok=True)
        except OSError:
            pass
    try:
        df.to_parquet(parquet_tmp, compression="snappy", index=False)
    except Exception as exc:  # noqa: BLE001
        try:
            parquet_tmp.unlink(missing_ok=True)
        except OSError:
            pass
        raise RuntimeError(f"parquet write failed: {exc}") from exc
    try:
        df.to_csv(csvgz_tmp, index=False, compression="gzip")
    except Exception as exc:  # noqa: BLE001
        # Roll back the successful parquet tmp so we don't half-swap
        try:
            parquet_tmp.unlink(missing_ok=True)
        except OSError:
            pass
        try:
            csvgz_tmp.unlink(missing_ok=True)
        except OSError:
            pass
        raise RuntimeError(f"csv.gz write failed: {exc}") from exc
    # Both tmps wrote OK — swap atomically
    os.replace(parquet_tmp, PARQUET_PATH)
    os.replace(csvgz_tmp, CSVGZ_PATH)

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

    with _exclusive_dataset_lock():
        try:
            _atomic_write_dataset(df)
        except RuntimeError as exc:
            return {"ok": False, "error": "write_failed", "detail": str(exc)}

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


# ----------------------------------------------------------------------
# APPEND MODE — non-destructive merge of a new sales export into the
# existing dataset. Designed for the MilkMaster workflow where exports
# are limited to ~2 months; users incrementally build a full year over
# 6 uploads without losing history.
#
# Dedup key: (date, customer_id, product_id, mobile)
#
# NOTE — `invoice_id` was deliberately REMOVED from this key in July 2026
# after it silently corrupted April 2026.
#
# What happened: April was re-exported from MilkMaster and appended. The
# re-export carried DIFFERENT invoice_ids for the same physical deliveries, so
# every row looked new to the old key, "skip" mode appended all of it, and the
# month ended up with 1.65 rows per (customer, date, product) instead of 1.00
# — 55,822 rows and Rs 65.7L against MilkMaster's true 35,453 rows / Rs 41.7L.
# A 57% overstatement that no error surfaced, because from the key's point of
# view nothing collided.
#
# Including a volatile, source-assigned identifier in a dedup key means the key
# can only ever detect *byte-identical re-exports*. The business fact we
# actually need to deduplicate on is "this customer received this product on
# this day" — which is stable no matter how many times MilkMaster re-issues
# the paperwork. Hence the key below.
#
# Trade-off accepted: a customer legitimately receiving the same product twice
# in one day on two separate invoices now collapses to one row under "skip".
# That is rare (0.1% of groups in the verified-clean months) and vastly
# preferable to silently inflating a month by 57%.
#
# Strategies (when the new file's date range overlaps existing data):
#   - "skip"     → keep existing rows on collision; only append rows whose
#                  composite key is NOT already in the dataset. SAFE DEFAULT.
#                  Recommended for "I'm uploading May-Jun, my old data ends
#                  Apr 24, the Apr overlap is just re-export of correct data."
#   - "replace"  → for every composite key in the new file, drop the matching
#                  row from existing, then add the new file's version. Use
#                  when MilkMaster fixed an error and you're pulling the
#                  correction — this is the right mode for a re-export.
#
# Atomic write contract identical to commit() — .tmp then os.replace().
# ----------------------------------------------------------------------
DEDUP_KEY_COLUMNS = ("date", "customer_id", "product_id", "mobile")


def _read_existing_parquet():
    """Load the current sales parquet if it exists. Returns None on missing/empty."""
    if not PARQUET_PATH.is_file():
        return None
    try:
        import pandas as pd
        df = pd.read_parquet(PARQUET_PATH)
        return df if not df.empty else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("sales_import: existing parquet read failed: %s", exc)
        return None


# Sentinel value used in place of NaN/missing in the dedup key. Distinct
# from any real value MilkMaster emits (no real mobile or product_id is
# this literal string), so missing-on-existing and missing-on-new collide
# on the same key rather than spuriously diverging.
_NULL_SENTINEL = "__NULL__"


def _coerce_dedup_columns(df):
    """Normalize the dedup-key columns so set membership is stable across the
    existing dataset and the new file.

    Critical for production safety: pandas can otherwise treat the same row
    as different (NaN vs "" mobile, missing invoice rendered as 0 vs NaN,
    string '7' vs int 7, datetime tz vs no-tz, etc.). Every coercion below
    is deliberate and tested.
    """
    import pandas as pd
    out = df.copy()

    # date → date object (drops time component if any). NaN dates become None.
    if "date" in out.columns:
        out["date"] = pd.to_datetime(out["date"], errors="coerce").dt.date

    # invoice_id → string. Pandas Int64 + NaN doesn't hash consistently
    # across the existing/new boundary; using a sentinel string for missing
    # ones lets NaN-NaN match NaN-NaN but NEVER collide with a real
    # invoice_id=0 (which is a real MilkMaster placeholder for cash pickups).
    if "invoice_id" in out.columns:
        s = pd.to_numeric(out["invoice_id"], errors="coerce")
        out["invoice_id"] = s.apply(
            lambda v: _NULL_SENTINEL if pd.isna(v) else f"{int(v)}"
        )

    # product_id → string. Missing → sentinel so two missing-product_id rows
    # are still treated as the same row (not as distinct unknowns).
    if "product_id" in out.columns:
        def _coerce_product(v):
            if pd.isna(v) or v is None or v == "":
                return _NULL_SENTINEL
            return str(v).strip()
        out["product_id"] = out["product_id"].apply(_coerce_product)

    # customer_id → string. Belt-and-suspenders alongside mobile: two
    # customers can share a mobile (family / business), but customer_id is
    # the MilkMaster source-of-truth identifier, so adding it to the key
    # prevents silent merges across distinct accounts.
    if "customer_id" in out.columns:
        def _coerce_customer(v):
            if pd.isna(v) or v is None or v == "":
                return _NULL_SENTINEL
            return str(v).strip().removesuffix(".0")
        out["customer_id"] = out["customer_id"].apply(_coerce_customer)

    # mobile → string of digits. Critical: pandas string-dtype NaN renders
    # as "<NA>" while object-dtype NaN renders as "nan"; both must collapse
    # to the SAME sentinel so existing-side and new-side missing mobiles
    # collide correctly.
    if "mobile" in out.columns:
        def _coerce_mobile(v):
            if pd.isna(v) or v is None:
                return _NULL_SENTINEL
            s = str(v).strip()
            if not s or s.lower() == "nan" or s == "<NA>":
                return _NULL_SENTINEL
            # Strip ".0" trailing from float-cast and any whitespace
            return s.removesuffix(".0").strip()
        out["mobile"] = out["mobile"].apply(_coerce_mobile)

    return out


def _dedup_key_set(df):
    """Build a set of tuples (date, invoice_id, product_id, mobile) for O(1) lookup.
    Raises if a required dedup-key column is missing — silently degrading would
    cause unbounded duplication on every subsequent upload."""
    if df is None or df.empty:
        return set()
    missing = [c for c in DEDUP_KEY_COLUMNS if c not in df.columns]
    if missing:
        raise RuntimeError(
            f"dedup key column(s) missing from dataframe: {missing}. "
            "Cannot append safely without these columns; reject the upload "
            "or fall back to replace mode."
        )
    return set(df[list(DEDUP_KEY_COLUMNS)].itertuples(index=False, name=None))


def check_completeness(new_df, existing_df) -> dict[str, Any]:
    """Detect a PARTIAL export before it silently corrupts the dataset.

    Why this exists: the dedup key protects against duplicate rows, but it is
    useless against MISSING rows — a hub-filtered export has nothing to collide
    with, so the import succeeds cleanly and the numbers just quietly go wrong.

    This has happened twice on real data:
      * a Pune-only file appended over a period that should have had both hubs,
      * May 2026 stored with 25,586 Pune rows and ZERO Chinchwad, understating
        the month by Rs 9.28L and hiding 456 real customers for weeks.

    Neither raised an error. Both were found by eye, long after the fact.

    So: compare the incoming file's hub mix and per-day customer volume against
    what the existing dataset shows for a comparable recent window, and surface
    anything that looks truncated. Advisory, not fatal — the caller decides
    whether to block. A genuinely hub-specific upload is legitimate; it just
    has to be a deliberate choice rather than an accident.
    """
    import pandas as pd

    issues: list[dict[str, Any]] = []
    if new_df is None or new_df.empty:
        return {"ok": True, "issues": issues}

    new_dates = pd.to_datetime(new_df["date"], errors="coerce")
    win_lo, win_hi = new_dates.min(), new_dates.max()
    span_days = max((win_hi - win_lo).days + 1, 1)

    # ---- hub coverage -------------------------------------------------
    if existing_df is not None and not existing_df.empty and "hub" in new_df.columns:
        ex_dates = pd.to_datetime(existing_df["date"], errors="coerce")
        # Reference = the 60 days of existing data before this file's window.
        ref = existing_df[(ex_dates < win_lo) & (ex_dates >= win_lo - pd.Timedelta(days=60))]
        if ref.empty:  # brand-new history — fall back to the whole dataset
            ref = existing_df

        def hubset(d):
            h = d["hub"].fillna("").astype(str).str.strip()
            return {x for x in h.unique() if x}

        ref_hubs, new_hubs = hubset(ref), hubset(new_df)
        absent = ref_hubs - new_hubs
        if absent and ref_hubs:
            ref_counts = ref["hub"].fillna("").astype(str).str.strip().value_counts()
            lost_share = sum(ref_counts.get(h, 0) for h in absent) / max(len(ref), 1)
            issues.append({
                "code": "missing_hub",
                "severity": "blocking" if lost_share > 0.05 else "warning",
                "message": (
                    f"This file contains no rows for: {', '.join(sorted(absent))}. "
                    f"Your recent data has {len(ref_hubs)} hub(s) "
                    f"({', '.join(sorted(ref_hubs))}), and the missing one(s) account for "
                    f"{100*lost_share:.0f}% of recent deliveries. "
                    "If you exported with a hub filter, re-export with ALL hubs selected."
                ),
                "detail": {"expected_hubs": sorted(ref_hubs), "file_hubs": sorted(new_hubs),
                           "missing_hubs": sorted(absent), "recent_share_missing": round(lost_share, 4)},
            })

    # ---- daily volume -------------------------------------------------
    if existing_df is not None and not existing_df.empty:
        ex_dates = pd.to_datetime(existing_df["date"], errors="coerce")
        ref = existing_df[(ex_dates < win_lo) & (ex_dates >= win_lo - pd.Timedelta(days=60))]
        if not ref.empty:
            ref_per_day = len(ref) / max(pd.to_datetime(ref["date"]).dt.date.nunique(), 1)
            new_per_day = len(new_df) / max(new_dates.dt.date.nunique(), 1)
            if ref_per_day > 0 and new_per_day < ref_per_day * 0.75:
                issues.append({
                    "code": "low_volume",
                    "severity": "warning",
                    "message": (
                        f"This file averages {new_per_day:,.0f} rows/day, but your recent data "
                        f"averages {ref_per_day:,.0f} ({100*(new_per_day/ref_per_day-1):+.0f}%). "
                        "It may be a partial export."
                    ),
                    "detail": {"file_rows_per_day": round(new_per_day, 1),
                               "recent_rows_per_day": round(ref_per_day, 1)},
                })

    # ---- calendar gaps inside the file's own window --------------------
    present = set(new_dates.dt.date.dropna().unique())
    expected = set(pd.date_range(win_lo, win_hi, freq="D").date)
    gaps = sorted(expected - present)
    if gaps and span_days > 1:
        issues.append({
            "code": "missing_days",
            "severity": "warning",
            "message": (
                f"{len(gaps)} day(s) inside this file's own date range have no rows at all"
                + (f" (e.g. {', '.join(str(g) for g in gaps[:5])})" if gaps else "")
                + ". Confirm those were genuinely non-delivery days."
            ),
            "detail": {"missing_days": [str(g) for g in gaps[:30]], "count": len(gaps)},
        })

    return {
        "ok": not any(i["severity"] == "blocking" for i in issues),
        "issues": issues,
        "blocking": [i for i in issues if i["severity"] == "blocking"],
    }


def analyze_for_append(buffer: bytes, file_name: str) -> dict[str, Any]:
    """Dry-run analysis of an append upload. Returns a structured diff the UI
    can render before the user commits. Does NOT write to disk."""
    import pandas as pd

    new_df_raw = _read_input(buffer, file_name)
    info = _normalize(new_df_raw)
    new_df = info["df"]
    if info["missing_required"]:
        return {
            "ok": False,
            "error": "missing_required_columns",
            "detail": info["missing_required"],
            "warnings": info["warnings"],
        }
    if new_df.empty:
        return {"ok": False, "error": "empty_after_parse", "warnings": info["warnings"]}

    existing_df = _read_existing_parquet()
    new_df_keyed = _coerce_dedup_columns(new_df)
    completeness = check_completeness(new_df, existing_df)

    new_range = (
        pd.to_datetime(new_df_keyed["date"]).min().strftime("%Y-%m-%d"),
        pd.to_datetime(new_df_keyed["date"]).max().strftime("%Y-%m-%d"),
    )

    if existing_df is None:
        return {
            "ok": True,
            "first_upload": True,
            "existing_range": None,
            "existing_row_count": 0,
            "new_range": {"from": new_range[0], "to": new_range[1]},
            "new_file_row_count": int(len(new_df)),
            "has_overlap": False,
            "overlap_range": None,
            "duplicate_count_in_overlap": 0,
            "truly_new_rows": int(len(new_df)),
            "projected_total_after_skip": int(len(new_df)),
            "projected_total_after_replace": int(len(new_df)),
            "warnings": info["warnings"]
            + ["No existing sales dataset — this upload will become the initial dataset."],
            "completeness": completeness,
        }

    existing_keyed = _coerce_dedup_columns(existing_df)
    existing_range = (
        pd.to_datetime(existing_keyed["date"]).min().strftime("%Y-%m-%d"),
        pd.to_datetime(existing_keyed["date"]).max().strftime("%Y-%m-%d"),
    )

    # Overlap by date range (string comparison works because ISO YYYY-MM-DD sorts correctly)
    overlap_start = max(existing_range[0], new_range[0])
    overlap_end = min(existing_range[1], new_range[1])
    has_overlap = overlap_start <= overlap_end

    # Composite key membership — compute every projection from row-level
    # itertuples so multi-row-per-key cases (e.g. existing rows sharing the
    # invoice_id=0 placeholder) project correctly.
    existing_keys_list = list(
        existing_keyed[list(DEDUP_KEY_COLUMNS)].itertuples(index=False, name=None)
    )
    existing_keys_set = set(existing_keys_list)
    new_keys_list = list(
        new_df_keyed[list(DEDUP_KEY_COLUMNS)].itertuples(index=False, name=None)
    )
    new_keys_set = set(new_keys_list)
    # Rows in the new file whose key collides with existing — what skip drops
    rows_overlapping_existing = sum(1 for k in new_keys_list if k in existing_keys_set)
    # Rows in the new file whose key does NOT collide — what skip will keep
    rows_appended_under_skip = len(new_df) - rows_overlapping_existing
    # Rows in existing whose key is in the new file — what replace drops
    rows_in_existing_matching_new = sum(1 for k in existing_keys_list if k in new_keys_set)
    # Internal dupes within the new file itself
    internal_dupes_in_new_file = len(new_keys_list) - len(new_keys_set)
    # Distinct new keys that collide with existing — informational
    distinct_overlap_keys = len(new_keys_set & existing_keys_set)

    # Gap detection — if the new file's start is more than 1 day after existing end,
    # there's a gap. Conversely if new file ends before existing starts, weird.
    gap_warning = None
    try:
        existing_max = pd.to_datetime(existing_range[1])
        new_min = pd.to_datetime(new_range[0])
        new_max = pd.to_datetime(new_range[1])
        existing_min = pd.to_datetime(existing_range[0])
        if new_min > existing_max + pd.Timedelta(days=2):
            gap = (new_min - existing_max).days
            gap_warning = f"⚠ Gap of {gap} days between existing data (ending {existing_range[1]}) and new file (starting {new_range[0]}). Some days in between will have no sales data."
        if new_max < existing_min:
            gap_warning = (
                f"⚠ New file ({new_range[0]} → {new_range[1]}) is entirely BEFORE existing data ({existing_range[0]} → {existing_range[1]})."
                " That's fine — historical backfill — but make sure this is what you intended."
            )
    except Exception:  # noqa: BLE001
        pass

    warnings_out = list(info["warnings"])
    if gap_warning:
        warnings_out.append(gap_warning)

    # Recommended strategy
    if rows_overlapping_existing == 0:
        recommended = "skip"
        recommendation_reason = "No duplicates — append is a pure addition."
    elif rows_overlapping_existing == len(new_df):
        recommended = "skip"
        recommendation_reason = "Every row in the new file already exists. Committing with 'skip' is a no-op; 'replace' would overwrite existing rows with identical data."
    else:
        recommended = "skip"
        recommendation_reason = "Most uploads are re-exports of the same overlap range. 'Skip' keeps existing rows and adds only the truly new ones — safe default."

    if internal_dupes_in_new_file > 0:
        warnings_out.append(
            f"⚠ The new file contains {internal_dupes_in_new_file:,} internal duplicate rows (same date/invoice/product/mobile). "
            "Under 'replace' these will all merge into the existing dataset as one row each (last-seen wins)."
        )

    return {
        "ok": True,
        "first_upload": False,
        "existing_range": {"from": existing_range[0], "to": existing_range[1]},
        "existing_row_count": int(len(existing_df)),
        "new_range": {"from": new_range[0], "to": new_range[1]},
        "new_file_row_count": int(len(new_df)),
        "has_overlap": bool(has_overlap),
        "overlap_range": {"from": overlap_start, "to": overlap_end} if has_overlap else None,
        # Number of rows in the new file that collide with existing — what skip drops
        "duplicate_count_in_overlap": int(rows_overlapping_existing),
        # Number of new-file rows that skip will keep (distinct + non-colliding rows
        # in the new file. NOTE: this includes internal dupes within the new file
        # that don't collide with existing — accept this as the cost of being
        # consistent with what commit() actually writes under 'skip')
        "truly_new_rows": int(rows_appended_under_skip),
        # Skip: existing + rows_appended_under_skip
        "projected_total_after_skip": int(len(existing_df) + rows_appended_under_skip),
        # Replace: existing minus ALL rows in existing whose key is in new,
        # plus the deduped new file (distinct keys only). The drop side has
        # to be row-counted, not key-counted, because existing may have
        # multiple rows sharing the same composite key.
        "projected_total_after_replace": int(
            len(existing_df) - rows_in_existing_matching_new + len(new_keys_set)
        ),
        "recommended_strategy": recommended,
        "recommendation_reason": recommendation_reason,
        "dedup_key": list(DEDUP_KEY_COLUMNS),
        "internal_duplicates_in_new_file": int(internal_dupes_in_new_file),
        "warnings": warnings_out,
        # Partial-export detection. `completeness.blocking` non-empty means the
        # UI must force an explicit override before this file can be committed.
        "completeness": completeness,
    }


def commit_append(
    buffer: bytes,
    file_name: str,
    strategy: str = "skip",
    confirm_partial: bool = False,
) -> dict[str, Any]:
    """Commit an append-mode upload. strategy = 'skip' (default, safe) or 'replace'.

    `confirm_partial` must be True to proceed when the completeness check finds
    a blocking issue (e.g. an entire hub absent). Defaults to False so a
    filtered export cannot be committed by accident — the failure mode that
    understated May 2026 by Rs 9.28L.
    """
    import pandas as pd

    if strategy not in ("skip", "replace"):
        return {"ok": False, "error": "invalid_strategy", "detail": f"strategy must be 'skip' or 'replace', got {strategy!r}"}

    new_df_raw = _read_input(buffer, file_name)
    info = _normalize(new_df_raw)
    new_df = info["df"]
    if info["missing_required"]:
        return {
            "ok": False,
            "error": "missing_required_columns",
            "detail": info["missing_required"],
            "warnings": info["warnings"],
        }
    if new_df.empty:
        return {"ok": False, "error": "empty_after_parse", "warnings": info["warnings"]}

    # Refuse a partial export unless the caller has explicitly overridden.
    # Checked BEFORE taking the write lock so a rejected upload costs nothing.
    _existing_for_check = _read_existing_parquet()
    completeness = check_completeness(new_df, _existing_for_check)
    if completeness["blocking"] and not confirm_partial:
        return {
            "ok": False,
            "error": "incomplete_export",
            "detail": [i["message"] for i in completeness["blocking"]],
            "completeness": completeness,
        }

    # Serialize concurrent uploads — without this, two workers can each read
    # the same existing_df, each compute a different merged frame, and the
    # last one to swap wipes the other's append (silent data loss).
    with _exclusive_dataset_lock():
        existing_df = _read_existing_parquet()

        if existing_df is None:
            merged = new_df
            rows_before = 0
            duplicate_count = 0
        else:
            existing_keyed = _coerce_dedup_columns(existing_df)
            new_keyed = _coerce_dedup_columns(new_df)
            try:
                existing_keys = _dedup_key_set(existing_keyed)
                new_keys = _dedup_key_set(new_keyed)
            except RuntimeError as exc:
                return {"ok": False, "error": "incomplete_dedup_key", "detail": str(exc)}
            duplicate_count = len(existing_keys & new_keys)
            rows_before = len(existing_df)

            if strategy == "replace":
                # Drop the new file's internal duplicates first so 'replace'
                # honors the docstring "one row per composite key" promise.
                # Keep LAST seen so corrections in later rows win.
                new_df_deduped = new_df.copy()
                new_df_deduped["__key__"] = list(
                    new_keyed[list(DEDUP_KEY_COLUMNS)].itertuples(index=False, name=None)
                )
                new_df_deduped = new_df_deduped.drop_duplicates(
                    subset=["__key__"], keep="last"
                ).drop(columns=["__key__"])

                # Drop from existing any row whose key is in the (deduped) new set
                mask_keep = [
                    k not in new_keys
                    for k in existing_keyed[list(DEDUP_KEY_COLUMNS)].itertuples(index=False, name=None)
                ]
                kept = existing_df[mask_keep]
                merged = pd.concat([kept, new_df_deduped], ignore_index=True)
            else:  # skip
                # Drop from new the rows whose key is in existing
                mask_keep_new = [
                    k not in existing_keys
                    for k in new_keyed[list(DEDUP_KEY_COLUMNS)].itertuples(index=False, name=None)
                ]
                kept_new = new_df[mask_keep_new]
                merged = pd.concat([existing_df, kept_new], ignore_index=True)

        # Sort by date so the parquet is clean — also makes time-series queries faster
        if "date" in merged.columns:
            try:
                merged = merged.sort_values("date", kind="mergesort").reset_index(drop=True)
            except Exception:  # noqa: BLE001
                pass

        # Atomic write — parquet AND csv.gz commit together or neither does
        try:
            _atomic_write_dataset(merged)
        except RuntimeError as exc:
            return {"ok": False, "error": "write_failed", "detail": str(exc)}

        # Build meta from the MERGED dataset (not just the new file)
        date_range = {"from": "", "to": ""}
        if "date" in merged.columns:
            try:
                date_range["from"] = pd.to_datetime(merged["date"]).min().strftime("%Y-%m-%d")
                date_range["to"] = pd.to_datetime(merged["date"]).max().strftime("%Y-%m-%d")
            except Exception:  # noqa: BLE001
                pass

        distinct_counts = {}
        for col in ("product_name", "area", "hub", "mobile"):
            if col in merged.columns:
                distinct_counts[col] = int(merged[col].nunique())

        rows_added = int(len(merged) - rows_before)

        meta = {
            "file_name": file_name,
            "row_count": int(len(merged)),
            "uploaded_at": datetime.utcnow().isoformat() + "Z",
            "date_range": date_range,
            "distinct_counts": distinct_counts,
            "columns": list(merged.columns),
            "warnings": info["warnings"],
            "completeness": completeness,
            "merge_strategy": strategy,
            "append_summary": {
                "rows_before": rows_before,
                "new_file_rows": int(len(new_df)),
                "duplicates_detected": int(duplicate_count),
                "rows_added": rows_added,
                "strategy_used": strategy,
            },
        }
        write_meta(meta)

    # Invalidate downstream caches so the next chat / dashboard pull rebuilds
    try:
        from .data_summary import invalidate as invalidate_summary
        from .embeddings import invalidate as invalidate_embeddings
        invalidate_summary()
        invalidate_embeddings()
    except Exception as exc:  # noqa: BLE001
        logger.warning("sales_import: cache invalidation warning: %s", exc)

    # Invalidate the DuckDB engine's customer parquet cache too — even though
    # we only changed sales, the DuckDB views are rebuilt per-query so this is
    # belt-and-suspenders; the views read the updated sales.parquet next call.
    return {"ok": True, "meta": meta}
