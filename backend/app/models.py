from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class ImportJobStatus(str, Enum):
    queued = "queued"
    processing = "processing"
    succeeded = "succeeded"
    failed = "failed"


class SnapshotKind(str, Enum):
    full = "full"


class ImportJob(Base):
    __tablename__ = "import_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    source_system: Mapped[str] = mapped_column(String(100), default="milkmaster")
    source_entity: Mapped[str] = mapped_column(String(100), default="customers")
    snapshot_kind: Mapped[str] = mapped_column(String(32), default=SnapshotKind.full.value)
    status: Mapped[str] = mapped_column(String(32), default=ImportJobStatus.queued.value, index=True)
    file_name: Mapped[str] = mapped_column(String(255))
    storage_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    fingerprint: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    row_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    detected_schema: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    snapshots: Mapped[list["DatasetSnapshot"]] = relationship(back_populates="import_job")


class DatasetSnapshot(Base):
    __tablename__ = "dataset_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    import_job_id: Mapped[str] = mapped_column(ForeignKey("import_jobs.id"), index=True)
    source_system: Mapped[str] = mapped_column(String(100), default="milkmaster")
    source_entity: Mapped[str] = mapped_column(String(100), default="customers")
    snapshot_kind: Mapped[str] = mapped_column(String(32), default=SnapshotKind.full.value)
    source_file_name: Mapped[str] = mapped_column(String(255))
    fingerprint: Mapped[str] = mapped_column(String(128), index=True)
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    imported_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    import_job: Mapped["ImportJob"] = relationship(back_populates="snapshots")
    customers: Mapped[list["CustomerRecord"]] = relationship(back_populates="snapshot")


class CustomerRecord(Base):
    __tablename__ = "customer_records"
    __table_args__ = (
        UniqueConstraint("dataset_snapshot_id", "source_customer_id", name="uq_customer_snapshot_source_id"),
        Index("ix_customer_records_mobile", "mobile"),
        Index("ix_customer_records_area", "area"),
        Index("ix_customer_records_hub", "hub"),
        Index("ix_customer_records_temp_customer_status", "temp_customer_status"),
        Index("ix_customer_records_subscription_status", "subscription_status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dataset_snapshot_id: Mapped[str] = mapped_column(ForeignKey("dataset_snapshots.id"), index=True)

    source_customer_id: Mapped[str] = mapped_column(String(64))
    mobile: Mapped[str] = mapped_column(String(32), default="")
    alternate_mobile: Mapped[str] = mapped_column(String(32), default="")
    name: Mapped[str] = mapped_column(String(255), default="")
    geo_location_html: Mapped[str] = mapped_column(Text, default="")

    temp_customer_status: Mapped[str] = mapped_column(String(120), default="")
    subscription_status: Mapped[str] = mapped_column(String(120), default="")
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    dnd: Mapped[bool] = mapped_column(Boolean, default=False)

    source: Mapped[str] = mapped_column(String(120), default="")
    sub_source: Mapped[str] = mapped_column(String(120), default="")
    campaign_name: Mapped[str] = mapped_column(String(255), default="")
    note: Mapped[str] = mapped_column(Text, default="")

    total_orders: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_revenue: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    current_consumption: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)

    payment_mode: Mapped[str] = mapped_column(String(120), default="")
    payment_type: Mapped[str] = mapped_column(String(120), default="")
    wallet_balance_spend: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    effective_wallet_balance_current: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    credit_limit: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    due_since: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    last_payment_before_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    route_name: Mapped[str] = mapped_column(String(255), default="")
    delivery_boy: Mapped[str] = mapped_column(String(255), default="")
    delivery_preference: Mapped[str] = mapped_column(Text, default="")
    time_slot: Mapped[str] = mapped_column(String(120), default="")

    area: Mapped[str] = mapped_column(String(255), default="")
    sub_area: Mapped[str] = mapped_column(String(255), default="")
    hub: Mapped[str] = mapped_column(String(255), default="")
    city: Mapped[str] = mapped_column(String(255), default="")
    address: Mapped[str] = mapped_column(Text, default="")
    crm_agent: Mapped[str] = mapped_column(String(255), default="")
    created_by: Mapped[str] = mapped_column(String(255), default="")
    customer_type: Mapped[str] = mapped_column(String(120), default="")

    email_id: Mapped[str] = mapped_column(String(255), default="")
    gst_number: Mapped[str] = mapped_column(String(120), default="")

    follow_up_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    first_delivery_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_delivery_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    row_hash: Mapped[str] = mapped_column(String(128), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    snapshot: Mapped["DatasetSnapshot"] = relationship(back_populates="customers")


class QueryMemory(Base):
    """Persistent log of past agent runs.

    Used as few-shot retrieval: when a new question comes in, we embed it
    and pull the top-K most similar past questions (excluding ones flagged
    as bad). Their question + tool calls are injected as few-shot examples
    so the agent benefits from prior successful patterns.
    """
    __tablename__ = "query_memory"
    __table_args__ = (
        Index("ix_query_memory_snapshot_id", "snapshot_id"),
        Index("ix_query_memory_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    snapshot_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    question: Mapped[str] = mapped_column(Text)
    # Embedding stored as JSON list[float]. We do top-k cosine in Python at
    # current scale; switch to pgvector when N > ~5000.
    embedding: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # Compact log of tool calls — name + args + summary per call.
    tool_calls: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # The most useful generated code (DuckDB SQL or pandas) for retrieval injection.
    generated_code: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    headline_value: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    blocks_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    validator_verdict: Mapped[str] = mapped_column(String(32), default="unknown")
    thumbs_up: Mapped[int] = mapped_column(Integer, default=0)
    thumbs_down: Mapped[int] = mapped_column(Integer, default=0)
    model_used: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
