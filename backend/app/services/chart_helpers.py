"""
Chart spec helpers — generate Vega-Lite and Plotly figure JSON from
common dataframe shapes so the agent doesn't have to hand-author the spec.

The agent CAN still emit hand-rolled vega/plotly specs in its final answer,
but most charts boil down to: bar, line, scatter, pie, heatmap. These
helpers turn a list[dict] into a clean styled spec for those cases.

All output is plain JSON — no Python objects — safe for the
NotebookResponse JSON wire-format.
"""
from __future__ import annotations

from typing import Any

# Mr Milk brand palette — earthy, premium, warm.
PALETTE = ["#7B3F00", "#C77B40", "#E1B07E", "#2FA65D", "#1F6FB4", "#9E2A2B", "#3F3F44"]


def vega_bar(
    data: list[dict[str, Any]],
    *,
    x: str = "name",
    y: str = "value",
    title: str | None = None,
    sort: str | None = "-y",
    color_field: str | None = None,
) -> dict[str, Any]:
    spec: dict[str, Any] = {
        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
        "title": title,
        "data": {"values": data},
        "mark": {"type": "bar", "cornerRadiusEnd": 4},
        "encoding": {
            "x": {"field": x, "type": "nominal", "sort": sort, "axis": {"labelAngle": -30, "title": x.replace("_", " ").title()}},
            "y": {"field": y, "type": "quantitative", "axis": {"title": y.replace("_", " ").title()}},
            "tooltip": [{"field": x}, {"field": y, "format": ",.0f"}],
        },
        "config": {
            "background": "transparent",
            "axis": {"labelColor": "#3F3F44", "titleColor": "#3F3F44"},
            "view": {"stroke": "transparent"},
            "range": {"category": PALETTE},
        },
        "width": "container",
        "height": 320,
    }
    if color_field:
        spec["encoding"]["color"] = {"field": color_field, "type": "nominal"}
    return spec


def vega_line(
    data: list[dict[str, Any]],
    *,
    x: str = "date",
    y: str = "value",
    color_field: str | None = None,
    title: str | None = None,
) -> dict[str, Any]:
    spec: dict[str, Any] = {
        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
        "title": title,
        "data": {"values": data},
        "mark": {"type": "line", "point": True, "strokeWidth": 2},
        "encoding": {
            "x": {"field": x, "type": "temporal", "axis": {"title": x.replace("_", " ").title()}},
            "y": {"field": y, "type": "quantitative", "axis": {"title": y.replace("_", " ").title()}},
            "tooltip": [{"field": x}, {"field": y, "format": ",.0f"}],
        },
        "config": {
            "background": "transparent",
            "axis": {"labelColor": "#3F3F44", "titleColor": "#3F3F44"},
            "view": {"stroke": "transparent"},
            "range": {"category": PALETTE},
        },
        "width": "container",
        "height": 320,
    }
    if color_field:
        spec["encoding"]["color"] = {"field": color_field, "type": "nominal"}
    return spec


def vega_pie(
    data: list[dict[str, Any]],
    *,
    name: str = "name",
    value: str = "value",
    title: str | None = None,
) -> dict[str, Any]:
    return {
        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
        "title": title,
        "data": {"values": data},
        "mark": {"type": "arc", "innerRadius": 60, "outerRadius": 130, "stroke": "#fff", "strokeWidth": 1.5},
        "encoding": {
            "theta": {"field": value, "type": "quantitative"},
            "color": {"field": name, "type": "nominal", "scale": {"range": PALETTE}},
            "tooltip": [{"field": name}, {"field": value, "format": ",.0f"}],
        },
        "config": {"background": "transparent", "view": {"stroke": "transparent"}},
        "width": 320,
        "height": 320,
    }


def vega_heatmap(
    data: list[dict[str, Any]],
    *,
    x: str,
    y: str,
    value: str = "value",
    title: str | None = None,
) -> dict[str, Any]:
    return {
        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
        "title": title,
        "data": {"values": data},
        "mark": "rect",
        "encoding": {
            "x": {"field": x, "type": "nominal"},
            "y": {"field": y, "type": "nominal"},
            "color": {"field": value, "type": "quantitative", "scale": {"scheme": "oranges"}},
            "tooltip": [{"field": x}, {"field": y}, {"field": value, "format": ",.0f"}],
        },
        "config": {"background": "transparent", "view": {"stroke": "transparent"}},
        "width": "container",
        "height": 320,
    }


def plotly_scatter(
    data: list[dict[str, Any]],
    *,
    x: str,
    y: str,
    color: str | None = None,
    hover: list[str] | None = None,
    title: str | None = None,
) -> dict[str, Any]:
    if not data:
        return {"data": [], "layout": {"title": title}}
    xs = [d.get(x) for d in data]
    ys = [d.get(y) for d in data]
    text = (
        ["<br>".join(f"{h}: {d.get(h, '')}" for h in hover) for d in data]
        if hover else None
    )
    trace: dict[str, Any] = {
        "type": "scatter",
        "mode": "markers",
        "x": xs,
        "y": ys,
        "marker": {"size": 9, "color": PALETTE[0], "opacity": 0.78, "line": {"width": 0}},
    }
    if text:
        trace["text"] = text
        trace["hovertemplate"] = "%{text}<extra></extra>"
    if color:
        # group by color
        groups: dict[Any, list[int]] = {}
        for i, d in enumerate(data):
            groups.setdefault(d.get(color, "—"), []).append(i)
        traces = []
        for j, (label, idxs) in enumerate(groups.items()):
            t = {
                "type": "scatter",
                "mode": "markers",
                "name": str(label),
                "x": [xs[i] for i in idxs],
                "y": [ys[i] for i in idxs],
                "marker": {"size": 9, "color": PALETTE[j % len(PALETTE)], "opacity": 0.78, "line": {"width": 0}},
            }
            if text:
                t["text"] = [text[i] for i in idxs]
                t["hovertemplate"] = "%{text}<extra></extra>"
            traces.append(t)
        return {
            "data": traces,
            "layout": {
                "title": title,
                "xaxis": {"title": x.replace("_", " ").title()},
                "yaxis": {"title": y.replace("_", " ").title()},
                "showlegend": True,
                "paper_bgcolor": "rgba(0,0,0,0)",
                "plot_bgcolor": "rgba(0,0,0,0)",
                "height": 420,
            },
        }
    return {
        "data": [trace],
        "layout": {
            "title": title,
            "xaxis": {"title": x.replace("_", " ").title()},
            "yaxis": {"title": y.replace("_", " ").title()},
            "paper_bgcolor": "rgba(0,0,0,0)",
            "plot_bgcolor": "rgba(0,0,0,0)",
            "height": 420,
        },
    }
