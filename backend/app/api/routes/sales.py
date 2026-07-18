from fastapi import APIRouter, Depends, HTTPException, Query, status

from ...auth import AuthUser, require_permission
from ...services import geo_analytics, sales_analytics

router = APIRouter(prefix="/api/sales", tags=["sales"])


@router.get("/products")
def products(_actor: AuthUser = Depends(require_permission("reports:read"))) -> dict:
    """Distinct product + weight combos from the live sales dataset, for the
    Daily Product Sales picker. Each weight carries its row / qty / revenue
    totals so the UI can show how big each pack-size is."""
    payload = sales_analytics.list_products()
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No sales dataset found. Upload sales transactions first.",
        )
    return payload


@router.get("/daily")
def daily(
    product: str = Query(..., min_length=1, description="Exact product_name, e.g. 'Desi Cow A2 Milk'"),
    weight: str | None = Query(None, description="Exact product_weight, e.g. '1 litre'. Omit for all weights."),
    hub: str | None = Query(None, description="Exact hub name. Omit for all hubs."),
    start: str | None = Query(None, description="Window start (YYYY-MM-DD). Defaults to first matching sale."),
    end: str | None = Query(None, description="Window end (YYYY-MM-DD). Defaults to last matching sale."),
    status_filter: str = Query("delivered", alias="status", description="'delivered' (default) or 'all'."),
    _actor: AuthUser = Depends(require_permission("reports:read")),
) -> dict:
    """Continuous per-day sales for one product over a date window. Every day
    in the range is returned (zero-filled when there were no sales) so the
    series is a complete calendar suitable for charting and CSV export."""
    payload = sales_analytics.daily_product_sales(
        product=product, weight=weight, start=start, end=end, status=status_filter, hub=hub,
    )
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No sales dataset found. Upload sales transactions first.",
        )
    return payload


@router.get("/by-hub")
def by_hub(
    product: str = Query(..., min_length=1, description="Exact product_name."),
    weight: str | None = Query(None, description="Exact product_weight. Omit for all weights."),
    start: str | None = Query(None, description="Window start (YYYY-MM-DD)."),
    end: str | None = Query(None, description="Window end (YYYY-MM-DD)."),
    status_filter: str = Query("delivered", alias="status", description="'delivered' (default) or 'all'."),
    _actor: AuthUser = Depends(require_permission("reports:read")),
) -> dict:
    """Per-hub split for one product over a date window: each hub's totals,
    share and avg/day, plus a per-hub daily series on a shared date axis for a
    stacked chart. Always covers every hub for the selection."""
    payload = sales_analytics.hub_breakdown(
        product=product, weight=weight, start=start, end=end, status=status_filter,
    )
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No sales dataset found. Upload sales transactions first.",
        )
    return payload


@router.get("/geo-heatmap")
def geo_heatmap(
    start: str | None = Query(None, description="Window start (YYYY-MM-DD). Defaults to `window_days` before the end."),
    end: str | None = Query(None, description="Window end (YYYY-MM-DD). Defaults to the dataset's last sale."),
    hub: str | None = Query(None, description="Exact hub name. Omit for all hubs."),
    status_filter: str = Query("delivered", alias="status", description="'delivered' (default) or 'all'."),
    window_days: int = Query(90, ge=1, le=730, description="Trailing window when `start` is omitted."),
    _actor: AuthUser = Depends(require_permission("reports:read")),
) -> dict:
    """Delivery coordinates aggregated into heat-map points, each carrying both
    revenue and delivery count so the client can weight the layer by either.

    Coordinates come from `delivery_location`, back-filled per customer from
    their other rows. Captures outside the Pune/PCMC bounding box (a known bad
    GPS cluster near Delhi) are excluded and reported under `excluded`. The
    `coverage` block states what share of rows / revenue / customers the map
    actually represents — always surface it, the map is a ~68% sample."""
    payload = geo_analytics.heatmap_points(
        start=start, end=end, hub=hub, status=status_filter, window_days=window_days,
    )
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No sales dataset found. Upload sales transactions first.",
        )
    return payload


@router.get("/daily-by-hub")
def daily_by_hub(
    product: str = Query(..., min_length=1, description="Exact product_name."),
    weight: str | None = Query(None, description="Exact product_weight. Omit for all weights."),
    start: str | None = Query(None, description="Window start (YYYY-MM-DD)."),
    end: str | None = Query(None, description="Window end (YYYY-MM-DD)."),
    status_filter: str = Query("delivered", alias="status", description="'delivered' (default) or 'all'."),
    _actor: AuthUser = Depends(require_permission("reports:read")),
) -> dict:
    """Tidy daily sales split by hub — one record per (date, hub). Powers the
    filterable per-hub Daily sheet in the Excel export."""
    payload = sales_analytics.daily_by_hub(
        product=product, weight=weight, start=start, end=end, status=status_filter,
    )
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No sales dataset found. Upload sales transactions first.",
        )
    return payload
