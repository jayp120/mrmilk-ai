import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

import { fetchSalesGeoHeatmap } from "../utils/importApi.js";

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

// ---------------------------------------------------------------------------
// Rendering stack: Google Maps basemap + deck.gl HeatmapLayer drawn over it.
//
// Why deck.gl and not Google's own heat layer: Google REMOVED
// maps.visualization.HeatmapLayer in Maps JavaScript API v3.65, so there is no
// first-party heatmap any more. deck.gl's GoogleMapsOverlay is the supported
// way to render a data layer on Google tiles — it syncs to the map's camera
// and draws on WebGL.
//
// Google's basemap is used here because its Pune coverage names societies and
// apartment complexes ("Megapolis Splendour", "Kumar Sidhanchal") that OSM
// does not — for a delivery heat map, knowing WHICH society a hotspot sits on
// is the difference between a pretty picture and an actionable one.
//
// The style below is deliberately desaturated: the basemap's job is
// orientation, the data layer should be the only saturated thing on screen.
// ---------------------------------------------------------------------------
const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
let mapsPromise = null;

function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (mapsPromise) return mapsPromise;
  if (!MAPS_KEY) {
    return Promise.reject(new Error("VITE_GOOGLE_MAPS_API_KEY is not set in the project-root .env"));
  }
  mapsPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&v=weekly`;
    s.async = true;
    s.onload = () => (window.google?.maps
      ? resolve(window.google.maps)
      : reject(new Error("Google Maps script loaded but window.google.maps is missing")));
    s.onerror = () => reject(new Error("Google Maps failed to load — check the key's HTTP-referrer restrictions and that Maps JavaScript API is enabled"));
    document.head.appendChild(s);
  });
  return mapsPromise;
}

const MAP_STYLE = [
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "geometry", stylers: [{ saturation: -65 }, { lightness: 10 }] },
  { featureType: "poi", stylers: [{ saturation: -80 }] },
  { featureType: "poi.business", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ saturation: -70 }, { lightness: 20 }] },
  { featureType: "water", elementType: "geometry", stylers: [{ saturation: -40 }, { lightness: 20 }] },
];

// ---- formatting (Indian conventions) --------------------------------------
const n0 = (v) => Math.round(Number(v) || 0).toLocaleString("en-IN");
const inrShort = (v) => {
  const n = Math.round(Number(v) || 0);
  if (Math.abs(n) >= 1e7) return "₹" + (n / 1e7).toFixed(2) + " Cr";
  if (Math.abs(n) >= 1e5) return "₹" + (n / 1e5).toFixed(2) + " L";
  return "₹" + n.toLocaleString("en-IN");
};
const inrFull = (v) => "₹" + Math.round(Number(v) || 0).toLocaleString("en-IN");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
};

// Sequential single-hue ramp, light → dark. Magnitude is carried by lightness
// on ONE hue — never a rainbow, where hue would falsely imply category change.
// The 0.0 stop is transparent so low-density areas recede into the basemap
// instead of tinting the whole city.
// deck.gl takes the ramp as RGBA steps, low → high.
const HEAT_COLOR_RANGE = [
  [205, 226, 251, 90],
  [158, 197, 244, 150],
  [109, 167, 236, 190],
  [57, 135, 229, 215],
  [37, 106, 191, 235],
  [24, 79, 149, 248],
  [13, 54, 107, 255],
];

const PUNE_CENTER = { lat: 18.5204, lng: 73.8567 };

const WINDOWS = [
  { id: 30, label: "Last 30 days" },
  { id: 90, label: "Last 3 months" },
  { id: 180, label: "Last 6 months" },
  { id: 365, label: "Last 12 months" },
];

const METRICS = [
  { id: "revenue", label: "Revenue", idx: 2, help: "Where the money is — heat follows total sales value." },
  { id: "deliveries", label: "Deliveries", idx: 3, help: "Where the drops are — heat follows delivery count." },
];

/**
 * Percentile of a numeric array — used to cap heat intensity. Without this a
 * single very large location flattens everything else to near-invisible, and
 * the map shows one dot instead of the actual distribution.
 */
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[i];
}

export default function SalesHeatMap() {
  const [windowDays, setWindowDays] = useState(90);
  const [hub, setHub] = useState("");
  const [metric, setMetric] = useState("revenue");
  const [gpsOnly, setGpsOnly] = useState(false);
  const [showCoords, setShowCoords] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mapError, setMapError] = useState("");

  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const heatRef = useRef(null);

  // ---- fetch ---------------------------------------------------------------
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchSalesGeoHeatmap({ windowDays, hub, status: "delivered" }, controller.signal)
      .then((payload) => setData(payload))
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(err?.message || "Could not load the delivery map.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [windowDays, hub]);

  const points = useMemo(() => {
    const raw = data?.points || [];
    return gpsOnly ? raw.filter((p) => p[6] === 1) : raw;
  }, [data, gpsOnly]);

  // ---- init map ------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !mapDivRef.current || mapRef.current) return;
        mapRef.current = new maps.Map(mapDivRef.current, {
          center: PUNE_CENTER,
          zoom: 11,
          styles: MAP_STYLE,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
          gestureHandling: "greedy",
        });
        setMapReady(true);
      })
      .catch((err) => !cancelled && setMapError(err.message));
    return () => {
      cancelled = true;
      if (heatRef.current) {
        heatRef.current.finalize();
        heatRef.current = null;
      }
      mapRef.current = null;
    };
  }, []);

  // ---- draw / redraw heat layer -------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    const maps = window.google?.maps;
    if (!map || !maps || !mapReady || !points.length) return;

    const mIdx = METRICS.find((m) => m.id === metric)?.idx ?? 2;
    const weights = points.map((p) => Number(p[mIdx]) || 0);
    const sorted = [...weights].sort((a, b) => a - b);
    // Cap at p95 so the busiest handful of locations don't compress the rest of
    // the city into invisibility — without this the map shows a few dots and a
    // blank city, which reads as "no business here" rather than "less here".
    const cap = percentile(sorted, 95) || Math.max(...weights, 1);

    const layer = new HeatmapLayer({
      id: `deliveries-heat-${metric}`,
      data: points,
      getPosition: (p) => [p[1], p[0]], // deck.gl wants [lng, lat]
      getWeight: (p) => Math.min(Number(p[mIdx]) || 0, cap),
      colorRange: HEAT_COLOR_RANGE,
      radiusPixels: 38,
      intensity: 1,
      threshold: 0.05,
      aggregation: "SUM",
    });

    if (!heatRef.current) {
      heatRef.current = new GoogleMapsOverlay({ layers: [layer] });
      heatRef.current.setMap(map);
    } else {
      heatRef.current.setProps({ layers: [layer] });
    }

    // Frame where the deliveries actually ARE, not their full extent.
    //
    // Fitting the raw extent frames the whole 78km guard-box: a few fringe
    // customers out towards Lonavala / Shirur drag the bounds wide and the
    // city core — where essentially all the business is — collapses into a
    // small blob surrounded by empty countryside. Clipping to the 2nd–98th
    // percentile of lat/lng frames the actual operating area instead.
    const lats = points.map((p) => p[0]).sort((a, b) => a - b);
    const lngs = points.map((p) => p[1]).sort((a, b) => a - b);
    const bounds = new maps.LatLngBounds(
      { lat: percentile(lats, 2), lng: percentile(lngs, 2) },
      { lat: percentile(lats, 98), lng: percentile(lngs, 98) },
    );

    // Set centre and zoom EXPLICITLY rather than calling fitBounds.
    //
    // fitBounds proved unreliable here: this map mounts inside a tab panel, and
    // when the container isn't measured at call time fitBounds silently leaves
    // the camera at its constructor zoom — the map kept sitting at zoom 11
    // (~105 km across) while the delivery area is only ~23 km. Computing the
    // zoom from the container width is deterministic and can't be defeated by
    // layout timing.
    const centre = {
      lat: (bounds.getSouthWest().lat() + bounds.getNorthEast().lat()) / 2,
      lng: (bounds.getSouthWest().lng() + bounds.getNorthEast().lng()) / 2,
    };
    const applyView = () => {
      const el = mapDivRef.current;
      const width = el?.clientWidth || 0;
      const height = el?.clientHeight || 0;
      if (!width || !height) return false;

      // Web Mercator: the world is 256px square at zoom 0. Longitude maps
      // linearly, latitude does NOT — it must go through the Mercator
      // projection first, or the vertical fit is badly wrong (treating it as
      // linear computed zoom 9 here instead of the correct 12).
      const mercY = (lat) => {
        const rad = (lat * Math.PI) / 180;
        return (1 - Math.log(Math.tan(Math.PI / 4 + rad / 2)) / Math.PI) / 2;
      };
      const lngFraction = Math.max(
        (bounds.getNorthEast().lng() - bounds.getSouthWest().lng()) / 360, 1e-9,
      );
      const latFraction = Math.max(
        Math.abs(mercY(bounds.getSouthWest().lat()) - mercY(bounds.getNorthEast().lat())), 1e-9,
      );
      const zoomX = Math.log2(width / 256 / lngFraction);
      const zoomY = Math.log2(height / 256 / latFraction);
      // Fractional zoom, NOT Math.floor. The delivery area is roughly square
      // while the panel is wide and short, so height is the binding axis
      // (~11.8 here) — flooring that to 11 doubles the visible area and buries
      // the city in empty countryside. Google Maps accepts fractional zoom, so
      // use the exact fit less a small margin.
      const zoom = Math.min(zoomX, zoomY) - 0.15;
      map.setCenter(centre);
      map.setZoom(Math.max(9, Math.min(15.5, zoom)));
      return true;
    };

    if (!applyView()) {
      // Container not laid out yet — retry once it is.
      const t = setTimeout(applyView, 350);
      return () => clearTimeout(t);
    }
  }, [points, metric, mapReady]);

  const cov = data?.coverage;
  const totals = data?.totals;
  const excluded = data?.excluded;
  const activeMetric = METRICS.find((m) => m.id === metric);

  const topLocations = useMemo(() => {
    const mIdx = activeMetric?.idx ?? 2;
    return [...points].sort((a, b) => b[mIdx] - a[mIdx]).slice(0, 12);
  }, [points, activeMetric]);

  const topAreas = useMemo(() => {
    const key = metric === "revenue" ? "revenue" : "deliveries";
    return [...(data?.areas || [])].sort((a, b) => b[key] - a[key]).slice(0, 12);
  }, [data, metric]);

  // Ranked horizontal bars: the right form for "which places are biggest".
  // Bars share ONE hue deliberately — length already encodes magnitude, so
  // colouring by value would spend the identity channel re-encoding it.
  const areaChartOption = useMemo(() => {
    if (!topAreas.length) return null;
    const isRev = metric === "revenue";
    const rows = [...topAreas].reverse(); // ECharts y-axis builds bottom-up
    return {
      grid: { left: 8, right: 78, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (ps) => {
          const a = rows[ps[0].dataIndex];
          return `<strong>${a.area}</strong><br/>Revenue: ${inrFull(a.revenue)}<br/>Deliveries: ${n0(a.deliveries)}<br/>Customers: ${n0(a.customers)}`;
        },
      },
      xAxis: {
        type: "value",
        axisLabel: { formatter: (v) => (isRev ? inrShort(v) : n0(v)), color: "#8ba4bd", fontSize: 11 },
        splitLine: { lineStyle: { color: "#eef3f8" } },
        axisLine: { show: false }, axisTick: { show: false },
      },
      yAxis: {
        type: "category",
        data: rows.map((a) => a.area),
        axisLabel: { color: "#23486b", fontSize: 12, fontWeight: 600 },
        axisLine: { show: false }, axisTick: { show: false },
      },
      series: [{
        type: "bar",
        data: rows.map((a) => (isRev ? a.revenue : a.deliveries)),
        itemStyle: { color: "#2a78d6", borderRadius: [0, 4, 4, 0] },
        barMaxWidth: 18,
        label: {
          show: true, position: "right",
          formatter: (p) => (isRev ? inrShort(p.value) : n0(p.value)),
          color: "#5f7f9f", fontSize: 11, fontWeight: 700,
        },
      }],
    };
  }, [topAreas, metric]);

  const exportCsv = useCallback(() => {
    if (!points.length) return;
    const head = "latitude,longitude,revenue,deliveries,units,customers,has_gps,low_confidence\n";
    const body = points.map((p) => p.join(",")).join("\n");
    const blob = new Blob([head + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mrmilk-delivery-locations-${data?.start}_${data?.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [points, data]);

  // ---- styles (match the workspace's existing card language) ---------------
  const card = {
    background: "#ffffff", border: "1px solid #d7e3f0", borderRadius: 16,
    padding: 18, boxShadow: "0 16px 34px rgba(7,64,105,0.05)",
  };
  const chip = (active) => ({
    background: active ? "#074069" : "#f8fbff",
    color: active ? "#ffffff" : "#23486b",
    border: `1px solid ${active ? "#074069" : "#c4daee"}`,
    borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700,
    cursor: "pointer", fontFamily: "'Montserrat', sans-serif",
  });
  const label = { color: "#6284a6", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Header + controls */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "#d2ab67", fontSize: 15, fontWeight: 800 }}>Delivery heat map</div>
            <div style={{ color: "#6f86aa", fontSize: 12, marginTop: 4, lineHeight: 1.55, maxWidth: 620 }}>
              Where deliveries actually land across Pune &amp; PCMC. Heat follows{" "}
              <strong style={{ color: "#23486b" }}>{activeMetric?.label.toLowerCase()}</strong> — {activeMetric?.help}
            </div>
          </div>
          <button type="button" onClick={exportCsv} disabled={!points.length} style={{ ...chip(false), opacity: points.length ? 1 : 0.5 }}>
            Export CSV
          </button>
        </div>

        {/* One row, three controls, plain language. "Show me X, over Y, for Z."
            The GPS-source toggle is jargon and lives with the coverage note
            below, where the context that explains it also lives. */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16, alignItems: "center" }}>
          <span style={{ ...label, marginRight: 2 }}>Show</span>
          <div style={{ display: "flex", gap: 6 }}>
            {METRICS.map((m) => (
              <button key={m.id} type="button" onClick={() => setMetric(m.id)} style={chip(metric === m.id)}>
                {m.label}
              </button>
            ))}
          </div>

          <span style={{ ...label, marginLeft: 6 }}>over</span>
          <select
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
            style={{ background: "#f8fbff", border: "1px solid #c4daee", borderRadius: 8, color: "#23486b", padding: "8px 10px", fontSize: 12, fontWeight: 600 }}
          >
            {WINDOWS.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>

          <span style={{ ...label, marginLeft: 6 }}>for</span>
          <select
            value={hub}
            onChange={(e) => setHub(e.target.value)}
            style={{ background: "#f8fbff", border: "1px solid #c4daee", borderRadius: 8, color: "#23486b", padding: "8px 10px", fontSize: 12, fontWeight: 600 }}
          >
            <option value="">All hubs</option>
            {(data?.hubs || []).map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
      </div>

      {/* KPI tiles */}
      {totals && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10 }}>
          {[
            { k: "Revenue mapped", v: inrShort(totals.revenue), sub: `${cov?.revenue_pct ?? 0}% of period revenue` },
            { k: "Deliveries mapped", v: n0(totals.deliveries), sub: `${cov?.row_pct ?? 0}% of delivery lines` },
            { k: "Locations", v: n0(points.length), sub: `${n0(totals.customers)} customers` },
            { k: "Period", v: `${data?.days ?? 0} days`, sub: `${fmtDay(data?.start)} → ${fmtDay(data?.end)}` },
          ].map((t) => (
            <div key={t.k} style={{ ...card, padding: "13px 15px" }}>
              <div style={label}>{t.k}</div>
              <div style={{ color: "#074069", fontSize: 21, fontWeight: 800, marginTop: 3, fontFamily: "'Montserrat', sans-serif" }}>{t.v}</div>
              <div style={{ color: "#6f86aa", fontSize: 11, marginTop: 3 }}>{t.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Coverage disclosure — this map is a sample, never let it read as complete */}
      {cov && (
        <div style={{ background: "#f6fbff", border: "1px solid #c4daee", borderRadius: 12, padding: "12px 15px" }}>
          <div style={{ color: "#23486b", fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
            What this map covers
          </div>
          <div style={{ color: "#5f7f9f", fontSize: 12, lineHeight: 1.65 }}>
            Showing <strong>{cov.revenue_pct}%</strong> of the period's revenue ({inrShort(cov.revenue_mapped)} of {inrShort(cov.revenue_in_window)}) across{" "}
            <strong>{n0(cov.customers_mapped)}</strong> of {n0(cov.customers_in_window)} customers.{" "}
            {cov.geocoding_available ? (
              <>
                <strong>{n0(cov.rows_from_gps)}</strong> delivery lines use a GPS coordinate captured on site;{" "}
                <strong>{n0(cov.rows_from_geocoding)}</strong> use an address geocoded to a building — accurate to roughly a
                building or society, not to the doorstep.{" "}
                <button
                  type="button"
                  onClick={() => setGpsOnly((v) => !v)}
                  style={{
                    background: "none", border: "none", padding: 0, cursor: "pointer",
                    color: "#2a78d6", fontSize: 12, fontWeight: 700, textDecoration: "underline",
                  }}
                >
                  {gpsOnly ? "Show all points" : "Show only GPS-confirmed points"}
                </button>
              </>
            ) : (
              <>All points are on-site GPS captures. Customers without a captured location are not shown.</>
            )}
          </div>
          {gpsOnly && (
            <div style={{ color: "#8a6d3b", fontSize: 11.5, marginTop: 7, fontWeight: 600 }}>
              Currently showing GPS-confirmed locations only — geocoded addresses are hidden, so totals below are lower than the full picture.
            </div>
          )}
          {excluded?.out_of_region_rows > 0 && (
            <div style={{ color: "#8a6d3b", fontSize: 11.5, lineHeight: 1.6, marginTop: 8, paddingTop: 8, borderTop: "1px dashed #d6e4f2" }}>
              <strong>Data quality:</strong> {n0(excluded.out_of_region_rows)} delivery lines ({inrShort(excluded.out_of_region_revenue)})
              carry coordinates outside Pune/PCMC and are excluded.
              {excluded.clusters?.[0] && (
                <> The largest is <strong>{excluded.clusters[0].customers} customers</strong> sitting at{" "}
                {excluded.clusters[0].lat.toFixed(2)}, {excluded.clusters[0].lng.toFixed(2)} (Delhi) whose recorded areas are{" "}
                {(excluded.clusters[0].recorded_areas || []).join(", ")} — a bad GPS capture worth fixing at source in MilkMaster.</>
              )}
            </div>
          )}
        </div>
      )}

      {/* Map */}
      <div style={{ ...card, padding: 0, overflow: "hidden", position: "relative" }}>
        {/* Tall enough that the (roughly square) delivery area isn't
            height-constrained into a needlessly wide, zoomed-out view. */}
        <div ref={mapDivRef} style={{ width: "100%", height: 720, background: "#eef3f8" }} />

        {(loading || error || mapError || (!loading && !points.length)) && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(255,255,255,0.93)", padding: 24 }}>
            <div style={{ textAlign: "center", maxWidth: 460 }}>
              {loading && <div style={{ color: "#6f86aa", fontSize: 13 }}>Loading delivery locations…</div>}
              {(error || mapError) && (
                <>
                  <div style={{ color: "#b4453a", fontSize: 13, fontWeight: 700 }}>{error || mapError}</div>
                  {mapError && (
                    <div style={{ color: "#6f86aa", fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
                      Check that <code>VITE_GOOGLE_MAPS_API_KEY</code> is set in the project-root <code>.env</code>, that
                      Maps JavaScript API is enabled for that key, and that this origin is listed in its HTTP-referrer
                      restrictions. The dev server must be restarted after editing <code>.env</code>.
                    </div>
                  )}
                </>
              )}
              {!loading && !error && !mapError && !points.length && (
                <div style={{ color: "#6f86aa", fontSize: 13 }}>
                  No mapped deliveries in this period{hub ? ` for ${hub}` : ""}.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Legend */}
        {!!points.length && (
          <div style={{ position: "absolute", left: 14, bottom: 14, background: "rgba(255,255,255,0.95)", border: "1px solid #d7e3f0", borderRadius: 10, padding: "9px 12px", boxShadow: "0 6px 18px rgba(7,64,105,0.12)" }}>
            <div style={{ ...label, marginBottom: 6 }}>{activeMetric?.label} density</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: "#6f86aa" }}>Low</span>
              <div style={{ width: 132, height: 9, borderRadius: 5, background: "linear-gradient(90deg,#cde2fb,#9ec5f4,#6da7ec,#3987e5,#256abf,#184f95,#0d366b)" }} />
              <span style={{ fontSize: 10, color: "#6f86aa" }}>High</span>
            </div>
          </div>
        )}
      </div>

      {/* Top areas — the readable view. Place names, not coordinates. */}
      {areaChartOption && (
        <div style={card}>
          <div style={{ color: "#d2ab67", fontSize: 15, fontWeight: 800, marginBottom: 4 }}>
            Top 12 areas by {activeMetric?.label.toLowerCase()}
          </div>
          <div style={{ color: "#6f86aa", fontSize: 11.5, marginBottom: 10 }}>
            The same mapped deliveries, grouped by area. Hover any bar for its revenue, delivery count and customer count.
          </div>
          <ReactEChartsCore
            echarts={echarts}
            option={areaChartOption}
            style={{ height: Math.max(280, topAreas.length * 30) }}
            notMerge
            lazyUpdate
          />
        </div>
      )}

      {/* Exact coordinates — kept for pinpointing, but folded away by default
          so the main view isn't dominated by unreadable lat/lng pairs. */}
      {!!topLocations.length && (
        <div style={card}>
          <button
            type="button"
            onClick={() => setShowCoords((v) => !v)}
            style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              color: "#23486b", fontSize: 13, fontWeight: 700, fontFamily: "'Montserrat', sans-serif",
            }}
          >
            {showCoords ? "▾" : "▸"} Exact coordinates of the top {topLocations.length} hotspots
          </button>
          {!showCoords && (
            <div style={{ color: "#6f86aa", fontSize: 11.5, marginTop: 5 }}>
              For pinpointing a specific building or planning a route — each row links to Google Maps.
            </div>
          )}
          {showCoords && (
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["#", "Coordinates", "Revenue", "Deliveries", "Customers", "Source"].map((h) => (
                    <th key={h} style={{ background: "#074069", color: "#fff", padding: "10px 12px", textAlign: h === "Revenue" || h === "Deliveries" || h === "Customers" ? "right" : "left", border: "1px solid #c7d9ea", fontSize: 12, fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topLocations.map((p, i) => (
                  <tr key={`${p[0]},${p[1]}`}>
                    <td style={{ padding: "9px 12px", border: "1px solid #d7e3f0", color: "#8ba4bd" }}>{i + 1}</td>
                    <td style={{ padding: "9px 12px", border: "1px solid #d7e3f0", fontFamily: "monospace", fontSize: 11.5, color: "#20476d" }}>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${p[0]},${p[1]}`}
                        target="_blank" rel="noreferrer"
                        style={{ color: "#2a78d6", textDecoration: "none" }}
                      >
                        {p[0].toFixed(5)}, {p[1].toFixed(5)}
                      </a>
                    </td>
                    <td style={{ padding: "9px 12px", border: "1px solid #d7e3f0", textAlign: "right", color: "#2f7a4f", fontWeight: 700 }}>{inrFull(p[2])}</td>
                    <td style={{ padding: "9px 12px", border: "1px solid #d7e3f0", textAlign: "right", color: "#20476d" }}>{n0(p[3])}</td>
                    <td style={{ padding: "9px 12px", border: "1px solid #d7e3f0", textAlign: "right", color: "#5f7f9f" }}>{n0(p[5])}</td>
                    <td style={{ padding: "9px 12px", border: "1px solid #d7e3f0" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: p[6] === 1 ? "#2f7a4f" : "#8a6d3b" }}>
                        {p[6] === 1 ? "GPS" : "Geocoded"}
                      </span>
                      {p[7] === 1 && <span style={{ fontSize: 10.5, color: "#b4453a", marginLeft: 6 }}>low confidence</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
