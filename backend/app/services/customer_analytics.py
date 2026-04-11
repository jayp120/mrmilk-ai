from __future__ import annotations

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from ..models import CustomerRecord, DatasetSnapshot


def _get_current_snapshot(session: Session) -> DatasetSnapshot | None:
    snapshot_id = session.execute(
        select(DatasetSnapshot.id)
        .where(DatasetSnapshot.is_current.is_(True))
        .limit(1)
    ).scalar_one_or_none()
    if not snapshot_id:
        return None
    return session.get(DatasetSnapshot, snapshot_id)


def build_customer_summary(session: Session) -> dict | None:
    snapshot = _get_current_snapshot(session)
    if not snapshot:
        return None

    sid = snapshot.id

    # ------------------------------------------------------------------
    # Overview totals
    # ------------------------------------------------------------------
    ov = session.execute(
        select(
            func.count().label("total_customers"),
            func.coalesce(func.sum(CustomerRecord.total_revenue), 0).label("total_revenue"),
            func.coalesce(func.sum(CustomerRecord.total_orders), 0).label("total_orders"),
            func.coalesce(func.sum(CustomerRecord.effective_wallet_balance_current), 0).label("total_wallet"),
            func.count(case((CustomerRecord.dnd.is_(True), 1))).label("dnd_customers"),
            func.count(case((CustomerRecord.is_blocked.is_(True), 1))).label("blocked_customers"),
        ).where(CustomerRecord.dataset_snapshot_id == sid)
    ).one()

    total_customers = ov.total_customers or 0
    total_revenue = float(ov.total_revenue or 0)
    total_orders = int(ov.total_orders or 0)
    total_wallet = float(ov.total_wallet or 0)
    avg_revenue = round(total_revenue / total_customers, 2) if total_customers else 0.0

    # ------------------------------------------------------------------
    # Status counts (based on subscription_status — "Sub. Status" column)
    # Values like "Active Subscription", "Inactive No Order", "Trial Running", etc.
    # ------------------------------------------------------------------
    sc = session.execute(
        select(
            # "Active%" matches "Active Subscription", "Active No Subscription" but NOT "Inactive..."
            func.count(case((CustomerRecord.subscription_status.ilike("Active%"), 1))).label("active"),
            func.count(case((CustomerRecord.subscription_status.ilike("Inactive%"), 1))).label("inactive"),
            func.count(case((CustomerRecord.subscription_status.ilike("Suspended%"), 1))).label("suspended"),
            func.count(case((CustomerRecord.subscription_status.ilike("Trial%"), 1))).label("trial"),
            func.count(case((CustomerRecord.subscription_status.ilike("New%"), 1))).label("new_cust"),
        ).where(CustomerRecord.dataset_snapshot_id == sid)
    ).one()

    # ------------------------------------------------------------------
    # Subscription status breakdown (subscription_status group by)
    # ------------------------------------------------------------------
    subscription_status = {
        row.subscription_status: row.cnt
        for row in session.execute(
            select(CustomerRecord.subscription_status, func.count().label("cnt"))
            .where(
                CustomerRecord.dataset_snapshot_id == sid,
                CustomerRecord.subscription_status != "",
            )
            .group_by(CustomerRecord.subscription_status)
            .order_by(func.count().desc())
        )
    }

    # ------------------------------------------------------------------
    # Hub performance
    # ------------------------------------------------------------------
    hub_performance: dict = {}
    for row in session.execute(
        select(
            CustomerRecord.hub,
            func.count().label("customers"),
            func.coalesce(func.sum(CustomerRecord.total_revenue), 0).label("revenue"),
            func.coalesce(func.sum(CustomerRecord.total_orders), 0).label("orders"),
        )
        .where(CustomerRecord.dataset_snapshot_id == sid)
        .group_by(CustomerRecord.hub)
        .order_by(func.sum(CustomerRecord.total_revenue).desc().nulls_last())
    ):
        hub_performance[row.hub or "No Hub Assigned"] = {
            "customers": row.customers,
            "revenue": float(row.revenue or 0),
            "orders": int(row.orders or 0),
        }

    # ------------------------------------------------------------------
    # Top 15 areas by revenue
    # ------------------------------------------------------------------
    top_areas_by_revenue: dict = {}
    for row in session.execute(
        select(
            CustomerRecord.area,
            func.count().label("customers"),
            func.coalesce(func.sum(CustomerRecord.total_revenue), 0).label("revenue"),
        )
        .where(CustomerRecord.dataset_snapshot_id == sid, CustomerRecord.area != "")
        .group_by(CustomerRecord.area)
        .order_by(func.sum(CustomerRecord.total_revenue).desc().nulls_last())
        .limit(15)
    ):
        top_areas_by_revenue[row.area] = {
            "customers": row.customers,
            "revenue": float(row.revenue or 0),
        }

    # ------------------------------------------------------------------
    # Wallet stats
    # ------------------------------------------------------------------
    wr = session.execute(
        select(
            func.count(case((CustomerRecord.effective_wallet_balance_current > 0, 1))).label("positive"),
            func.count(case((CustomerRecord.effective_wallet_balance_current == 0, 1))).label("zero"),
            func.count(case((CustomerRecord.effective_wallet_balance_current < 0, 1))).label("negative"),
            func.coalesce(func.avg(CustomerRecord.effective_wallet_balance_current), 0).label("avg_wallet"),
            func.coalesce(func.max(CustomerRecord.effective_wallet_balance_current), 0).label("max_wallet"),
        ).where(CustomerRecord.dataset_snapshot_id == sid)
    ).one()

    wallet_stats = {
        "customers_with_positive_wallet": wr.positive or 0,
        "customers_with_zero_wallet": wr.zero or 0,
        "customers_with_negative_wallet": wr.negative or 0,
        "avg_wallet_balance": round(float(wr.avg_wallet or 0), 2),
        "max_wallet_balance": float(wr.max_wallet or 0),
        "total_wallet": round(total_wallet, 2),
    }

    # ------------------------------------------------------------------
    # Payment mode breakdown
    # ------------------------------------------------------------------
    payment_mode = {
        row.payment_mode: row.cnt
        for row in session.execute(
            select(CustomerRecord.payment_mode, func.count().label("cnt"))
            .where(CustomerRecord.dataset_snapshot_id == sid, CustomerRecord.payment_mode != "")
            .group_by(CustomerRecord.payment_mode)
            .order_by(func.count().desc())
        )
    }

    # ------------------------------------------------------------------
    # Top 10 acquisition sources
    # ------------------------------------------------------------------
    sources = {
        row.source: row.cnt
        for row in session.execute(
            select(CustomerRecord.source, func.count().label("cnt"))
            .where(CustomerRecord.dataset_snapshot_id == sid, CustomerRecord.source != "")
            .group_by(CustomerRecord.source)
            .order_by(func.count().desc())
            .limit(10)
        )
    }

    # ------------------------------------------------------------------
    # Top 10 delivery boys by customer count
    # ------------------------------------------------------------------
    top_delivery_boys = {
        row.delivery_boy: row.cnt
        for row in session.execute(
            select(CustomerRecord.delivery_boy, func.count().label("cnt"))
            .where(CustomerRecord.dataset_snapshot_id == sid, CustomerRecord.delivery_boy != "")
            .group_by(CustomerRecord.delivery_boy)
            .order_by(func.count().desc())
            .limit(10)
        )
    }

    # ------------------------------------------------------------------
    # Consumption
    # ------------------------------------------------------------------
    cr = session.execute(
        select(
            func.coalesce(func.avg(CustomerRecord.current_consumption), 0).label("avg"),
            func.coalesce(func.sum(CustomerRecord.current_consumption), 0).label("total"),
        ).where(
            CustomerRecord.dataset_snapshot_id == sid,
            CustomerRecord.current_consumption > 0,
        )
    ).one()

    # ------------------------------------------------------------------
    # Top 20 customers by total revenue
    # ------------------------------------------------------------------
    top_20_customers = [
        {
            "Name": r.name,
            "Mobile": r.mobile,
            "Area": r.area,
            "Hub": r.hub or "No Hub Assigned",
            "Total Revenue": float(r.total_revenue or 0),
            "Total Orders": r.total_orders or 0,
            "Sub. Status": r.subscription_status,
            "Wallet Balance": float(r.wallet_balance_spend or 0),
        }
        for r in session.execute(
            select(CustomerRecord)
            .where(CustomerRecord.dataset_snapshot_id == sid, CustomerRecord.total_revenue > 0)
            .order_by(CustomerRecord.total_revenue.desc().nulls_last())
            .limit(20)
        ).scalars()
    ]

    # ------------------------------------------------------------------
    # High-value inactive customers
    # ------------------------------------------------------------------
    high_value_inactive = [
        {
            "Name": r.name,
            "Mobile": r.mobile,
            "Area": r.area,
            "Total Revenue": float(r.total_revenue or 0),
            "Total Orders": r.total_orders or 0,
            "Last Delivery": r.last_delivery_date.strftime("%Y-%m-%d") if r.last_delivery_date else "",
        }
        for r in session.execute(
            select(CustomerRecord)
            .where(
                CustomerRecord.dataset_snapshot_id == sid,
                CustomerRecord.temp_customer_status.ilike("%inactive%"),
                CustomerRecord.total_revenue > 0,
            )
            .order_by(CustomerRecord.total_revenue.desc().nulls_last())
            .limit(10)
        ).scalars()
    ]

    # ------------------------------------------------------------------
    # data_date from snapshot
    # ------------------------------------------------------------------
    dt = snapshot.imported_at
    data_date = f"{dt.strftime('%B')} {dt.day}, {dt.year}" if dt else "Unknown Date"

    return {
        "data_date": data_date,
        "snapshot_id": snapshot.id,
        "overview": {
            "total_customers": total_customers,
            "total_revenue": round(total_revenue, 2),
            "total_orders": total_orders,
            "avg_revenue_per_customer": avg_revenue,
            "total_wallet_balance": round(total_wallet, 2),
            "active_customers": sc.active,
            "inactive_customers": sc.inactive,
            "suspended_customers": sc.suspended,
            "trial_customers": sc.trial,
            "new_customers": sc.new_cust,
            "dnd_customers": ov.dnd_customers,
            "blocked_customers": ov.blocked_customers,
        },
        "subscription_status": subscription_status,
        "hub_performance": hub_performance,
        "top_areas_by_revenue": top_areas_by_revenue,
        "wallet_stats": wallet_stats,
        "payment_mode": payment_mode,
        "sources": sources,
        "top_delivery_boys": top_delivery_boys,
        "consumption": {
            "avg_daily_liters": round(float(cr.avg or 0), 3),
            "total_daily_liters": round(float(cr.total or 0), 0),
        },
        "top_20_customers": top_20_customers,
        "high_value_inactive": high_value_inactive,
    }


def build_customer_records(session: Session, snapshot_id: str) -> list[dict]:
    rows = session.execute(
        select(CustomerRecord)
        .where(CustomerRecord.dataset_snapshot_id == snapshot_id)
        .order_by(CustomerRecord.total_revenue.desc().nulls_last())
    ).scalars().all()

    return [
        {
            "name": r.name,
            "mobile": r.mobile,
            "area": r.area,
            "hub": r.hub or "No Hub Assigned",
            "status": r.subscription_status,
            "revenue": float(r.total_revenue or 0),
            "orders": r.total_orders or 0,
            "wallet_balance": float(r.wallet_balance_spend or 0),
            "last_delivery": r.last_delivery_date.strftime("%Y-%m-%d") if r.last_delivery_date else "",
            "source": r.source,
            "payment_mode": r.payment_mode,
            "delivery_boy": r.delivery_boy,
            "current_consumption": float(r.current_consumption or 0),
            "note": r.note,
        }
        for r in rows
    ]
