// Notebook-style chat answer renderer.
//
// Accepts a NotebookResponse payload from /api/chat/notebook and maps each
// `.deepnote`-schema block to a small React component. Mirrors the Deepnote
// Cloud UX aesthetic (big-number callouts, collapsible SQL blocks, rich
// tables, inline charts, suggestion chips) without any Deepnote dependency.
//
// TRADE-OFFS flagged per the user's Option B brief:
// - We render Gemini-generated structured output locally. If Gemini breaks
//   the JSON schema on its final turn, the backend falls back to a single
//   text block — the `meta.fallback_used` flag is shown at the top so the
//   user knows.
// - The SQL block shows Gemini's description of the tool call (and/or the
//   literal SELECT when run_safe_sql is used). It's not always a runnable
//   SELECT — it's a proof-of-work indicator. Shown expanded by default.
// - No Mr. Milk persona preservation inside the response schema itself —
//   the persona lives in the system prompt, which shapes the text block
//   content but not the structure.

import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";

// ----------------------------------------------------------------------
// Shared helpers
// ----------------------------------------------------------------------
const CARD_BASE = {
  background: "#ffffff",
  border: "1px solid #d7e3f0",
  borderRadius: 14,
  padding: "14px 16px",
  boxShadow: "0 10px 22px rgba(7,64,105,0.05)",
};

const LABEL = {
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: 0.7,
  fontWeight: 700,
  color: "#8598b3",
};

const renderMarkdown = (raw) => {
  // Minimal inline-markdown: **bold**, *italic*, `code`, line breaks.
  // We intentionally do NOT pull a full markdown lib here — answers are
  // short and we want to stay on the tight bundle budget.
  const text = String(raw || "");
  const escape = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const lines = text.split(/\n/).map((line, idx) => {
    let html = escape(line);
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    html = html.replace(/`([^`]+)`/g, '<code style="background:#f3f6fb;padding:1px 4px;border-radius:4px;font-family:monospace;font-size:12px;">$1</code>');
    return <span key={idx} dangerouslySetInnerHTML={{ __html: html }} />;
  });
  const withBreaks = [];
  lines.forEach((node, i) => {
    withBreaks.push(node);
    if (i < lines.length - 1) withBreaks.push(<br key={`br-${i}`} />);
  });
  return withBreaks;
};

function formatMetaDate(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const year = match[1];
  const month = months[Number(match[2]) - 1] || match[2];
  const day = String(Number(match[3]));
  return `${day} ${month} ${year}`;
}

function formatMetaCount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString() : "";
}

function buildDataPills(meta = {}) {
  const pills = [];

  const customerBits = [];
  if (meta.customer_imported_at) customerBits.push(`uploaded ${formatMetaDate(meta.customer_imported_at)}`);
  if (meta.customer_data_to) customerBits.push(`latest delivery ${formatMetaDate(meta.customer_data_to)}`);
  if (meta.customer_row_count != null) customerBits.push(`${formatMetaCount(meta.customer_row_count)} customers`);
  if (customerBits.length) pills.push(`Customer file: ${customerBits.join(" | ")}`);

  const salesBits = [];
  if (meta.sales_data_from && meta.sales_data_to) {
    salesBits.push(`${formatMetaDate(meta.sales_data_from)} - ${formatMetaDate(meta.sales_data_to)}`);
  } else if (meta.sales_data_to) {
    salesBits.push(`through ${formatMetaDate(meta.sales_data_to)}`);
  }
  if (meta.sales_row_count != null) salesBits.push(`${formatMetaCount(meta.sales_row_count)} rows`);
  if (salesBits.length) pills.push(`Sales report: ${salesBits.join(" | ")}`);

  if (!pills.length && meta.data_note) pills.push(meta.data_note);
  return pills;
}

// ----------------------------------------------------------------------
// TextBlock — narrative / analysis
// ----------------------------------------------------------------------
function TextBlock({ block }) {
  return (
    <div style={{ ...CARD_BASE, borderLeft: "4px solid #d2ab67" }}>
      <div style={{ ...LABEL, marginBottom: 6, color: "#8b6914" }}>Analysis</div>
      <div style={{ fontSize: 13, lineHeight: 1.75, color: "#20476d" }}>{renderMarkdown(block.content)}</div>
    </div>
  );
}

// ----------------------------------------------------------------------
// BigNumberBlock — headline metric
// ----------------------------------------------------------------------
function BigNumberBlock({ block }) {
  const accent = block.accent || "#2fa65d";
  return (
    <div style={{
      ...CARD_BASE,
      borderLeft: `4px solid ${accent}`,
      background: `linear-gradient(160deg, #ffffff, ${accent}10)`,
    }}>
      <div style={{ ...LABEL, marginBottom: 4 }}>{block.title || "Metric"}</div>
      <div style={{ color: accent, fontSize: 32, fontWeight: 800, lineHeight: 1.05, fontFamily: "'Montserrat', sans-serif" }}>
        {block.value}
      </div>
      {block.caption && (
        <div style={{ color: "#6f86aa", fontSize: 12, marginTop: 6, lineHeight: 1.45 }}>{block.caption}</div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// SqlBlock — shows the query that produced the answer. Default expanded,
// user can minimise it. Per user request.
// ----------------------------------------------------------------------
function SqlBlock({ block }) {
  const [open, setOpen] = useState(true); // shown by default
  return (
    <div style={{ ...CARD_BASE, borderLeft: "4px solid #4499ff", padding: 0, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          background: "transparent",
          border: "none",
          padding: "12px 16px",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div>
          <div style={{ ...LABEL, color: "#365a7f", marginBottom: 3 }}>{block.title || "Query run"}</div>
          <div style={{ fontSize: 11, color: "#6f86aa" }}>
            {block.row_count !== null && block.row_count !== undefined
              ? `${Number(block.row_count).toLocaleString()} rows returned`
              : "Click to " + (open ? "collapse" : "expand")}
          </div>
        </div>
        <div style={{
          fontSize: 11, color: "#4499ff", fontWeight: 700,
          background: "#f4f9ff", border: "1px solid #c7d9ea",
          borderRadius: 8, padding: "4px 10px",
        }}>
          {open ? "Minimize" : "Show query"}
        </div>
      </button>
      {open && (
        <pre style={{
          margin: 0,
          padding: "12px 16px",
          background: "#0f2942",
          color: "#eaf3ff",
          fontFamily: "monospace",
          fontSize: 12,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          borderTop: "1px solid #d7e3f0",
        }}>{block.query}</pre>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// TableBlock — full list, scrollable, downloadable.
// ----------------------------------------------------------------------
// Behaviour by row count:
//   ≤ TABLE_FLAT_ROWS  rows → render the whole table inline, no scroll cap.
//   > TABLE_FLAT_ROWS  rows → cap height with vertical scroll + sticky header.
// CSV download ALWAYS exports every row, regardless of what's visible.
// ----------------------------------------------------------------------
const TABLE_FLAT_ROWS = 12;     // up to this many → no internal scroll cap
const TABLE_SCROLL_HEIGHT = 520; // px — the "viewport" when many rows

function escapeCsvCell(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename, columns, rows) {
  const header = columns.map(escapeCsvCell).join(",");
  const body = rows.map((row) => (Array.isArray(row) ? row : []).map(escapeCsvCell).join(",")).join("\n");
  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function TableBlock({ block }) {
  const columns = Array.isArray(block.columns) ? block.columns : [];
  const rows = Array.isArray(block.rows) ? block.rows : [];
  const csvFilename = `${(block.title || "table").replace(/[^a-z0-9]+/gi, "_").toLowerCase()}.csv`;
  const isLarge = rows.length > TABLE_FLAT_ROWS;
  const totalRows = rows.length;
  const [expanded, setExpanded] = useState(false); // when true, kill the 520px cap and show every row

  return (
    <div style={{ ...CARD_BASE, borderLeft: "4px solid #44cc88" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          {block.title && <div style={{ ...LABEL, color: "#2f7a4f" }}>{block.title}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              background: "#eaf7ef", border: "1px solid #bde0c7",
              borderRadius: 999, padding: "2px 10px",
              fontSize: 11, fontWeight: 700, color: "#2f7a4f",
              fontFamily: "'Montserrat', sans-serif",
              fontVariantNumeric: "tabular-nums",
            }}>
              {totalRows > 0
                ? `${totalRows.toLocaleString()} ${totalRows === 1 ? "row" : "rows"}`
                : "No matching rows"}
            </span>
            {isLarge && (
              <span style={{ fontSize: 11, color: "#6f86aa" }}>
                {expanded ? "showing all on one page" : "scroll to see all"}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {isLarge && (
            <button
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? "Collapse to scrollable view" : `Show all ${totalRows.toLocaleString()} rows on one page`}
              style={{
                background: expanded ? "#ffffff" : "#f4f9ff",
                border: "1px solid #4499ff",
                color: "#4499ff", borderRadius: 8, padding: "6px 12px",
                fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                fontFamily: "'Montserrat', sans-serif",
              }}
            >
              {expanded ? "Collapse" : `View full list (${totalRows.toLocaleString()})`}
            </button>
          )}
          {totalRows > 0 && (
            <button
              onClick={() => downloadCsv(csvFilename, columns, rows)}
              title={`Download all ${totalRows.toLocaleString()} rows as CSV`}
              style={{
                background: "#2fa65d", border: "1px solid #1f7a43",
                color: "#ffffff", borderRadius: 8, padding: "6px 12px",
                fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                fontFamily: "'Montserrat', sans-serif",
                boxShadow: "0 4px 10px rgba(47,166,93,0.18)",
              }}
            >
              Download all ({totalRows.toLocaleString()} rows)
            </button>
          )}
        </div>
      </div>
      <div
        style={{
          overflowX: "auto",
          overflowY: isLarge && !expanded ? "auto" : "visible",
          maxHeight: isLarge && !expanded ? TABLE_SCROLL_HEIGHT : "none",
          borderRadius: 10,
          border: "1px solid #d7e3f0",
          // Subtle inner shadow at the bottom hints "more below" when scrolling.
          boxShadow: isLarge && !expanded ? "inset 0 -8px 14px -8px rgba(7,64,105,0.08)" : "none",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th
                  key={i}
                  style={{
                    background: "#074069",
                    color: "#ffffff",
                    padding: "8px 10px",
                    textAlign: "left",
                    fontWeight: 700,
                    borderBottom: "1px solid #1b4d75",
                    // Sticky header so column labels stay visible while scrolling
                    position: isLarge ? "sticky" : "static",
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "#ffffff" : "#f8fbff" }}>
                {(Array.isArray(row) ? row : []).map((cell, j) => (
                  <td
                    key={j}
                    style={{
                      padding: "8px 10px",
                      borderBottom: "1px solid #eef3f9",
                      color: "#20476d",
                      fontFamily: typeof cell === "number" ? "'Montserrat', sans-serif" : "inherit",
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {cell === null || cell === undefined ? "" : String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.caption && (
        <div style={{ color: "#6f86aa", fontSize: 11, marginTop: 8 }}>{block.caption}</div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// ChartBlock — ECharts-powered inline visualization
// ----------------------------------------------------------------------
function ChartBlock({ block }) {
  const option = useMemo(() => {
    const data = Array.isArray(block.data) ? block.data : [];
    const variant = block.variant || "bar";
    const names = data.map((d) => d.name ?? d.label ?? "");
    const values = data.map((d) => Number(d.value ?? 0));

    const base = {
      grid: { left: 48, right: 20, top: 30, bottom: 44, containLabel: true },
      tooltip: { trigger: "item", backgroundColor: "#ffffff", borderColor: "#d7e3f0", textStyle: { color: "#20476d", fontFamily: "Montserrat, sans-serif" } },
    };

    if (variant === "pie") {
      return {
        ...base,
        series: [{
          type: "pie",
          radius: ["45%", "75%"],
          data: data.map((d) => ({ name: d.name ?? "", value: Number(d.value ?? 0) })),
          label: { color: "#20476d", fontSize: 11 },
          itemStyle: { borderRadius: 6, borderColor: "#ffffff", borderWidth: 2 },
        }],
      };
    }

    if (variant === "line") {
      return {
        ...base,
        xAxis: { type: "category", data: names, axisLabel: { color: "#587493", fontSize: 10 } },
        yAxis: { type: "value", axisLabel: { color: "#587493", fontSize: 10 } },
        series: [{ type: "line", data: values, smooth: true, itemStyle: { color: "#4499ff" }, areaStyle: { color: "rgba(68,153,255,0.15)" } }],
      };
    }

    if (variant === "scatter") {
      return {
        ...base,
        xAxis: { type: "category", data: names, axisLabel: { color: "#587493", fontSize: 10 } },
        yAxis: { type: "value", axisLabel: { color: "#587493", fontSize: 10 } },
        series: [{ type: "scatter", data: values, itemStyle: { color: "#d2ab67" }, symbolSize: 14 }],
      };
    }

    // default: bar
    return {
      ...base,
      xAxis: { type: "category", data: names, axisLabel: { color: "#587493", fontSize: 10, interval: 0, rotate: names.length > 6 ? 22 : 0 } },
      yAxis: { type: "value", axisLabel: { color: "#587493", fontSize: 10 } },
      series: [{
        type: "bar",
        data: values,
        barMaxWidth: 34,
        itemStyle: { color: "#44cc88", borderRadius: [6, 6, 0, 0] },
      }],
    };
  }, [block]);

  return (
    <div style={{ ...CARD_BASE, borderLeft: "4px solid #d2ab67" }}>
      {block.title && (
        <div style={{ ...LABEL, color: "#8b6914", marginBottom: 8 }}>{block.title}</div>
      )}
      <ReactEChartsCore echarts={echarts} option={option} style={{ height: 240 }} notMerge lazyUpdate />
      {block.caption && (
        <div style={{ color: "#6f86aa", fontSize: 11, marginTop: 6 }}>{block.caption}</div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// ImageBlock — renders a matplotlib PNG returned by run_python
// ----------------------------------------------------------------------
function ImageBlock({ block }) {
  const src = block.png_base64
    ? (block.png_base64.startsWith("data:") ? block.png_base64 : `data:image/png;base64,${block.png_base64}`)
    : null;
  if (!src) return null;
  return (
    <div style={{ ...CARD_BASE, borderLeft: "4px solid #cc44ff" }}>
      {block.title && <div style={{ ...LABEL, color: "#6a4c93", marginBottom: 8 }}>{block.title}</div>}
      <img src={src} alt={block.title || "Visualization"} style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #eef3f9", display: "block" }} />
      {block.caption && <div style={{ color: "#6f86aa", fontSize: 11, marginTop: 8 }}>{block.caption}</div>}
    </div>
  );
}


// ----------------------------------------------------------------------
// InputBlock — follow-up suggestion chips
// ----------------------------------------------------------------------
function InputBlock({ block, onSuggest }) {
  const suggestions = Array.isArray(block.suggestions) ? block.suggestions : [];
  if (!suggestions.length) return null;
  return (
    <div style={{ ...CARD_BASE, borderLeft: "4px solid #cc44ff" }}>
      <div style={{ ...LABEL, color: "#6a4c93", marginBottom: 8 }}>{block.title || "Ask a follow-up"}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSuggest && onSuggest(s)}
            style={{
              background: "#ffffff",
              border: "1px solid #d8c7ef",
              color: "#6a4c93",
              borderRadius: 18,
              padding: "7px 12px",
              fontSize: 11,
              cursor: "pointer",
              fontFamily: "'Montserrat', sans-serif",
              boxShadow: "0 6px 14px rgba(106,76,147,0.06)",
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// ExecutionTrail — live Deepnote-style log of agent events
// ----------------------------------------------------------------------
// Consumes the event stream from /api/chat/notebook/stream and renders
// each step as it happens. After the final `blocks` event arrives, the
// trail collapses into a small expandable "Show execution trail" chip
// so the audit log remains accessible without cluttering the answer.
//
// Props:
//   events:    list of {event, data} objects in arrival order
//   streaming: true while still receiving events (drives spinner)
//   collapsed: optional initial collapsed state (default: matches streaming)
// ----------------------------------------------------------------------
// ----------------------------------------------------------------------
// Pretty event rendering — Deepnote / Julius-style step labels.
//
// Goal: turn raw "find_match(query='ghee 1L', type='product')" into
// "Looking up 'ghee 1L' in products..." with a code preview block when
// it makes sense (run_python, run_safe_sql).
// ----------------------------------------------------------------------
const STATUS_COLORS = {
  plan:      { dot: "#4499ff", label: "Planning" },
  model:     { dot: "#5f7f9f", label: "Model" },
  tool_call: { dot: "#d2ab67", label: "Tool" },
  tool_done: { dot: "#2fa65d", label: "Done" },
  compose:   { dot: "#cc44ff", label: "Compose" },
  retry:     { dot: "#ff9944", label: "Retry" },
  error:     { dot: "#e04a3a", label: "Error" },
};

function formatDuration(ms) {
  const n = Number(ms || 0);
  if (!n) return "";
  if (n < 1000) return `${n} ms`;
  return `${(n / 1000).toFixed(1)} s`;
}

// Map a tool name + args to a friendly verb-phrase shown in the trail.
// e.g. find_match → "Looking up 'ghee 1L' in products"
function friendlyToolCallLabel(name, args = {}) {
  const a = args || {};
  switch (name) {
    case "find_match":
      return `Looking up “${a.query || ""}” in ${a.type || "values"}`;
    case "run_python":
      return "Running pandas analysis";
    case "run_safe_sql":
      return "Querying database";
    case "lookup_customer":
      return `Searching customer “${a.query || ""}”`;
    default:
      return name || "Calling tool";
  }
}

function friendlyToolDoneLabel(name, data = {}) {
  const summary = data?.summary || "ok";
  switch (name) {
    case "find_match": {
      // Summary shape from backend: "matched X (95%)" — but we get raw dict via
      // the `summary` summariser. Keep as-is; the result row has the canonical value.
      return `Match → ${summary}`;
    }
    case "run_python":
      return summary;
    case "run_safe_sql":
      return summary;
    case "lookup_customer":
      return summary;
    default:
      return summary;
  }
}

function describeEvent(ev) {
  const type = ev?.event;
  const d = ev?.data;
  switch (type) {
    case "plan":
      return typeof d === "string" ? d.replace(/\.{3}$/, "…") : "Thinking about your question…";
    case "model":
      return d?.reason === "fallback"
        ? `Falling back to ${d?.model || "another model"} (primary throttled)`
        : `Using ${d?.model || "Gemini"}`;
    case "tool_call":
      return friendlyToolCallLabel(d?.name, d?.args);
    case "tool_done":
      return friendlyToolDoneLabel(d?.name, d);
    case "compose":
      return typeof d === "string" ? d.replace(/\.{3}$/, "…") : "Writing the answer…";
    case "retry":
      return typeof d === "string" ? d : "Reformatting JSON…";
    case "error":
      return d?.message || String(d || "Unknown error");
    default:
      return String(d ?? "");
  }
}

// Extract a `# PLAN:` comment block from the start of Python code, if present.
// Returns { planSteps: ["1. ...", "2. ..."], remainingCode: "..." } or null.
function extractPlan(code) {
  if (!code) return null;
  const lines = code.split(/\r?\n/);
  let i = 0;
  // Skip leading blank lines
  while (i < lines.length && !lines[i].trim()) i++;
  if (i >= lines.length || !/^#\s*PLAN\s*:/i.test(lines[i].trim())) return null;
  const header = i;
  i++;
  const stepLines = [];
  while (i < lines.length) {
    const t = lines[i].trim();
    if (!t.startsWith("#")) break;
    const stripped = t.replace(/^#\s?/, "").trim();
    if (stripped) stepLines.push(stripped);
    i++;
  }
  if (!stepLines.length) return null;
  const remaining = lines.slice(i).join("\n").replace(/^\n+/, "");
  return { planSteps: stepLines, remainingCode: remaining };
}

// PlanBlock — renders the # PLAN: section as a styled checklist above the code.
function PlanBlock({ steps }) {
  if (!steps || !steps.length) return null;
  return (
    <div style={{
      margin: "5px 0 4px",
      padding: "10px 12px",
      background: "linear-gradient(160deg, #fbf7ee, #fffaf0)",
      border: "1px solid #ead4ab",
      borderRadius: 8,
    }}>
      <div style={{ fontSize: 9, color: "#8b6914", fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 6 }}>
        Plan ({steps.length} step{steps.length === 1 ? "" : "s"})
      </div>
      <ol style={{ margin: 0, paddingLeft: 18, color: "#3d2c08", fontSize: 12, lineHeight: 1.6 }}>
        {steps.map((s, i) => {
          // Strip leading "N." or "N)" so our <ol> handles numbering.
          const cleaned = s.replace(/^\d+[\.\)]\s*/, "");
          return <li key={i} style={{ marginBottom: 2 }}>{cleaned}</li>;
        })}
      </ol>
    </div>
  );
}

// If the tool call carries `code` or `query`, render it inline as a small
// code preview block underneath the friendly label. For run_python with a
// leading `# PLAN:` block, we promote the plan into a styled checklist above
// the code (Deepnote-style "plan first, then execute").
function ToolCodePreview({ ev }) {
  if (ev?.event !== "tool_call") return null;
  const d = ev?.data || {};
  const args = d?.args || {};
  const name = d?.name;
  let snippet = null;
  let language = null;
  let planSteps = null;
  if (name === "run_python" && args.code) {
    const raw = String(args.code).trim();
    const plan = extractPlan(raw);
    if (plan) {
      planSteps = plan.planSteps;
      snippet = plan.remainingCode.trim();
    } else {
      snippet = raw;
    }
    language = "python";
  } else if (name === "run_safe_sql" && args.query) {
    snippet = String(args.query).trim();
    language = "sql";
  }
  if (!snippet && !planSteps) return null;
  // Keep code compact — clip very long code so the trail doesn't dominate.
  const clipped = snippet
    ? (snippet.length > 600 ? snippet.slice(0, 580) + "  …" : snippet)
    : "";
  return (
    <>
      {planSteps && <PlanBlock steps={planSteps} />}
      {clipped && (
        <pre style={{
          margin: "5px 0 4px",
          padding: "8px 10px",
          background: "#0f2942",
          color: "#eaf3ff",
          fontFamily: "monospace",
          fontSize: 11.5,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}>
          <span style={{ display: "block", color: "#7faaca", fontSize: 9, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 }}>
            {language}
          </span>
          {clipped}
        </pre>
      )}
    </>
  );
}

// Status icon — small character (no emoji per project conventions).
function statusGlyph(eventType) {
  if (eventType === "tool_done") return "✓";
  if (eventType === "error") return "!";
  if (eventType === "retry") return "↻";
  return "";
}

export function ExecutionTrail({ events = [], streaming = false, initialCollapsed = null }) {
  const visible = useMemo(
    () => events.filter((e) => e?.event && e.event !== "blocks" && e.event !== "done"),
    [events],
  );
  const shouldCollapse = initialCollapsed !== null ? initialCollapsed : !streaming;
  const [collapsed, setCollapsed] = useState(shouldCollapse);

  // When the stream ends, auto-collapse so the final answer is the hero.
  // Users can always re-expand.
  const prevStreamingRef = useRef(streaming);
  useEffect(() => {
    if (prevStreamingRef.current && !streaming) setCollapsed(true);
    prevStreamingRef.current = streaming;
  }, [streaming]);

  if (!visible.length && !streaming) return null;

  return (
    <div style={{
      ...CARD_BASE,
      borderLeft: "4px solid #4499ff",
      background: streaming ? "linear-gradient(160deg, #ffffff, #f4f9ff)" : "#ffffff",
      padding: 0,
      overflow: "hidden",
    }}>
      <button
        onClick={() => setCollapsed((v) => !v)}
        style={{
          width: "100%",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          background: "transparent", border: "none", padding: "10px 14px",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {streaming ? (
            <span style={{
              width: 10, height: 10, borderRadius: "50%", background: "#4499ff",
              boxShadow: "0 0 0 0 rgba(68,153,255,0.7)",
              animation: "mrmilk-pulse 1.2s infinite",
            }} />
          ) : (
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#2fa65d" }} />
          )}
          <div style={{ ...LABEL, color: "#365a7f" }}>
            {streaming ? "Running live against Supabase..." : `Execution trail - ${visible.length} step${visible.length === 1 ? "" : "s"}`}
          </div>
        </div>
        <div style={{
          fontSize: 11, color: "#4499ff", fontWeight: 700,
          background: "#f4f9ff", border: "1px solid #c7d9ea",
          borderRadius: 8, padding: "3px 10px",
        }}>
          {collapsed ? "Show" : "Hide"}
        </div>
      </button>
      {!collapsed && (
        <div style={{ padding: "0 14px 12px" }}>
          <style>{`@keyframes mrmilk-pulse { 0% { box-shadow: 0 0 0 0 rgba(68,153,255,0.7); } 70% { box-shadow: 0 0 0 8px rgba(68,153,255,0); } 100% { box-shadow: 0 0 0 0 rgba(68,153,255,0); } }`}</style>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {visible.map((ev, i) => {
              const isLast = i === visible.length - 1;
              const meta = STATUS_COLORS[ev.event] || { dot: "#8598b3", label: ev.event };
              const dur = ev.event === "tool_done" ? formatDuration(ev?.data?.duration_ms) : "";
              const glyph = statusGlyph(ev.event);
              const isError = ev.event === "tool_done" && /error|fail/i.test(String(ev?.data?.summary || ""));
              const dotColor = isError ? "#e04a3a" : meta.dot;
              return (
                <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12.5, lineHeight: 1.55, color: "#2f4f70" }}>
                  <span style={{
                    position: "relative",
                    width: 14, height: 14, borderRadius: "50%",
                    background: dotColor, marginTop: 4, flexShrink: 0,
                    color: "#ffffff", fontSize: 9, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: streaming && isLast ? `0 0 0 5px ${dotColor}22` : "none",
                    transition: "box-shadow 160ms ease-out",
                  }}>
                    {glyph || ""}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "'Montserrat', sans-serif", wordBreak: "break-word", color: isError ? "#b94a4a" : "#2f4f70" }}>
                        {describeEvent(ev)}
                      </span>
                      {dur && (
                        <span style={{ fontSize: 10.5, color: "#8598b3", fontVariantNumeric: "tabular-nums" }}>
                          {dur}
                        </span>
                      )}
                    </div>
                    <ToolCodePreview ev={ev} />
                  </div>
                </li>
              );
            })}
            {streaming && (
              <li style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 11.5, color: "#6f86aa", marginTop: 6 }}>
                <span style={{
                  width: 14, height: 14, borderRadius: "50%", background: "#c7d9ea", marginLeft: 0,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 800, color: "#5f7f9f",
                }}>·</span>
                <em>waiting for next step…</em>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// Composite — renders the block list with meta header
// ----------------------------------------------------------------------
export default function NotebookAnswer({ blocks = [], meta = {}, events = [], streaming = false, onSuggest }) {
  const safeBlocks = Array.isArray(blocks) ? blocks : [];
  const safeEvents = Array.isArray(events) ? events : [];
  const dataPills = buildDataPills(meta);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {(safeEvents.length > 0 || streaming) && (
        <ExecutionTrail events={safeEvents} streaming={streaming} />
      )}
      {(dataPills.length > 0 || meta?.tool_calls?.length > 0 || meta?.fallback_used) && (
        <div style={{
          display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center",
          fontSize: 10, color: "#6f86aa",
        }}>
          {dataPills.map((pill, i) => (
            <span key={`data-pill-${i}`} style={{ background: "#fffaf0", border: "1px solid #ead4ab", borderRadius: 999, padding: "2px 8px", color: "#7a5b16", fontWeight: 700 }}>
              {pill}
            </span>
          ))}
          {meta?.fallback_used && (
            <span style={{ background: "#fff5e6", border: "1px solid #ead4ab", borderRadius: 999, padding: "2px 8px", color: "#97753a", fontWeight: 700 }}>
              Fallback answer (structured parse failed)
            </span>
          )}
          {meta?.gemini_model && (
            <span style={{ background: "#f4f9ff", border: "1px solid #d7e3f0", borderRadius: 999, padding: "2px 8px" }}>
              Model: {meta.gemini_model}
            </span>
          )}
          {meta?.tool_calls?.length > 0 && (
            <span style={{ background: "#eaf7ef", border: "1px solid #bde0c7", borderRadius: 999, padding: "2px 8px", color: "#2f7a4f" }}>
              Tools: {meta.tool_calls.join(" -> ")}
            </span>
          )}
        </div>
      )}

      {safeBlocks.map((block, i) => {
        switch (block?.type) {
          case "text":       return <TextBlock key={i} block={block} />;
          case "big_number": return <BigNumberBlock key={i} block={block} />;
          case "sql":        return <SqlBlock key={i} block={block} />;
          case "table":      return <TableBlock key={i} block={block} />;
          case "chart":      return <ChartBlock key={i} block={block} />;
          case "image":      return <ImageBlock key={i} block={block} />;
          case "input":      return <InputBlock key={i} block={block} onSuggest={onSuggest} />;
          default:
            return (
              <div key={i} style={{ ...CARD_BASE, borderLeft: "4px solid #e04a3a" }}>
                <div style={{ ...LABEL, color: "#b94a4a", marginBottom: 4 }}>Unknown block type</div>
                <pre style={{ margin: 0, fontSize: 11, color: "#6f86aa", whiteSpace: "pre-wrap" }}>{JSON.stringify(block, null, 2)}</pre>
              </div>
            );
        }
      })}
    </div>
  );
}
