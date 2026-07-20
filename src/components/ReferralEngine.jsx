import React, { useCallback, useEffect, useMemo, useState } from "react";

import { fetchReferralOpportunities } from "../utils/importApi.js";

// ---- formatting (Indian conventions) --------------------------------------
const n0 = (v) => Math.round(Number(v) || 0).toLocaleString("en-IN");
const inrFull = (v) => "₹" + Math.round(Number(v) || 0).toLocaleString("en-IN");
const inrShort = (v) => {
  const n = Math.round(Number(v) || 0);
  if (Math.abs(n) >= 1e7) return "₹" + (n / 1e7).toFixed(2) + " Cr";
  if (Math.abs(n) >= 1e5) return "₹" + (n / 1e5).toFixed(2) + " L";
  return "₹" + n.toLocaleString("en-IN");
};

const EXCLUSION_LABELS = {
  no_location: "no location on record",
  outside_region: "coordinates outside Pune/PCMC",
  disagrees_with_area: "coordinates disagree with their area",
  low_confidence_geocode: "low-confidence geocode",
  no_area_baseline: "area too small to verify against",
  sparse_area_baseline: "area too small to verify against",
};

/** The pitch a caller actually reads out. Built from real facts about the
 *  anchor customer so it never sounds like a generic script. */
function buildPitch(o) {
  const months = Math.round(o.tenure_months);
  return (
    `${o.name} in ${o.sub_area || o.area} has taken delivery ${n0(o.deliveries)} times ` +
    `over ${months} month${months === 1 ? "" : "s"}. ${o.delivery_boy || "Our delivery boy"} ` +
    `is already at this building every morning — so a neighbour here costs us almost ` +
    `nothing extra to serve.`
  );
}

export default function ReferralEngine() {
  const [minDeliveries, setMinDeliveries] = useState(30);
  const [maxInBuilding, setMaxInBuilding] = useState(1);
  const [hub, setHub] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchReferralOpportunities(
      { minDeliveries, maxInBuilding, hub, limit: 200 }, controller.signal,
    )
      .then(setData)
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(err?.message || "Could not load referral opportunities.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [minDeliveries, maxInBuilding, hub]);

  const opportunities = data?.opportunities || [];
  const summary = data?.summary;
  const excluded = data?.excluded_customers || {};
  const totalExcluded = Object.values(excluded).reduce((a, b) => a + b, 0);

  const copyPitch = useCallback((o) => {
    navigator.clipboard?.writeText(buildPitch(o));
    setCopied(o.customer_id);
    setTimeout(() => setCopied(null), 1600);
  }, []);

  const exportCsv = useCallback(() => {
    if (!opportunities.length) return;
    const cols = ["score", "name", "mobile", "area", "sub_area", "address", "delivery_boy",
      "deliveries", "tenure_months", "revenue", "est_value_per_new_customer", "lat", "lng"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(",")]
      .concat(opportunities.map((o) => cols.map((c) => esc(o[c])).join(",")))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `mrmilk-referral-worklist-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [opportunities]);

  const card = {
    background: "#ffffff", border: "1px solid #d7e3f0", borderRadius: 16,
    padding: 18, boxShadow: "0 16px 34px rgba(7,64,105,0.05)",
  };
  const label = { color: "#6284a6", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 };
  const chip = (active) => ({
    background: active ? "#074069" : "#f8fbff",
    color: active ? "#ffffff" : "#23486b",
    border: `1px solid ${active ? "#074069" : "#c4daee"}`,
    borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700,
    cursor: "pointer", fontFamily: "'Montserrat', sans-serif",
  });

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* WHY — the business case, stated before the data. Anyone opening this
          tab cold should understand the idea before they see a single row. */}
      <div style={{ ...card, borderLeft: "4px solid #d2ab67" }}>
        <div style={{ color: "#d2ab67", fontSize: 15, fontWeight: 800 }}>
          Neighbour referrals — growth that costs almost nothing to deliver
        </div>
        <div style={{ color: "#5f7f9f", fontSize: 12.5, lineHeight: 1.75, marginTop: 8, maxWidth: 860 }}>
          About <strong style={{ color: "#23486b" }}>9 in 10 buildings we deliver to contain exactly one
          customer</strong>. That is the most expensive fact about our operation — a delivery boy climbing to
          a single flat has far worse economics than one serving eight flats in the same tower.
          <br /><br />
          It is also the cheapest growth available to us. In every one of those buildings there is already a
          customer who has taken delivery for months, and a delivery boy standing at that door every single
          morning. Adding their neighbour means <strong style={{ color: "#23486b" }}>no new travel, no new
          stop on the route</strong> — the milk is already there.
          <br /><br />
          This list ranks those buildings by how likely the ask is to land: how strong the customer's daily
          habit is, how long they have trusted us, what they spend, and what a customer is worth in that area.
        </div>
      </div>

      {/* Filters */}
      <div style={card}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ ...label, marginRight: 2 }}>Show buildings with</span>
          <div style={{ display: "flex", gap: 6 }}>
            {[{ v: 1, l: "1 customer" }, { v: 2, l: "up to 2" }, { v: 3, l: "up to 3" }].map((x) => (
              <button key={x.v} type="button" onClick={() => setMaxInBuilding(x.v)} style={chip(maxInBuilding === x.v)}>
                {x.l}
              </button>
            ))}
          </div>
          <span style={{ ...label, marginLeft: 6 }}>who ordered at least</span>
          <select
            value={minDeliveries}
            onChange={(e) => setMinDeliveries(Number(e.target.value))}
            style={{ background: "#f8fbff", border: "1px solid #c4daee", borderRadius: 8, color: "#23486b", padding: "8px 10px", fontSize: 12, fontWeight: 600 }}
          >
            {[15, 30, 60, 100, 200].map((v) => <option key={v} value={v}>{v} times</option>)}
          </select>
          <span style={{ ...label, marginLeft: 6 }}>in</span>
          <select
            value={hub}
            onChange={(e) => setHub(e.target.value)}
            style={{ background: "#f8fbff", border: "1px solid #c4daee", borderRadius: 8, color: "#23486b", padding: "8px 10px", fontSize: 12, fontWeight: 600 }}
          >
            <option value="">All hubs</option>
            {(data?.hubs || []).map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <button type="button" onClick={exportCsv} disabled={!opportunities.length}
            style={{ ...chip(false), marginLeft: "auto", opacity: opportunities.length ? 1 : 0.5 }}>
            Export worklist
          </button>
        </div>
      </div>

      {/* KPIs */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
          {[
            { k: "Opportunities", v: n0(summary.opportunities_found), sub: `from ${n0(summary.buildings_analysed)} buildings` },
            { k: "Estimated upside", v: inrShort(summary.total_estimated_upside), sub: "if each converts one neighbour" },
            { k: "Avg per new customer", v: inrFull(summary.avg_value_per_new_customer), sub: "based on area history" },
            { k: "On this list", v: n0(summary.returned), sub: "highest-scoring first" },
          ].map((t) => (
            <div key={t.k} style={{ ...card, padding: "13px 15px" }}>
              <div style={label}>{t.k}</div>
              <div style={{ color: "#074069", fontSize: 21, fontWeight: 800, marginTop: 3, fontFamily: "'Montserrat', sans-serif" }}>{t.v}</div>
              <div style={{ color: "#6f86aa", fontSize: 11, marginTop: 3 }}>{t.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Honesty about what was left out */}
      {totalExcluded > 0 && (
        <div style={{ background: "#fffaf0", border: "1px solid #e8d3a8", borderRadius: 12, padding: "11px 14px" }}>
          <div style={{ color: "#8a6d3b", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
            {n0(totalExcluded)} customers were left out of this list on purpose
          </div>
          <div style={{ color: "#6f6152", fontSize: 11.5, lineHeight: 1.65 }}>
            {Object.entries(excluded).filter(([, v]) => v > 0)
              .map(([k, v]) => `${n0(v)} ${EXCLUSION_LABELS[k] || k}`).join(" · ")}.
            <br />
            A referral visit has to arrive at the right door, so any customer whose recorded location
            disagrees with the rest of their area is excluded rather than guessed at. A shorter correct
            list is worth more than a longer unreliable one.
          </div>
        </div>
      )}

      {/* Worklist */}
      <div style={card}>
        <div style={{ color: "#d2ab67", fontSize: 15, fontWeight: 800, marginBottom: 3 }}>
          Call list — highest-scoring first
        </div>
        <div style={{ color: "#6f86aa", fontSize: 11.5, marginBottom: 12 }}>
          Click any row for the address, the delivery boy already on site, and a ready pitch to read out.
        </div>

        {loading && <div style={{ color: "#6f86aa", fontSize: 13, padding: 18 }}>Finding opportunities…</div>}
        {error && <div style={{ color: "#b4453a", fontSize: 13, padding: 18 }}>{error}</div>}
        {!loading && !error && !opportunities.length && (
          <div style={{ color: "#6f86aa", fontSize: 13, padding: 18 }}>
            No opportunities match these filters — try lowering the minimum order count.
          </div>
        )}

        {!!opportunities.length && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["#", "Score", "Customer", "Area", "Loyalty", "Their value", "Neighbour worth", ""].map((h, i) => (
                    <th key={h + i} style={{
                      background: "#074069", color: "#fff", padding: "10px 12px",
                      textAlign: i >= 5 ? "right" : "left",
                      border: "1px solid #c7d9ea", fontSize: 12, fontWeight: 700,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {opportunities.map((o, i) => {
                  const open = expanded === o.customer_id;
                  return (
                    <React.Fragment key={o.customer_id}>
                      <tr onClick={() => setExpanded(open ? null : o.customer_id)} style={{ cursor: "pointer", background: open ? "#f6fbff" : "#fff" }}>
                        <td style={{ padding: "9px 12px", border: "1px solid #d7e3f0", color: "#8ba4bd" }}>{i + 1}</td>
                        <td style={{ padding: "9px 12px", border: "1px solid #d7e3f0" }}>
                          <span style={{
                            background: o.score >= 85 ? "#e8f5ec" : o.score >= 75 ? "#f3f7fb" : "#f8f9fa",
                            color: o.score >= 85 ? "#2f7a4f" : "#5f7f9f",
                            borderRadius: 6, padding: "3px 8px", fontWeight: 800, fontSize: 12,
                          }}>{o.score}</span>
                        </td>
                        <td style={{ padding: "9px 12px", border: "1px solid #d7e3f0", color: "#20476d", fontWeight: 600 }}>
                          {o.name}
                          <div style={{ color: "#8ba4bd", fontSize: 11, fontFamily: "monospace" }}>{o.mobile}</div>
                        </td>
                        <td style={{ padding: "9px 12px", border: "1px solid #d7e3f0", color: "#5f7f9f" }}>
                          {o.sub_area || o.area}
                          <div style={{ color: "#a8bccd", fontSize: 11 }}>{o.hub}</div>
                        </td>
                        <td style={{ padding: "9px 12px", border: "1px solid #d7e3f0", color: "#5f7f9f" }}>
                          {n0(o.deliveries)} orders
                          <div style={{ color: "#a8bccd", fontSize: 11 }}>{o.tenure_months} months</div>
                        </td>
                        <td style={{ padding: "9px 12px", border: "1px solid #d7e3f0", textAlign: "right", color: "#2f7a4f", fontWeight: 700 }}>
                          {inrFull(o.revenue)}
                        </td>
                        <td style={{ padding: "9px 12px", border: "1px solid #d7e3f0", textAlign: "right", color: "#20476d" }}>
                          {inrFull(o.est_value_per_new_customer)}
                        </td>
                        <td style={{ padding: "9px 12px", border: "1px solid #d7e3f0", textAlign: "right", color: "#8ba4bd" }}>
                          {open ? "▾" : "▸"}
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={8} style={{ border: "1px solid #d7e3f0", background: "#f6fbff", padding: "14px 18px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
                              <div>
                                <div style={label}>Address</div>
                                <div style={{ color: "#23486b", fontSize: 12.5, lineHeight: 1.6, marginTop: 4 }}>
                                  {o.address || o.resolved_address || "—"}
                                </div>
                                <a href={`https://www.google.com/maps/search/?api=1&query=${o.lat},${o.lng}`}
                                  target="_blank" rel="noreferrer"
                                  style={{ color: "#2a78d6", fontSize: 12, textDecoration: "none", fontWeight: 600 }}>
                                  Open in Google Maps →
                                </a>
                              </div>
                              <div>
                                <div style={label}>Already on this doorstep</div>
                                <div style={{ color: "#23486b", fontSize: 13, fontWeight: 700, marginTop: 4 }}>
                                  {o.delivery_boy || "—"}
                                </div>
                                <div style={{ color: "#6f86aa", fontSize: 11.5, marginTop: 2 }}>
                                  every morning · can hand over a leaflet
                                </div>
                              </div>
                              <div>
                                <div style={label}>Location confidence</div>
                                <div style={{ color: o.coord_source === "gps" ? "#2f7a4f" : "#8a6d3b", fontSize: 12.5, fontWeight: 700, marginTop: 4 }}>
                                  {o.coord_source === "gps" ? "GPS captured on site" : "Geocoded from address"}
                                </div>
                                <div style={{ color: "#6f86aa", fontSize: 11.5, marginTop: 2 }}>
                                  {o.coord_deviation_km != null
                                    ? `${o.coord_deviation_km} km from area centre`
                                    : "no area baseline"}
                                </div>
                              </div>
                            </div>
                            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed #d6e4f2" }}>
                              <div style={label}>What to say</div>
                              <div style={{ color: "#23486b", fontSize: 13, lineHeight: 1.7, marginTop: 5, fontStyle: "italic" }}>
                                “{buildPitch(o)}”
                              </div>
                              <button type="button" onClick={(e) => { e.stopPropagation(); copyPitch(o); }}
                                style={{ ...chip(false), marginTop: 10 }}>
                                {copied === o.customer_id ? "Copied ✓" : "Copy pitch"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
