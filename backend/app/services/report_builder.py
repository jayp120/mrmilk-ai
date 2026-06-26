"""
PDF report builder using ReportLab.

Generates polished multi-section PDFs from a list of "section" dicts the
agent emits inside a `report` block. Three named templates wrap common
business asks; the agent fills the slots, we render the PDF.

Templates:
  * weekly_business_review   — Headlines | Hub mix | Trial funnel | Top movers
  * area_deep_dive           — Snapshot | Status mix | Top customers | Recent trend
  * trial_funnel_health      — Funnel counts | Conversion rate | Stalled cohort

Generic sections supported:
  { "heading": str,
    "body": str,                       # markdown-ish
    "big_numbers": [{"value": str, "title": str, "caption": str?}, ...]?,
    "table": {"columns": [...], "rows": [[...]], "caption": str?}?,
    "chart": {"variant": "bar"|"line"|"pie", "data": [...], "x_label"?, "y_label"?}?  # rendered as a small inline matplotlib bar/line/pie
  }

Output:
  PDF bytes + a stable file name. Saved to backend/.cache/reports/<id>.pdf
  and exposed via /api/chat/reports/<id>.pdf for download.
"""
from __future__ import annotations

import io
import logging
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).resolve().parent.parent.parent / ".cache" / "reports"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

BRAND_PRIMARY = "#7B3F00"   # Mr Milk brown
BRAND_ACCENT = "#C77B40"
INK = "#1A1A1F"
MUTED = "#6B6B72"
BG_CARD = "#FAF7F2"


def _fmt_inr(n: float | int | str | None) -> str:
    if n is None or n == "":
        return "—"
    try:
        v = float(n)
    except (TypeError, ValueError):
        return str(n)
    if abs(v) >= 1e7:
        return f"Rs {v/1e7:.2f} Cr"
    if abs(v) >= 1e5:
        return f"Rs {v/1e5:.2f} L"
    return f"Rs {v:,.0f}"


def _safe_text(s: Any) -> str:
    if s is None:
        return ""
    s = str(s)
    s = re.sub(r"[\r\n]+", "\n", s)
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return s


def _chart_to_png(chart_spec: dict[str, Any]) -> bytes | None:
    """Render a small chart spec to a PNG via matplotlib (server-side, no browser)."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return None

    variant = (chart_spec.get("variant") or "bar").lower()
    data = chart_spec.get("data") or []
    if not data:
        return None
    labels = [str(d.get("name", "")) for d in data]
    values = [float(d.get("value") or 0) for d in data]

    fig, ax = plt.subplots(figsize=(7.6, 3.2))
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")
    if variant == "line":
        ax.plot(labels, values, color=BRAND_PRIMARY, marker="o", linewidth=2)
    elif variant == "pie":
        ax.pie(values, labels=labels, autopct="%1.1f%%", colors=["#7B3F00", "#C77B40", "#E1B07E", "#2FA65D", "#1F6FB4", "#9E2A2B"][: len(values)])
        ax.set_aspect("equal")
    else:
        ax.bar(labels, values, color=BRAND_PRIMARY)
    if variant != "pie":
        ax.set_title(chart_spec.get("title") or "")
        ax.set_xlabel(chart_spec.get("x_label", ""))
        ax.set_ylabel(chart_spec.get("y_label", ""))
        for spine in ("top", "right"):
            ax.spines[spine].set_visible(False)
        plt.setp(ax.get_xticklabels(), rotation=30, ha="right")
    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=140, bbox_inches="tight")
    plt.close(fig)
    return buf.getvalue()


def _build_pdf(title: str, sections: list[dict[str, Any]], template_key: str | None) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        PageBreak, KeepTogether, Image,
    )
    from reportlab.lib.enums import TA_LEFT

    styles = getSampleStyleSheet()
    h_title = ParagraphStyle(
        "MMTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=22,
        textColor=colors.HexColor(BRAND_PRIMARY), spaceAfter=4, leading=26,
    )
    h_sub = ParagraphStyle(
        "MMSub", parent=styles["Normal"], fontSize=10,
        textColor=colors.HexColor(MUTED), spaceAfter=18,
    )
    h_section = ParagraphStyle(
        "MMSection", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=14,
        textColor=colors.HexColor(BRAND_PRIMARY), spaceBefore=16, spaceAfter=8, leading=18,
    )
    body = ParagraphStyle(
        "MMBody", parent=styles["BodyText"], fontSize=10.5,
        textColor=colors.HexColor(INK), leading=15, alignment=TA_LEFT, spaceAfter=10,
    )
    big_value = ParagraphStyle(
        "MMBigValue", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=20,
        textColor=colors.HexColor(BRAND_PRIMARY), leading=22,
    )
    big_title = ParagraphStyle(
        "MMBigTitle", parent=styles["Normal"], fontSize=9,
        textColor=colors.HexColor(MUTED), leading=12, spaceBefore=2,
    )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=1.6 * cm, rightMargin=1.6 * cm,
        topMargin=1.4 * cm, bottomMargin=1.6 * cm, title=title, author="Mr. Milk AI",
    )
    flow: list[Any] = []

    flow.append(Paragraph(_safe_text(title), h_title))
    sub = f"Generated {datetime.utcnow().strftime('%d %b %Y · %H:%M UTC')}"
    if template_key:
        sub += f" · template: {template_key}"
    flow.append(Paragraph(sub, h_sub))

    for sec in sections:
        block: list[Any] = []
        heading = sec.get("heading") or ""
        if heading:
            block.append(Paragraph(_safe_text(heading), h_section))

        if sec.get("body"):
            for paragraph in str(sec["body"]).split("\n\n"):
                paragraph = paragraph.strip()
                if paragraph:
                    block.append(Paragraph(_safe_text(paragraph).replace("\n", "<br/>"), body))

        if sec.get("big_numbers"):
            row = []
            for bn in sec["big_numbers"][:4]:
                cell = [
                    Paragraph(_safe_text(bn.get("value") or "—"), big_value),
                    Paragraph(_safe_text(bn.get("title") or ""), big_title),
                ]
                if bn.get("caption"):
                    cell.append(Paragraph(_safe_text(bn["caption"]), big_title))
                row.append(cell)
            tbl = Table([row], colWidths=[4.4 * cm] * len(row))
            tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(BG_CARD)),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor(BRAND_ACCENT)),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor(BRAND_ACCENT)),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]))
            block.append(tbl)
            block.append(Spacer(1, 8))

        if sec.get("chart"):
            png = _chart_to_png(sec["chart"])
            if png:
                img = Image(io.BytesIO(png))
                img._restrictSize(17 * cm, 7.5 * cm)
                block.append(img)
                block.append(Spacer(1, 6))

        if sec.get("table"):
            t = sec["table"]
            cols = t.get("columns") or []
            rows = t.get("rows") or []
            if cols and rows:
                # Pretty-format INR-shaped numerics
                fmt_rows = []
                for r in rows[:30]:
                    fmt_rows.append([
                        _fmt_inr(v) if (isinstance(v, (int, float)) and "revenue" in str(cols[i]).lower())
                        else _safe_text(v)
                        for i, v in enumerate(r)
                    ])
                tbl = Table([cols] + fmt_rows, repeatRows=1)
                tbl.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(BRAND_PRIMARY)),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 9),
                    ("FONTSIZE", (0, 1), (-1, -1), 8.5),
                    ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F4EE")]),
                    ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.HexColor(BRAND_ACCENT)),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]))
                block.append(tbl)
                if t.get("caption"):
                    block.append(Spacer(1, 4))
                    block.append(Paragraph(f"<i>{_safe_text(t['caption'])}</i>", big_title))

        if block:
            flow.append(KeepTogether(block))
            flow.append(Spacer(1, 8))

    doc.build(flow)
    return buf.getvalue()


def render_report_pdf(
    *,
    title: str,
    sections: list[dict[str, Any]],
    template_key: str | None = None,
) -> tuple[str, str]:
    """Build the PDF and persist to backend/.cache/reports/. Returns (id, public_path)."""
    if not sections:
        sections = [{"heading": title, "body": "(no sections supplied)"}]
    rid = uuid.uuid4().hex[:12]
    fname = f"{rid}.pdf"
    fpath = CACHE_DIR / fname
    pdf_bytes = _build_pdf(title=title or "Mr. Milk Report", sections=sections, template_key=template_key)
    fpath.write_bytes(pdf_bytes)
    return rid, f"/api/chat/reports/{fname}"


def get_report_path(file_name: str) -> Path | None:
    """Resolve a report file name to its on-disk path, defending against path traversal."""
    if not file_name or "/" in file_name or "\\" in file_name or ".." in file_name:
        return None
    if not file_name.endswith(".pdf"):
        return None
    p = (CACHE_DIR / file_name).resolve()
    try:
        p.relative_to(CACHE_DIR.resolve())
    except ValueError:
        return None
    return p if p.is_file() else None
