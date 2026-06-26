import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent, DataZoomComponent, MarkLineComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import * as XLSX from "xlsx";

import { fetchDailyProductSales, fetchSalesByHub, fetchSalesDailyByHub, fetchSalesProducts } from "../utils/importApi.js";
import { CONFIG } from "../config.js";

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, DataZoomComponent, MarkLineComponent, CanvasRenderer]);

// ---- number / date formatting (Indian conventions) ----------------------
const n0 = (v) => Math.round(Number(v) || 0).toLocaleString("en-IN");
const n1 = (v) => (Number(v) || 0).toLocaleString("en-IN", { maximumFractionDigits: 1 });
const inrFull = (v) => "₹" + Math.round(Number(v) || 0).toLocaleString("en-IN");
const inrShort = (v) => {
  const n = Math.round(Number(v) || 0);
  if (Math.abs(n) >= 1e7) return "₹" + (n / 1e7).toFixed(2) + " Cr";
  if (Math.abs(n) >= 1e5) return "₹" + (n / 1e5).toFixed(2) + " L";
  return "₹" + n.toLocaleString("en-IN");
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
};
const fmtMonth = (ym) => {
  const [y, m] = ym.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
};

// Does a product_weight mean "1 litre"? (default-pick helper only)
const is1Litre = (w) => {
  const k = String(w || "").toLowerCase().replace(/\s+/g, "");
  return ["1litre", "1l", "1ltr", "1.0litre", "1000ml", "1000milliliter"].includes(k);
};

const WK_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HUB_COLORS = ["#074069", "#2f7a4f", "#d2ab67", "#c0577a", "#4a8fb3", "#8a6d3b", "#6b6f9c"];

const DEFAULT_PRODUCT = "Desi Cow A2 Milk";
const DEFAULT_START = "2025-04-01";
const DEFAULT_END = "2026-03-31";

// ---- auto-generated business insights (data-driven narrative) ------------
function buildInsights(days, derived, summary, meta) {
  const out = [];
  const { totalUnits, totalRevenue, totalDelivered, spoilage, avgPrice, monthly, weekday, best, worst, sellingDays, avgCust } = derived;
  const totalCustDays = days.reduce((a, d) => a + d.customers, 0);
  const litresPerCust = totalCustDays ? totalUnits / totalCustDays : 0;

  if (monthly.length >= 2) {
    const fm = monthly[0];
    const lm = monthly[monthly.length - 1];
    const fr = fm.active ? fm.units / fm.active : 0;
    const lr = lm.active ? lm.units / lm.active : 0;
    const g = fr ? ((lr - fr) / fr) * 100 : 0;
    out.push(`Daily volume moved from ~${n0(fr)} L/day in ${fmtMonth(fm.ym)} to ~${n0(lr)} L/day in ${fmtMonth(lm.ym)} (${g >= 0 ? "+" : ""}${g.toFixed(1)}% over the period).`);
  }
  if (monthly.length) {
    const bm = monthly.reduce((a, b) => (b.units > a.units ? b : a));
    const wm = monthly.reduce((a, b) => (b.units < a.units ? b : a));
    out.push(`Strongest month: ${fmtMonth(bm.ym)} at ${n0(bm.units)} L (${inrShort(bm.revenue)}); weakest: ${fmtMonth(wm.ym)} at ${n0(wm.units)} L.`);
    if (totalUnits) out.push(`${fmtMonth(bm.ym)} alone was ${((bm.units / totalUnits) * 100).toFixed(1)}% of total volume.`);
  }
  const wkBest = weekday.reduce((a, b) => (b.avg > a.avg ? b : a));
  const wkWorst = weekday.reduce((a, b) => (b.avg < a.avg ? b : a));
  const swing = wkWorst.avg ? ((wkBest.avg - wkWorst.avg) / wkWorst.avg) * 100 : 0;
  out.push(`${wkBest.day} is the best weekday (avg ${n0(wkBest.avg)} L); ${wkWorst.day} the slowest (avg ${n0(wkWorst.avg)} L) — a ${swing.toFixed(0)}% swing.`);
  if (best) out.push(`Busiest single day: ${fmtDay(best.date)} at ${n0(best.units)} L (${inrFull(best.revenue)}).`);
  if (worst) out.push(`Quietest selling day: ${fmtDay(worst.date)} at ${n0(worst.units)} L.`);
  out.push(`Average realised price was ${inrFull(avgPrice)} per litre.`);
  out.push(`Around ${n0(avgCust)} customers bought per selling day, ~${n1(litresPerCust)} litres each.`);
  if (summary.days_in_range) out.push(`Sold on ${n0(sellingDays)} of ${n0(summary.days_in_range)} days (${((sellingDays / summary.days_in_range) * 100).toFixed(0)}% of the calendar).`);
  const sr = totalDelivered ? (spoilage / totalDelivered) * 100 : 0;
  const word = sr < 0.2 ? "very low" : sr < 1 ? "low" : sr < 3 ? "moderate" : "high — worth investigating";
  out.push(`Disputed/spoilt volume was ${n0(spoilage)} L (${sr.toFixed(2)}% of delivered) — ${word}.`);
  out.push(`Overall: ${n0(totalUnits)} litres sold for ${inrShort(totalRevenue)} between ${fmtDay(meta.start)} and ${fmtDay(meta.end)}.`);
  return out;
}

// Apply an Excel number format to one column's data cells (numeric only).
function setColFmt(ws, c, z, r0, r1) {
  for (let r = r0; r <= r1; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c })];
    if (cell && cell.t === "n") cell.z = z;
  }
}

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---- deep, strictly data-driven analytics over the daily series ----------
function buildAnalytics({ days, derived, hubData, summary }) {
  const n = days.length;
  const units = days.map((d) => d.units);
  const revenue = days.map((d) => d.revenue);
  const mean = derived.totalUnits / Math.max(n, 1);

  const ma = (k) => units.map((_, i) => {
    const w = units.slice(Math.max(0, i - (k - 1)), i + 1);
    return Math.round(w.reduce((a, b) => a + b, 0) / w.length);
  });
  const ma7 = ma(7), ma30 = ma(30);
  let cr = 0; const cumRevenue = revenue.map((r) => Math.round((cr += r)));

  // linear regression slope of units vs day index → trend
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  units.forEach((y, i) => { sx += i; sy += y; sxx += i * i; sxy += i * y; });
  const denom = n * sxx - sx * sx;
  const slope = denom ? (n * sxy - sx * sy) / denom : 0;
  const monthlyTrendL = slope * 30;
  const monthlyTrendPct = mean ? (monthlyTrendL / mean) * 100 : 0;

  const half = Math.floor(n / 2);
  const firstMean = half ? units.slice(0, half).reduce((a, b) => a + b, 0) / half : 0;
  const secondMean = (n - half) ? units.slice(half).reduce((a, b) => a + b, 0) / (n - half) : 0;
  const halfDeltaPct = firstMean ? (secondMean / firstMean - 1) * 100 : 0;

  const variance = n ? units.reduce((a, y) => a + (y - mean) ** 2, 0) / n : 0;
  const std = Math.sqrt(variance);
  const cv = mean ? (std / mean) * 100 : 0;

  const last30 = units.slice(-30);
  const runRate = last30.length ? last30.reduce((a, b) => a + b, 0) / last30.length : mean;
  const projNext30 = Math.round(runRate * 30);

  const sorted = [...units].sort((a, b) => b - a);
  const top20n = Math.max(1, Math.round(n * 0.2));
  const top20share = derived.totalUnits ? (sorted.slice(0, top20n).reduce((a, b) => a + b, 0) / derived.totalUnits) * 100 : 0;

  const monthly = derived.monthly;
  const months = monthly.map((m) => fmtMonth(m.ym));
  const monthlyUnits = monthly.map((m) => Math.round(m.units));
  const monthlyRevenue = monthly.map((m) => Math.round(m.revenue));
  const momGrowth = monthly.map((m, i) => { const p = monthly[i - 1]; return p && p.units ? Number((((m.units - p.units) / p.units) * 100).toFixed(1)) : null; });
  const seasonalityIndex = monthly.map((m) => (m.active && mean ? Math.round((m.units / m.active) / mean * 100) : 0));

  const mc = new Map();
  for (const d of days) {
    const ym = d.date.slice(0, 7);
    const e = mc.get(ym) || { cust: 0, days: 0, units: 0, rev: 0 };
    e.cust += d.customers; if (d.lines > 0) e.days++; e.units += d.units; e.rev += d.revenue;
    mc.set(ym, e);
  }
  const monthlyCustAvg = monthly.map((m) => { const e = mc.get(m.ym); return e && e.days ? Math.round(e.cust / e.days) : 0; });
  const monthlyPriceAvg = monthly.map((m) => { const e = mc.get(m.ym); return e && e.units ? Number((e.rev / e.units).toFixed(2)) : 0; });
  const monthlyBasket = monthly.map((m) => { const e = mc.get(m.ym); return e && e.cust ? Number((e.units / e.cust).toFixed(2)) : 0; });
  const lM = monthly.length - 1;
  const custGrowthPct = monthlyCustAvg[0] ? (monthlyCustAvg[lM] / monthlyCustAvg[0] - 1) * 100 : 0;
  const priceChangePct = monthlyPriceAvg[0] ? (monthlyPriceAvg[lM] / monthlyPriceAvg[0] - 1) * 100 : 0;
  const basketChangePct = monthlyBasket[0] ? (monthlyBasket[lM] / monthlyBasket[0] - 1) * 100 : 0;

  let bestW = { sum: -1, end: 0 }, worstW = { sum: Infinity, end: 0 };
  for (let i = 6; i < n; i++) {
    const s = units.slice(i - 6, i + 1).reduce((a, b) => a + b, 0);
    if (s > bestW.sum) bestW = { sum: s, end: i };
    if (s < worstW.sum) worstW = { sum: s, end: i };
  }
  const weekLabel = (e) => (e >= 6 ? `${fmtDay(days[e - 6].date)} – ${fmtDay(days[e].date)}` : "");
  const peakMonth = monthly.reduce((a, b) => (b.units > a.units ? b : a), monthly[0]);
  const troughMonth = monthly.reduce((a, b) => (b.units < a.units ? b : a), monthly[0]);

  const lo = Math.min(...units), hi = Math.max(...units);
  const bins = 10, width = (hi - lo) / bins || 1;
  const histCounts = new Array(bins).fill(0);
  for (const y of units) { let b = Math.floor((y - lo) / width); if (b >= bins) b = bins - 1; if (b < 0) b = 0; histCounts[b]++; }
  const histBins = histCounts.map((_, i) => n0(Math.round(lo + i * width)));

  const hubNames = (hubData?.hubs || []).map((h) => h.hub);
  const hubMonthly = {};
  if (hubData?.dates?.length) {
    const monthKeys = []; const idxByMonth = new Map();
    hubData.dates.forEach((d) => { const ym = d.slice(0, 7); if (!idxByMonth.has(ym)) { idxByMonth.set(ym, monthKeys.length); monthKeys.push(ym); } });
    for (const h of hubNames) {
      const arr = new Array(monthKeys.length).fill(0);
      const u = hubData.units_by_hub[h] || [];
      hubData.dates.forEach((d, i) => { arr[idxByMonth.get(d.slice(0, 7))] += u[i] || 0; });
      hubMonthly[h] = arr.map((v) => Math.round(v));
    }
  }
  const hubs = (hubData?.hubs || []).map((h) => ({
    ...h,
    litresPerCust: h.customers ? h.units / h.customers : 0,
    spoilage: h.delivered - h.units,
    spoilRate: h.delivered ? (h.delivered - h.units) / h.delivered * 100 : 0,
  }));
  const hhi = hubs.reduce((a, h) => a + Math.pow(h.share_units, 2), 0);
  const topHub = hubs[0] || null;

  const spoilByDay = days.map((d) => ({ date: d.date, sp: d.delivered - d.units }));
  const worstSpoil = spoilByDay.reduce((a, b) => (b.sp > a.sp ? b : a), spoilByDay[0] || { date: null, sp: 0 });
  const spoilDays = spoilByDay.filter((x) => x.sp > 0).length;

  return {
    n, mean, ma7, ma30, cumRevenue, slope, monthlyTrendL, monthlyTrendPct, firstMean, secondMean, halfDeltaPct,
    std, cv, runRate, projNext30, top20share,
    months, monthlyUnits, monthlyRevenue, momGrowth, seasonalityIndex, monthlyCustAvg, monthlyPriceAvg, monthlyBasket,
    custGrowthPct, priceChangePct, basketChangePct, bestW, worstW, weekLabel, peakMonth, troughMonth,
    histBins, histCounts, hubNames, hubMonthly, hubs, hhi, topHub, worstSpoil, spoilDays,
  };
}

// ---- strictly data-driven business recommendations -----------------------
function buildRecommendations(A, derived, summary, meta) {
  const recs = [];
  const yearFactor = 365 / Math.max(summary.days_in_range, 1);

  if (A.monthlyTrendPct > 2) {
    const target = Math.round(A.runRate + A.monthlyTrendL * 3);
    recs.push({ icon: "📈", title: "Demand is growing — lock in supply & capacity", detail: `Volume is trending <b>+${A.monthlyTrendPct.toFixed(1)}% per month</b> (≈ +${n0(A.monthlyTrendL)} L/day each month); the last 30-day run-rate is ${n0(A.runRate)} L/day. At this pace you'll need ~<b>${n0(target)} L/day</b> within 3 months. <b>Action:</b> pre-commit raw-milk procurement and delivery slots for that level now to avoid stockouts.` });
  } else if (A.monthlyTrendPct < -2) {
    recs.push({ icon: "⚠️", title: "Demand is softening — act on retention first", detail: `Volume is trending <b>${A.monthlyTrendPct.toFixed(1)}%/month</b>; the second half averaged ${n0(A.secondMean)} L/day vs ${n0(A.firstMean)} L/day in the first half, and customers/day moved ${A.custGrowthPct >= 0 ? "+" : ""}${A.custGrowthPct.toFixed(1)}%. <b>Action:</b> prioritise win-back of lapsed subscribers before adding capacity.` });
  } else {
    recs.push({ icon: "➡️", title: "Demand is stable — compete on margin & basket", detail: `Volume is essentially flat (${A.halfDeltaPct >= 0 ? "+" : ""}${A.halfDeltaPct.toFixed(1)}% second half vs first) at ~${n0(A.mean)} L/day. <b>Action:</b> shift focus from volume to value — protect the ${inrFull(derived.avgPrice)}/L price and grow basket size.` });
  }

  const wk = derived.weekday;
  const wkBest = wk.reduce((a, b) => (b.avg > a.avg ? b : a));
  const wkWorst = wk.reduce((a, b) => (b.avg < a.avg ? b : a));
  const gap = wkBest.avg - wkWorst.avg;
  if (gap > A.mean * 0.03) {
    const occ = Math.round(summary.days_in_range / 7);
    const uplift = Math.round(gap * occ * yearFactor);
    recs.push({ icon: "📅", title: `Lift ${wkWorst.day} — your weakest weekday`, detail: `${wkWorst.day}s average ${n0(wkWorst.avg)} L vs ${n0(wkBest.avg)} L on ${wkBest.day}s — a <b>${(gap / wkWorst.avg * 100).toFixed(0)}% gap</b>. Closing it would add ~<b>${n0(uplift)} L/year</b> (~${inrShort(uplift * derived.avgPrice)}). <b>Action:</b> a targeted ${wkWorst.day} reminder / subscription nudge to households that skip that day.` });
  }

  const peakIdx = A.seasonalityIndex.indexOf(Math.max(...A.seasonalityIndex));
  const troughIdx = A.seasonalityIndex.indexOf(Math.min(...A.seasonalityIndex));
  if (A.months.length >= 3 && (A.seasonalityIndex[peakIdx] - A.seasonalityIndex[troughIdx]) > 8) {
    recs.push({ icon: "🗓️", title: "Plan around the seasonal swing", detail: `${A.months[peakIdx]} ran at index <b>${A.seasonalityIndex[peakIdx]}</b> vs 100 (period average), while ${A.months[troughIdx]} was <b>${A.seasonalityIndex[troughIdx]}</b>. <b>Action:</b> pre-build inventory and rosters ahead of ${A.months[peakIdx].split(" ")[0]}; run retention pushes during ${A.months[troughIdx].split(" ")[0]}.` });
  }

  if (A.hubs.length > 1) {
    const big = A.hubs[0];
    const tail = A.hubs.filter((h) => !/no hub/i.test(h.hub));
    const small = tail[tail.length - 1];
    if (small && small.hub !== big.hub) {
      const lower = small.litresPerCust < big.litresPerCust;
      recs.push({ icon: "🏬", title: `Grow ${small.hub}`, detail: `${big.hub} drives <b>${n1(big.share_units)}%</b> of volume; ${small.hub} only <b>${n1(small.share_units)}%</b> with ${n0(small.customers)} customers (~${n1(small.litresPerCust)} L/customer vs ${n1(big.litresPerCust)} at ${big.hub}). <b>Action:</b> ${lower ? `upsell existing ${small.hub} customers toward the ${n1(big.litresPerCust)} L benchmark` : `acquire more households in ${small.hub}'s catchment`}.` });
    }
  }

  const noHub = A.hubs.find((h) => /no hub/i.test(h.hub));
  if (noHub && noHub.units > 0) {
    recs.push({ icon: "🧹", title: "Fix unassigned-hub deliveries", detail: `${n0(noHub.units)} L (${n0(noHub.lines)} ${noHub.lines === 1 ? "delivery" : "deliveries"}) have no hub tag. <b>Action:</b> assign them to a hub so routing and hub-level P&L stay accurate.` });
  }

  const annualVol = Math.round(derived.totalUnits * yearFactor);
  recs.push({ icon: "💰", title: "Headroom for a premium tier", detail: `Realised price has held at <b>${inrFull(derived.avgPrice)}/L</b> (${A.priceChangePct >= 0 ? "+" : ""}${A.priceChangePct.toFixed(1)}% over the period — no erosion). At ~${n0(annualVol)} L/year, a +₹2/L premium taken by even 25% of volume ≈ <b>${inrShort(annualVol * 0.25 * 2)}/year</b>. <b>Action:</b> pilot a small premium / loyalty SKU.` });

  recs.push({
    icon: A.cv < 12 ? "🎯" : "🌊", title: A.cv < 12 ? "Demand is predictable — tighten procurement" : "Smooth volatile days",
    detail: A.cv < 12
      ? `Daily volume varies only <b>${A.cv.toFixed(1)}%</b> around the ${n0(A.mean)} L mean, and the top 20% of days are just ${A.top20share.toFixed(0)}% of volume (highly even). <b>Action:</b> set daily procurement at ~${n0(A.mean)} L with a thin ${n0(A.std)} L buffer to cut both waste and stockouts.`
      : `Daily volume swings ±<b>${A.cv.toFixed(1)}%</b> (std ${n0(A.std)} L). <b>Action:</b> investigate the extremes (${fmtDay(derived.best.date)} high vs ${fmtDay(derived.worst.date)} low) and stabilise supply.`,
  });

  const spRate = derived.totalDelivered ? derived.spoilage / derived.totalDelivered * 100 : 0;
  if (spRate > 0.5) {
    recs.push({ icon: "🧊", title: "Cut spoilage / disputes", detail: `${n0(derived.spoilage)} L (<b>${spRate.toFixed(2)}%</b> of delivered) were disputed/spoilt across ${n0(A.spoilDays)} days, worst on ${fmtDay(A.worstSpoil.date)} (${n0(A.worstSpoil.sp)} L). <b>Action:</b> review cold-chain / handling on those routes.` });
  } else {
    recs.push({ icon: "✅", title: "Quality is a strength — market it", detail: `Disputed/spoilt is just <b>${spRate.toFixed(2)}%</b> of delivered (${n0(derived.spoilage)} L). <b>Action:</b> keep current cold-chain SOPs and use this reliability as a marketing proof point.` });
  }
  return recs;
}

// ---- self-contained interactive HTML dashboard (KPIs + ECharts + recos) ---
function buildDashboardHtml({ meta, brand, summary, derived, days, hubData, insights }) {
  const A = buildAnalytics({ days, derived, hubData, summary });
  const recs = buildRecommendations(A, derived, summary, meta);
  const hubColorList = A.hubs.map((_, i) => HUB_COLORS[i % HUB_COLORS.length]);
  const totalCustDays = days.reduce((a, d) => a + d.customers, 0);
  const basket = totalCustDays ? derived.totalUnits / totalCustDays : 0;

  const chartData = {
    dates: days.map((d) => d.date),
    dailyUnits: days.map((d) => Math.round(d.units)),
    ma7: A.ma7, ma30: A.ma30, cumRevenue: A.cumRevenue,
    months: A.months, monthlyUnits: A.monthlyUnits, monthlyRevenue: A.monthlyRevenue,
    momGrowth: A.momGrowth, seasonalityIndex: A.seasonalityIndex,
    monthlyCustAvg: A.monthlyCustAvg, monthlyPriceAvg: A.monthlyPriceAvg,
    wkDays: derived.weekday.map((w) => w.day), wkAvg: derived.weekday.map((w) => Math.round(w.avg)),
    hubNames: A.hubNames, hubUnits: A.hubs.map((h) => Math.round(h.units)), hubColors: hubColorList,
    hubMonthly: A.hubMonthly, histBins: A.histBins, histCounts: A.histCounts,
  };
  const dataJson = JSON.stringify(chartData).replace(/</g, "\\u003c");

  const arrow = (pct, goodUp = true) => {
    if (pct == null || !isFinite(pct)) return "";
    const up = pct >= 0; const good = goodUp ? up : !up;
    return `<span class="delta ${good ? "up" : "down"}">${up ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}%</span>`;
  };
  const spoilPct = derived.totalDelivered ? (derived.spoilage / derived.totalDelivered) * 100 : 0;
  const kpis = [
    { label: "Litres sold (net)", value: n0(derived.totalUnits), sub: `${n0(summary.total_lines)} deliveries`, c: "#074069", d: arrow(A.halfDeltaPct) + " <span class='dt'>2H vs 1H</span>" },
    { label: "Revenue", value: inrShort(derived.totalRevenue), sub: `${n0(summary.active_days)} selling days`, c: "#2f7a4f", d: "" },
    { label: "Avg per day", value: `${n0(summary.avg_units_per_day)} L`, sub: `${inrShort(derived.totalRevenue / Math.max(summary.days_in_range, 1))} / day`, c: "#d2ab67", d: "" },
    { label: "Monthly trend", value: `${A.monthlyTrendPct >= 0 ? "+" : ""}${A.monthlyTrendPct.toFixed(1)}%`, sub: `${A.monthlyTrendL >= 0 ? "+" : ""}${n0(A.monthlyTrendL)} L/day per month`, c: A.monthlyTrendPct >= 0 ? "#2f7a4f" : "#c0577a", d: "" },
    { label: "Customers / day", value: n0(derived.avgCust), sub: `~${n1(basket)} L each`, c: "#0a5688", d: arrow(A.custGrowthPct) },
    { label: "Price / litre", value: inrFull(derived.avgPrice), sub: "realised, after discounts", c: "#074069", d: arrow(A.priceChangePct) },
    { label: "Consistency (CV)", value: `${A.cv.toFixed(1)}%`, sub: A.cv < 12 ? "very steady demand" : "variable demand", c: "#6b6f9c", d: "" },
    { label: "Disputed / spoilt", value: `${n0(derived.spoilage)} L`, sub: `${spoilPct.toFixed(2)}% of delivered`, c: "#c0577a", d: "" },
  ];
  const kpiHtml = kpis.map((k) => `<div class="kpi"><div class="kl">${esc(k.label)}</div><div class="kv" style="color:${k.c}">${esc(k.value)} ${k.d}</div><div class="ks">${esc(k.sub)}</div></div>`).join("");

  const hl = [
    { t: "Busiest day", v: derived.best ? `${n0(derived.best.units)} L` : "—", s: derived.best ? fmtDay(derived.best.date) : "" },
    { t: "Top month", v: `${n0(A.peakMonth.units)} L`, s: fmtMonth(A.peakMonth.ym) },
    { t: "Best 7-day run", v: `${n0(A.bestW.sum)} L`, s: A.weekLabel(A.bestW.end) },
    A.topHub ? { t: "Lead hub", v: `${n1(A.topHub.share_units)}%`, s: A.topHub.hub } : { t: "Run-rate (30d)", v: `${n0(A.runRate)} L/day`, s: `≈ ${n0(A.projNext30)} L next 30d` },
  ];
  const hlHtml = hl.map((h) => `<div class="hl"><div class="hlt">${esc(h.t)}</div><div class="hlv">${esc(h.v)}</div><div class="hls">${esc(h.s)}</div></div>`).join("");
  const recHtml = recs.map((r) => `<div class="reco"><div class="ri">${r.icon}</div><div><div class="rt">${esc(r.title)}</div><div class="rd">${r.detail}</div></div></div>`).join("");
  const insightsHtml = insights.map((s) => `<li>${esc(s)}</li>`).join("");
  const hubRows = A.hubs.map((h, i) => `<tr><td><span class="sw" style="background:${hubColorList[i]}"></span>${esc(h.hub)}</td><td class="r b">${n0(h.units)}</td><td class="r">${n1(h.share_units)}%</td><td class="r g">${inrFull(h.revenue)}</td><td class="r">${n0(h.avg_units_per_day)} L</td><td class="r">${n0(h.customers)}</td><td class="r">${n1(h.litresPerCust)}</td><td class="r">${h.spoilRate.toFixed(2)}%</td></tr>`).join("");
  const monthRows = derived.monthly.map((m, i) => `<tr><td>${fmtMonth(m.ym)}</td><td class="r b">${n0(m.units)}</td><td class="r g">${inrFull(m.revenue)}</td><td class="r">${m.active ? n0(m.units / m.active) : "—"}</td><td class="r">${A.seasonalityIndex[i]}</td><td class="r">${A.momGrowth[i] == null ? "—" : (A.momGrowth[i] >= 0 ? "+" : "") + A.momGrowth[i] + "%"}</td></tr>`).join("");
  const dailyRows = days.map((d) => `<tr><td>${fmtDay(d.date)}</td><td class="r b">${n0(d.units)}</td><td class="r">${n0(d.delivered)}</td><td class="r g">${inrFull(d.revenue)}</td><td class="r">${n0(d.lines)}</td><td class="r">${n0(d.customers)}</td></tr>`).join("");

  const title = `${esc(meta.product)}${meta.weight ? " (" + esc(meta.weight) + ")" : ""}`;
  const hubBadge = meta.hub ? `<span class="badge">Hub: ${esc(meta.hub)}</span>` : `<span class="badge">All hubs</span>`;
  const hubSection = A.hubs.length ? `
<h2 id="s-hubs">Hubs</h2>
<div class="grid2"><div class="card"><h3>Hub share of litres</h3><div id="hubpie" class="chart"></div></div><div class="card"><h3>Hub volume by month</h3><div id="hubstack" class="chart"></div></div></div>
<div class="card"><h3>Hub-wise performance</h3><div class="scroll"><table><thead><tr><th>Hub</th><th class="r">Litres</th><th class="r">Share</th><th class="r">Revenue</th><th class="r">Avg/day</th><th class="r">Customers</th><th class="r">L / cust</th><th class="r">Spoilage</th></tr></thead><tbody>${hubRows}</tbody></table></div></div>` : "";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(brand.company || "Mr. Milk")} — Sales Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
<style>
*{box-sizing:border-box}body{margin:0;font-family:'Segoe UI',system-ui,sans-serif;background:#eef3f9;color:#1f3550}
.wrap{max-width:1200px;margin:0 auto;padding:0 18px 50px}
.topnav{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.92);backdrop-filter:blur(8px);border-bottom:1px solid #d7e3f0;display:flex;gap:6px;align-items:center;padding:9px 18px;margin:0 -18px 16px;flex-wrap:wrap}
.topnav b{color:#074069;margin-right:8px}.topnav a{color:#42607f;text-decoration:none;font-size:13px;font-weight:600;padding:5px 10px;border-radius:8px}.topnav a:hover{background:#eef3f9;color:#074069}
.topnav .pr{margin-left:auto;background:#074069;color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer}
header{background:linear-gradient(135deg,#063a5f,#0a5688 60%,#0d6ea0);color:#eaf3ff;border-radius:18px;padding:22px 26px;box-shadow:0 18px 40px rgba(7,64,105,.22);margin-top:14px}
header .eyebrow{color:#ffe6b8;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700}
header h1{margin:6px 0 6px;font-size:28px;letter-spacing:-.5px}
header .meta{font-size:13px;color:#cfe0f1;line-height:1.7}
.badge{display:inline-block;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);border-radius:999px;padding:2px 10px;font-size:12px;margin-left:6px}
.lede{margin-top:14px;background:rgba(255,255,255,.12);border-radius:12px;padding:12px 16px;font-size:15px;line-height:1.6}.lede b{color:#ffe6b8}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:16px 0}
.kpi{background:#fff;border:1px solid #d7e3f0;border-radius:14px;padding:14px 16px;box-shadow:0 10px 24px rgba(7,64,105,.05)}
.kl{color:#6f86aa;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.kv{font-size:22px;font-weight:800;margin-top:5px}
.ks{color:#42607f;font-size:12px;margin-top:4px;font-weight:600}
.delta{font-size:12px;font-weight:700;vertical-align:middle}.delta.up{color:#2f9e5d}.delta.down{color:#d65a5a}.dt{color:#9fb0c4;font-size:10px;font-weight:600}
.hls,.hlt{color:#6f86aa}.hlrow{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:6px}
.hl{background:linear-gradient(135deg,#074069,#0a5688);color:#eaf3ff;border-radius:14px;padding:14px 16px}
.hlt{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#bcd4ea;font-weight:700}.hlv{font-size:22px;font-weight:800;color:#ffe6b8;margin-top:4px}.hls{font-size:12px;color:#cfe0f1;margin-top:3px}
h2{font-size:18px;color:#074069;margin:24px 4px 10px;padding-bottom:6px;border-bottom:2px solid #d7e3f0}
.card{background:#fff;border:1px solid #d7e3f0;border-radius:16px;padding:16px 18px;box-shadow:0 12px 28px rgba(7,64,105,.05);margin-bottom:14px}
.card h3{margin:0 0 10px;font-size:15px;color:#1f3550}
.chart{height:320px;width:100%}.chart.tall{height:360px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:14px}
.insights{background:linear-gradient(135deg,#fffdf7,#fff4dc);border:1px solid #ead4ab}
.insights ul{margin:6px 0 0;padding-left:18px;columns:2;column-gap:26px}.insights li{color:#5a4416;font-size:13px;line-height:1.6;margin-bottom:5px;break-inside:avoid}.insights h3{color:#8b6914}
.recos{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:12px}
.reco{display:flex;gap:12px;background:#fff;border:1px solid #d7e3f0;border-left:4px solid #d2ab67;border-radius:12px;padding:14px 16px;box-shadow:0 10px 24px rgba(7,64,105,.05)}
.ri{font-size:22px;line-height:1}.rt{font-weight:800;color:#1f3550;font-size:14px;margin-bottom:4px}.rd{color:#42607f;font-size:12.5px;line-height:1.55}.rd b{color:#1f3550}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th{background:#074069;color:#fff;padding:9px 11px;text-align:left;font-size:11.5px;position:sticky;top:0}
td{padding:7px 11px;border:1px solid #eef3f9}.r{text-align:right}.b{font-weight:700;color:#074069}.g{color:#2f7a4f}
.sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:8px}
.scroll{max-height:460px;overflow:auto}.noecharts{color:#8a9cb3;padding:24px;text-align:center;font-size:13px}
footer{color:#6f86aa;font-size:12px;text-align:center;margin-top:18px}
@media print{body{background:#fff}.topnav{position:static}.card,.kpi,header,.reco,.hl{box-shadow:none}}
</style></head><body>
<div class="topnav"><b>${esc(brand.company || "Mr. Milk")}</b><a href="#top">Overview</a><a href="#s-reco">Recommendations</a><a href="#s-trends">Trends</a><a href="#s-season">Seasonality</a>${A.hubs.length ? '<a href="#s-hubs">Hubs</a>' : ""}<a href="#s-quality">Quality &amp; Price</a><a href="#s-data">Data</a><button class="pr" onclick="window.print()">Print / PDF</button></div>
<div class="wrap"><a id="top"></a>
<header>
  <div class="eyebrow">${esc(brand.company || "Mr. Milk")}${brand.portal ? " • " + esc(brand.portal) : ""}</div>
  <h1>Daily Sales Dashboard — ${title}</h1>
  <div class="meta">${esc(fmtDay(meta.start))} to ${esc(fmtDay(meta.end))} ${hubBadge} <span class="badge">${meta.status === "delivered" ? "Delivered only" : "All statuses"}</span></div>
  <div class="lede">Sold <b>${n0(derived.totalUnits)} litres</b> for <b>${inrShort(derived.totalRevenue)}</b> — about <b>${n0(summary.avg_units_per_day)} litres a day</b> across <b>${n0(summary.active_days)}</b> selling days, trending <b>${A.monthlyTrendPct >= 0 ? "+" : ""}${A.monthlyTrendPct.toFixed(1)}%/month</b>.</div>
</header>
<div class="kpis">${kpiHtml}</div>
<div class="hlrow">${hlHtml}</div>
<h2 id="s-reco">Data-driven recommendations</h2>
<div class="recos">${recHtml}</div>
<div class="card insights" style="margin-top:14px"><h3>Key insights</h3><ul>${insightsHtml}</ul></div>
<h2 id="s-trends">Trends</h2>
<div class="card"><h3>Daily litres — with 7-day &amp; 30-day moving averages</h3><div id="trend" class="chart tall"></div></div>
<div class="grid2"><div class="card"><h3>Monthly litres &amp; month-on-month growth</h3><div id="monthly" class="chart"></div></div><div class="card"><h3>Cumulative revenue</h3><div id="cumrev" class="chart"></div></div></div>
<h2 id="s-season">Seasonality &amp; rhythm</h2>
<div class="grid2"><div class="card"><h3>Monthly seasonality index (100 = average day)</h3><div id="season" class="chart"></div></div><div class="card"><h3>Average litres by weekday</h3><div id="weekday" class="chart"></div></div></div>
<div class="card"><h3>How daily volume is distributed</h3><div id="hist" class="chart"></div></div>
${hubSection}
<h2 id="s-quality">Quality &amp; price</h2>
<div class="grid2"><div class="card"><h3>Customers per selling day (monthly)</h3><div id="cust" class="chart"></div></div><div class="card"><h3>Realised price per litre (monthly)</h3><div id="price" class="chart"></div></div></div>
<h2 id="s-data">Data tables</h2>
<div class="card"><h3>Monthly summary</h3><div class="scroll"><table><thead><tr><th>Month</th><th class="r">Litres</th><th class="r">Revenue</th><th class="r">Avg/day</th><th class="r">Season idx</th><th class="r">MoM</th></tr></thead><tbody>${monthRows}</tbody></table></div></div>
<div class="card"><h3>Day-by-day detail (${n0(days.length)} days)</h3><div class="scroll"><table><thead><tr><th>Date</th><th class="r">Litres (net)</th><th class="r">Delivered</th><th class="r">Revenue</th><th class="r">Deliveries</th><th class="r">Customers</th></tr></thead><tbody>${dailyRows}</tbody></table></div></div>
<footer>Generated ${esc(new Date().toLocaleString("en-IN"))} • Mr. Milk AI OS • Every number is computed live from the sales dataset. Recommendations are derived only from the figures shown above.</footer>
</div>
<script>
var DATA=${dataJson};
function boot(){
  var charts=[];
  if(!window.echarts){var els=document.querySelectorAll('.chart');for(var i=0;i<els.length;i++){els[i].innerHTML='<div class="noecharts">Charts need an internet connection to load (ECharts CDN). All numbers, insights and tables are fully offline.</div>';}return;}
  function money(v){return v>=1e7?'₹'+(v/1e7).toFixed(1)+'Cr':v>=1e5?'₹'+(v/1e5).toFixed(1)+'L':'₹'+v;}
  function mk(id,opt){var el=document.getElementById(id);if(!el)return;var c=echarts.init(el);c.setOption(opt);charts.push(c);}
  var ax={color:'#6f86aa'},sl={lineStyle:{color:'#eef3f9'}};
  mk('trend',{tooltip:{trigger:'axis'},legend:{data:['Litres','7-day avg','30-day avg'],top:0,textStyle:ax},grid:{left:62,right:16,top:30,bottom:66},xAxis:{type:'category',data:DATA.dates,axisLabel:{color:'#6f86aa',fontSize:10,formatter:function(v){return v.slice(5);}}},yAxis:{type:'value',axisLabel:ax,splitLine:sl},dataZoom:[{type:'inside'},{type:'slider',height:16,bottom:18}],series:[{name:'Litres',type:'bar',data:DATA.dailyUnits,itemStyle:{color:'#bcd4ea'}},{name:'7-day avg',type:'line',smooth:true,symbol:'none',data:DATA.ma7,lineStyle:{color:'#0a5688',width:2}},{name:'30-day avg',type:'line',smooth:true,symbol:'none',data:DATA.ma30,lineStyle:{color:'#d2ab67',width:2.5}}]});
  mk('monthly',{tooltip:{trigger:'axis'},legend:{data:['Litres','MoM %'],top:0,textStyle:ax},grid:{left:62,right:48,top:30,bottom:54},xAxis:{type:'category',data:DATA.months,axisLabel:{color:'#6f86aa',rotate:30,fontSize:11}},yAxis:[{type:'value',axisLabel:ax,splitLine:sl},{type:'value',axisLabel:{color:'#6f86aa',formatter:'{value}%'},splitLine:{show:false}}],series:[{name:'Litres',type:'bar',data:DATA.monthlyUnits,itemStyle:{color:'#074069'},barMaxWidth:40},{name:'MoM %',type:'line',yAxisIndex:1,connectNulls:true,data:DATA.momGrowth,lineStyle:{color:'#d2ab67',width:2},symbolSize:6,itemStyle:{color:'#d2ab67'}}]});
  mk('cumrev',{tooltip:{trigger:'axis',valueFormatter:function(v){return money(v);}},grid:{left:64,right:16,top:18,bottom:54},xAxis:{type:'category',data:DATA.dates,axisLabel:{color:'#6f86aa',fontSize:10,formatter:function(v){return v.slice(0,7);}}},yAxis:{type:'value',axisLabel:{color:'#6f86aa',formatter:money},splitLine:sl},series:[{type:'line',data:DATA.cumRevenue,smooth:true,symbol:'none',lineStyle:{color:'#2f7a4f',width:2},areaStyle:{color:'rgba(47,122,79,.15)'}}]});
  mk('season',{tooltip:{trigger:'axis'},grid:{left:50,right:16,top:18,bottom:54},xAxis:{type:'category',data:DATA.months,axisLabel:{color:'#6f86aa',rotate:30,fontSize:11}},yAxis:{type:'value',axisLabel:ax,splitLine:sl},series:[{type:'bar',data:DATA.seasonalityIndex,barMaxWidth:40,itemStyle:{color:'#0a5688'},markLine:{silent:true,symbol:'none',data:[{yAxis:100}],lineStyle:{color:'#d2ab67',type:'dashed'},label:{formatter:'avg = 100',color:'#a07b2d'}}}]});
  mk('weekday',{tooltip:{trigger:'axis'},grid:{left:60,right:16,top:18,bottom:38},xAxis:{type:'category',data:DATA.wkDays,axisLabel:ax},yAxis:{type:'value',axisLabel:ax,splitLine:sl},series:[{type:'bar',data:DATA.wkAvg,itemStyle:{color:'#2f7a4f'},barMaxWidth:38}]});
  mk('hist',{tooltip:{trigger:'axis',formatter:function(p){return 'around '+p[0].axisValue+' L/day<br/>'+p[0].data+' days';}},grid:{left:50,right:16,top:18,bottom:44},xAxis:{type:'category',data:DATA.histBins,axisLabel:{color:'#6f86aa',fontSize:10}},yAxis:{type:'value',name:'days',axisLabel:ax,splitLine:sl},series:[{type:'bar',data:DATA.histCounts,itemStyle:{color:'#6b6f9c'}}]});
  if(DATA.hubNames.length){
    mk('hubpie',{tooltip:{trigger:'item',formatter:'{b}: {c} L ({d}%)'},legend:{bottom:0,textStyle:ax},series:[{type:'pie',radius:['42%','68%'],center:['50%','44%'],data:DATA.hubNames.map(function(n,i){return {name:n,value:DATA.hubUnits[i],itemStyle:{color:DATA.hubColors[i]}};}),label:{formatter:'{d}%'}}]});
    mk('hubstack',{tooltip:{trigger:'axis'},legend:{top:0,textStyle:ax},grid:{left:62,right:16,top:30,bottom:54},xAxis:{type:'category',data:DATA.months,axisLabel:{color:'#6f86aa',rotate:30,fontSize:11}},yAxis:{type:'value',axisLabel:ax,splitLine:sl},series:DATA.hubNames.map(function(nm,i){return {name:nm,type:'bar',stack:'h',data:DATA.hubMonthly[nm],itemStyle:{color:DATA.hubColors[i]}};})});
  }
  mk('cust',{tooltip:{trigger:'axis'},grid:{left:54,right:16,top:18,bottom:54},xAxis:{type:'category',data:DATA.months,axisLabel:{color:'#6f86aa',rotate:30,fontSize:11}},yAxis:{type:'value',axisLabel:ax,splitLine:sl},series:[{type:'line',data:DATA.monthlyCustAvg,smooth:true,symbol:'circle',symbolSize:6,lineStyle:{color:'#0a5688',width:2.5},itemStyle:{color:'#0a5688'},areaStyle:{color:'rgba(10,86,136,.10)'}}]});
  mk('price',{tooltip:{trigger:'axis',valueFormatter:function(v){return '₹'+v;}},grid:{left:54,right:16,top:18,bottom:54},xAxis:{type:'category',data:DATA.months,axisLabel:{color:'#6f86aa',rotate:30,fontSize:11}},yAxis:{type:'value',scale:true,axisLabel:{color:'#6f86aa',formatter:'₹{value}'},splitLine:sl},series:[{type:'line',data:DATA.monthlyPriceAvg,smooth:true,symbol:'circle',symbolSize:6,lineStyle:{color:'#d2ab67',width:2.5},itemStyle:{color:'#d2ab67'}}]});
  window.addEventListener('resize',function(){for(var i=0;i<charts.length;i++)charts[i].resize();});
}
if(document.readyState!=='loading')boot();else document.addEventListener('DOMContentLoaded',boot);
</script></body></html>`;
}

const CARD = { background: "#ffffff", border: "1px solid #d7e3f0", borderRadius: 16, padding: "16px 18px", boxShadow: "0 16px 34px rgba(7,64,105,0.05)" };
const LABEL = { color: "#6f86aa", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 };
const INPUT = { background: "#ffffff", border: "1px solid #c7d9ea", borderRadius: 10, color: "#1f3550", padding: "9px 11px", fontSize: 13, fontFamily: "inherit", width: "100%" };
const HELP = { color: "#8a9cb3", fontSize: 11.5, marginTop: 4, lineHeight: 1.5 };

function StatCard({ label, value, sub, accent = "#074069", help }) {
  return (
    <div style={CARD}>
      <div style={LABEL}>{label}</div>
      <div style={{ color: accent, fontSize: 23, fontWeight: 800, lineHeight: 1.1, fontFamily: "'Montserrat', sans-serif" }}>{value}</div>
      {sub ? <div style={{ color: "#42607f", fontSize: 12, marginTop: 5, fontWeight: 600 }}>{sub}</div> : null}
      {help ? <div style={HELP}>{help}</div> : null}
    </div>
  );
}

function Pill({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: active ? "#074069" : "#ffffff", color: active ? "#ffffff" : "#4d5b78",
      border: "1px solid #c7d9ea", borderRadius: 8, padding: "6px 12px", cursor: "pointer",
      fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
    }}>{children}</button>
  );
}

export default function DailyProductSales() {
  const [products, setProducts] = useState([]);
  const [dataset, setDataset] = useState(null);
  const [productsErr, setProductsErr] = useState("");
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [product, setProduct] = useState(DEFAULT_PRODUCT);
  const [weight, setWeight] = useState("1 litre");
  const [hub, setHub] = useState(""); // "" = all hubs
  const [start, setStart] = useState(DEFAULT_START);
  const [end, setEnd] = useState(DEFAULT_END);
  const [status, setStatus] = useState("delivered");

  const [granularity, setGranularity] = useState("daily"); // 'daily' | 'monthly'
  const [metric, setMetric] = useState("units"); // 'units' | 'revenue'
  const [splitByHub, setSplitByHub] = useState(false);
  const [showDaily, setShowDaily] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [hubData, setHubData] = useState(null);

  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const reqId = useRef(0);

  // ---- load the product catalog once -----------------------------------
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setLoadingProducts(true);
      setProductsErr("");
      try {
        const payload = await fetchSalesProducts(controller.signal);
        const list = payload?.products || [];
        setProducts(list);
        setDataset(payload?.dataset || null);
        const match = list.find((p) => p.product_name === DEFAULT_PRODUCT) || list[0];
        if (match) {
          setProduct(match.product_name);
          const w = match.weights.find((x) => is1Litre(x.weight)) || match.weights.find((x) => x.weight === "1 litre") || match.weights[0];
          setWeight(w ? w.weight : "");
        }
      } catch (err) {
        if (err?.name !== "AbortError") setProductsErr(err?.message || "Could not load products.");
      } finally {
        setLoadingProducts(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const weights = useMemo(() => {
    const p = products.find((x) => x.product_name === product);
    return p ? p.weights : [];
  }, [products, product]);

  // ---- fetch the daily series whenever the query changes ---------------
  useEffect(() => {
    if (!product) return;
    const controller = new AbortController();
    const myId = ++reqId.current;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const payload = await fetchDailyProductSales({ product, weight, hub, start, end, status }, controller.signal);
        if (myId === reqId.current) setSeries(payload);
      } catch (err) {
        if (err?.name !== "AbortError" && myId === reqId.current) {
          setError(err?.message || "Could not load daily sales.");
          setSeries(null);
        }
      } finally {
        if (myId === reqId.current) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [product, weight, hub, start, end, status]);

  // ---- per-hub breakdown (independent of the single-hub filter) ---------
  useEffect(() => {
    if (!product) return;
    const controller = new AbortController();
    (async () => {
      try {
        const payload = await fetchSalesByHub({ product, weight, start, end, status }, controller.signal);
        setHubData(payload);
      } catch (err) {
        if (err?.name !== "AbortError") setHubData(null);
      }
    })();
    return () => controller.abort();
  }, [product, weight, start, end, status]);

  const days = series?.days || [];
  const summary = series?.summary || null;

  // ---- derived analytics (all client-side, from `days`) ----------------
  const derived = useMemo(() => {
    if (!days.length) return null;
    const totalUnits = days.reduce((a, d) => a + d.units, 0);
    const totalDelivered = days.reduce((a, d) => a + d.delivered, 0);
    const totalRevenue = days.reduce((a, d) => a + d.revenue, 0);
    const totalCustDays = days.reduce((a, d) => a + d.customers, 0);
    const active = days.filter((d) => d.lines > 0);
    const sellingDays = active.length;
    const avgPrice = totalUnits ? totalRevenue / totalUnits : 0;
    const spoilage = totalDelivered - totalUnits; // disputed + curdled units
    const best = days.reduce((m, d) => (d.units > (m?.units ?? -1) ? d : m), null);
    const worst = active.reduce((m, d) => (m === null || d.units < m.units ? d : m), null);
    const avgCust = sellingDays ? Math.round(totalCustDays / sellingDays) : 0;

    // monthly rollup
    const mMap = new Map();
    for (const d of days) {
      const ym = d.date.slice(0, 7);
      const e = mMap.get(ym) || { ym, units: 0, revenue: 0, delivered: 0, lines: 0, days: 0, active: 0 };
      e.units += d.units; e.revenue += d.revenue; e.delivered += d.delivered; e.lines += d.lines;
      e.days += 1; if (d.lines > 0) e.active += 1;
      mMap.set(ym, e);
    }
    const monthly = [...mMap.values()];
    const maxMonthUnits = Math.max(...monthly.map((m) => m.units), 1);

    // weekday averages (Mon..Sun)
    const order = [1, 2, 3, 4, 5, 6, 0];
    const wkNames = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };
    const wkAcc = {};
    for (const d of days) {
      const wd = new Date(d.date + "T00:00:00").getDay();
      const a = wkAcc[wd] || { sum: 0, count: 0 };
      a.sum += d.units; a.count += 1; wkAcc[wd] = a;
    }
    const weekday = order.map((wd) => ({ day: wkNames[wd], avg: wkAcc[wd] ? wkAcc[wd].sum / wkAcc[wd].count : 0 }));
    const maxWk = Math.max(...weekday.map((w) => w.avg), 1);

    return { totalUnits, totalDelivered, totalRevenue, sellingDays, avgPrice, spoilage, best, worst, avgCust, monthly, maxMonthUnits, weekday, maxWk };
  }, [days]);

  // ---- per-hub stacked series (litres) for the "split by hub" view ------
  const hubSeries = useMemo(() => {
    if (!hubData || !hubData.hubs?.length || !hubData.dates?.length) return null;
    const hubNames = hubData.hubs.map((h) => h.hub);
    if (granularity === "monthly") {
      const months = [];
      const idxByMonth = new Map();
      hubData.dates.forEach((d) => {
        const ym = d.slice(0, 7);
        if (!idxByMonth.has(ym)) { idxByMonth.set(ym, months.length); months.push(ym); }
      });
      const series = hubNames.map((h, hi) => {
        const arr = new Array(months.length).fill(0);
        const u = hubData.units_by_hub[h] || [];
        hubData.dates.forEach((d, i) => { arr[idxByMonth.get(d.slice(0, 7))] += u[i] || 0; });
        return { name: h, data: arr.map((v) => Math.round(v)), color: HUB_COLORS[hi % HUB_COLORS.length] };
      });
      return { categories: months.map(fmtMonth), series };
    }
    const series = hubNames.map((h, hi) => ({
      name: h, data: (hubData.units_by_hub[h] || []).map((v) => Math.round(v)), color: HUB_COLORS[hi % HUB_COLORS.length],
    }));
    return { categories: hubData.dates, series };
  }, [hubData, granularity]);

  // ---- main trend chart ------------------------------------------------
  const chartOption = useMemo(() => {
    const isRevenue = metric === "revenue";

    // Split-by-hub: stacked bars, litres only (revenue split isn't fetched per day).
    if (splitByHub && hubSeries) {
      return {
        grid: { left: 60, right: 18, top: 30, bottom: granularity === "daily" ? 70 : 56 },
        legend: { data: hubSeries.series.map((s) => s.name), top: 0, textStyle: { color: "#6f86aa", fontSize: 11 } },
        tooltip: { trigger: "axis", valueFormatter: (v) => `${n0(v)} L` },
        xAxis: { type: "category", data: hubSeries.categories, axisLabel: { color: "#6f86aa", fontSize: 10, rotate: granularity === "monthly" ? 30 : 0, formatter: granularity === "daily" ? (v) => fmtDay(v).slice(0, 6) : undefined }, axisLine: { lineStyle: { color: "#c7d9ea" } } },
        yAxis: { type: "value", axisLabel: { color: "#6f86aa", fontSize: 10, formatter: (v) => n0(v) }, splitLine: { lineStyle: { color: "#eef3f9" } } },
        dataZoom: granularity === "daily" ? [{ type: "inside", start: 0, end: 100 }, { type: "slider", height: 16, bottom: 22, borderColor: "#c7d9ea", fillerColor: "rgba(210,171,103,0.18)" }] : undefined,
        series: hubSeries.series.map((s) => ({ name: s.name, type: "bar", stack: "hub", data: s.data, itemStyle: { color: s.color }, barMaxWidth: granularity === "monthly" ? 46 : undefined })),
      };
    }
    if (granularity === "monthly" && derived) {
      const cats = derived.monthly.map((m) => fmtMonth(m.ym));
      const vals = derived.monthly.map((m) => (isRevenue ? m.revenue : m.units));
      return {
        grid: { left: 64, right: 18, top: 20, bottom: 56 },
        tooltip: {
          trigger: "axis",
          formatter: (ps) => {
            const m = derived.monthly[ps[0].dataIndex];
            return `<b>${fmtMonth(m.ym)}</b><br/>Litres: ${n0(m.units)}<br/>Revenue: ${inrFull(m.revenue)}<br/>${n0(m.active)} selling days`;
          },
        },
        xAxis: { type: "category", data: cats, axisLabel: { color: "#6f86aa", fontSize: 11, rotate: 30 }, axisLine: { lineStyle: { color: "#c7d9ea" } } },
        yAxis: { type: "value", axisLabel: { color: "#6f86aa", fontSize: 10, formatter: (v) => (isRevenue ? inrShort(v) : n0(v)) }, splitLine: { lineStyle: { color: "#eef3f9" } } },
        series: [{ type: "bar", data: vals, itemStyle: { color: isRevenue ? "#2f7a4f" : "#074069", borderRadius: [4, 4, 0, 0] }, barMaxWidth: 46 }],
      };
    }
    // daily
    const dates = days.map((d) => d.date);
    const values = days.map((d) => (isRevenue ? d.revenue : d.units));
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const ma = values.map((_, i) => {
      const s = Math.max(0, i - 6);
      const w = values.slice(s, i + 1);
      return w.reduce((a, b) => a + b, 0) / w.length;
    });
    return {
      grid: { left: 58, right: 18, top: 30, bottom: 70 },
      legend: { data: [isRevenue ? "Revenue" : "Litres", "7-day avg"], right: 10, top: 0, textStyle: { color: "#6f86aa", fontSize: 11 } },
      tooltip: {
        trigger: "axis",
        formatter: (ps) => {
          const d = days[ps[0].dataIndex] || {};
          return `<b>${fmtDay(d.date)}</b><br/>Litres: ${n0(d.units)}<br/>Revenue: ${inrFull(d.revenue)}<br/>${n0(d.customers)} customers · ${n0(d.lines)} deliveries`;
        },
      },
      xAxis: { type: "category", data: dates, axisLabel: { color: "#6f86aa", fontSize: 10, formatter: (v) => fmtDay(v).slice(0, 6) }, axisLine: { lineStyle: { color: "#c7d9ea" } } },
      yAxis: { type: "value", axisLabel: { color: "#6f86aa", fontSize: 10, formatter: (v) => (isRevenue ? inrShort(v) : n0(v)) }, splitLine: { lineStyle: { color: "#eef3f9" } } },
      dataZoom: [{ type: "inside", start: 0, end: 100 }, { type: "slider", height: 16, bottom: 22, borderColor: "#c7d9ea", fillerColor: "rgba(210,171,103,0.18)" }],
      series: [
        {
          name: isRevenue ? "Revenue" : "Litres", type: "bar", data: values,
          itemStyle: { color: isRevenue ? "#9ccdb4" : "#aac6dc", borderRadius: [2, 2, 0, 0] },
          markLine: { silent: true, symbol: "none", data: [{ yAxis: avg }], lineStyle: { color: "#d2ab67", type: "dashed", width: 1.5 }, label: { formatter: `avg ${isRevenue ? inrShort(avg) : n0(avg)}`, color: "#a07b2d", fontSize: 10 } },
        },
        { name: "7-day avg", type: "line", data: ma, smooth: true, symbol: "none", lineStyle: { color: isRevenue ? "#2f7a4f" : "#074069", width: 2.5 } },
      ],
    };
  }, [days, derived, metric, granularity, splitByHub, hubSeries]);

  const insights = useMemo(
    () => (derived && summary && series ? buildInsights(days, derived, summary, { product, weight, start: series.start, end: series.end, status }) : []),
    [days, derived, summary, series, product, weight, status],
  );

  const fileStem = () =>
    `MrMilk_DailySales_${product}_${weight || "all"}_${series?.start || start}_to_${series?.end || end}`.replace(/[^a-z0-9_-]+/gi, "-");

  // ---- production-grade Excel report (Overview + Insights + Daily + Monthly + Weekday)
  const exportWorkbook = async () => {
    if (!days.length || !derived || !summary || !series || exporting) return;
    setExporting(true);
    // Pull the tidy per-(date,hub) records so the Daily sheet is filterable by hub.
    let hubRecords = [];
    try {
      const dbh = await fetchSalesDailyByHub({ product, weight, start: series.start, end: series.end, status });
      hubRecords = (dbh?.records || []).filter((r) => !hub || r.hub === hub);
    } catch { /* fall back to the rolled-up daily series below */ }
    try {
      buildAndSaveWorkbook(hubRecords);
    } finally {
      setExporting(false);
    }
  };

  const buildAndSaveWorkbook = (hubRecords) => {
    const meta = { product, weight, hub, start: series.start, end: series.end, status };
    const brand = CONFIG?.BRAND || {};
    const wb = XLSX.utils.book_new();
    wb.Props = { Title: `Daily Product Sales — ${product}`, Author: brand.name || "Mr. Milk AI", CreatedDate: new Date() };

    const spoilRate = derived.totalDelivered ? (derived.spoilage / derived.totalDelivered) * 100 : 0;

    // -- Overview --
    const ov = [
      [`${brand.company || "Mr. Milk"} — Daily Product Sales Report`],
      [[brand.name, brand.portal].filter(Boolean).join("  •  ")],
      [],
      ["Product", meta.product],
      ["Pack / weight", meta.weight || "All weights"],
      ["Hub", meta.hub || "All hubs"],
      ["Date range", `${fmtDay(meta.start)} to ${fmtDay(meta.end)}`],
      ["Counts as sold", meta.status === "delivered" ? "Delivered only" : "All (incl. cancelled / pending)"],
      ["Generated", new Date().toLocaleString("en-IN")],
      [],
      ["KEY METRICS", ""],
      ["Total litres sold (net)", derived.totalUnits],
      ["Total revenue (₹)", derived.totalRevenue],
      ["Avg price per litre (₹)", Number(derived.avgPrice.toFixed(2))],
      ["Litres delivered (gross)", derived.totalDelivered],
      ["Disputed / spoilt litres", derived.spoilage],
      ["Spoilage rate (%)", Number(spoilRate.toFixed(2))],
      ["Calendar days", summary.days_in_range],
      ["Selling days", summary.active_days],
      ["Avg litres / day", summary.avg_units_per_day],
      ["Avg revenue / day (₹)", Number((derived.totalRevenue / Math.max(summary.days_in_range, 1)).toFixed(0))],
      ["Avg customers / selling day", derived.avgCust],
      ["Busiest day", derived.best ? `${fmtDay(derived.best.date)} (${n0(derived.best.units)} L)` : "—"],
      ["Quietest selling day", derived.worst ? `${fmtDay(derived.worst.date)} (${n0(derived.worst.units)} L)` : "—"],
      [],
      ["TOP INSIGHTS", ""],
      ...insights.map((s, i) => [`${i + 1}.`, s]),
    ];
    const wsOv = XLSX.utils.aoa_to_sheet(ov);
    wsOv["!cols"] = [{ wch: 28 }, { wch: 88 }];
    XLSX.utils.book_append_sheet(wb, wsOv, "Overview");

    // -- Daily -- tidy long format: one row per (date, hub) so the Hub column
    // can be filtered inside Excel. Falls back to the rolled-up series if the
    // per-hub records weren't available.
    const dHeader = ["Date", "Weekday", "Hub", "Litres (net)", "Delivered", "Disputed/Spoilt", "Revenue (₹)", "Avg ₹/L", "Deliveries", "Customers", "Litres/Customer"];
    let dRows;
    if (hubRecords && hubRecords.length) {
      dRows = hubRecords.map((r) => {
        const dt = new Date(r.date + "T00:00:00");
        return [
          dt, WK_FULL[dt.getDay()], r.hub, r.units, r.delivered,
          Number((r.delivered - r.units).toFixed(2)), r.revenue,
          r.units ? Number((r.revenue / r.units).toFixed(2)) : 0,
          r.lines, r.customers, r.customers ? Number((r.units / r.customers).toFixed(2)) : 0,
        ];
      });
    } else {
      const hubLabel = meta.hub || "All hubs";
      dRows = days.map((d) => {
        const dt = new Date(d.date + "T00:00:00");
        return [
          dt, WK_FULL[dt.getDay()], hubLabel, d.units, d.delivered,
          Number((d.delivered - d.units).toFixed(2)), d.revenue,
          d.units ? Number((d.revenue / d.units).toFixed(2)) : 0,
          d.lines, d.customers, d.customers ? Number((d.units / d.customers).toFixed(2)) : 0,
        ];
      });
    }
    const wsD = XLSX.utils.aoa_to_sheet([dHeader, ...dRows], { cellDates: true });
    wsD["!cols"] = [{ wch: 12 }, { wch: 11 }, { wch: 18 }, { wch: 12 }, { wch: 11 }, { wch: 15 }, { wch: 13 }, { wch: 9 }, { wch: 11 }, { wch: 11 }, { wch: 15 }];
    const lastD = dRows.length;
    setColFmt(wsD, 0, "dd-mmm-yyyy", 1, lastD);
    [3, 4, 5, 8, 9].forEach((c) => setColFmt(wsD, c, "#,##0", 1, lastD));
    setColFmt(wsD, 6, '"₹"#,##0', 1, lastD);
    setColFmt(wsD, 7, '"₹"#,##0.00', 1, lastD);
    setColFmt(wsD, 10, "0.00", 1, lastD);
    wsD["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastD, c: dHeader.length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, wsD, "Daily");

    // -- Daily x Hub -- (litres per hub per day, wide format for pivoting)
    if (hubData?.hubs?.length && hubData.dates?.length) {
      const hubNames = hubData.hubs.map((h) => h.hub);
      const dxHeader = ["Date", ...hubNames, "Total"];
      const dxRows = hubData.dates.map((iso, i) => {
        const cells = hubNames.map((h) => Number(((hubData.units_by_hub[h] || [])[i] || 0).toFixed(2)));
        const total = cells.reduce((a, b) => a + b, 0);
        return [new Date(iso + "T00:00:00"), ...cells, Number(total.toFixed(2))];
      });
      const wsDX = XLSX.utils.aoa_to_sheet([dxHeader, ...dxRows], { cellDates: true });
      wsDX["!cols"] = [{ wch: 12 }, ...hubNames.map(() => ({ wch: 16 })), { wch: 12 }];
      const lastDX = dxRows.length;
      setColFmt(wsDX, 0, "dd-mmm-yyyy", 1, lastDX);
      for (let c = 1; c < dxHeader.length; c++) setColFmt(wsDX, c, "#,##0", 1, lastDX);
      wsDX["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastDX, c: dxHeader.length - 1 } }) };
      XLSX.utils.book_append_sheet(wb, wsDX, "Daily x Hub");
    }

    // -- Monthly --
    const mHeader = ["Month", "Litres", "Revenue (₹)", "Selling days", "Avg litres/day", "Avg revenue/day (₹)", "Share of litres %", "MoM growth %"];
    const mRows = derived.monthly.map((m, i) => {
      const prev = derived.monthly[i - 1];
      const mom = prev && prev.units ? Number((((m.units - prev.units) / prev.units) * 100).toFixed(1)) : "";
      return [
        fmtMonth(m.ym), m.units, m.revenue, m.active,
        m.active ? Number((m.units / m.active).toFixed(0)) : 0,
        m.active ? Number((m.revenue / m.active).toFixed(0)) : 0,
        derived.totalUnits ? Number(((m.units / derived.totalUnits) * 100).toFixed(1)) : 0,
        mom,
      ];
    });
    const wsM = XLSX.utils.aoa_to_sheet([mHeader, ...mRows]);
    wsM["!cols"] = [{ wch: 12 }, { wch: 11 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 15 }, { wch: 13 }];
    const lastM = mRows.length;
    [1, 3, 4].forEach((c) => setColFmt(wsM, c, "#,##0", 1, lastM));
    setColFmt(wsM, 2, '"₹"#,##0', 1, lastM);
    setColFmt(wsM, 5, '"₹"#,##0', 1, lastM);
    setColFmt(wsM, 6, "0.0", 1, lastM);
    setColFmt(wsM, 7, '"+"0.0;"-"0.0', 1, lastM);
    XLSX.utils.book_append_sheet(wb, wsM, "Monthly");

    // -- Weekday --
    const overallAvg = days.length ? derived.totalUnits / days.length : 0;
    const wHeader = ["Weekday", "Avg litres/day", "Index (100 = overall avg)"];
    const wRows = derived.weekday.map((w) => [w.day, Number(w.avg.toFixed(0)), overallAvg ? Number(((w.avg / overallAvg) * 100).toFixed(0)) : 0]);
    const wsW = XLSX.utils.aoa_to_sheet([wHeader, ...wRows]);
    wsW["!cols"] = [{ wch: 10 }, { wch: 16 }, { wch: 26 }];
    setColFmt(wsW, 1, "#,##0", 1, wRows.length);
    setColFmt(wsW, 2, "0", 1, wRows.length);
    XLSX.utils.book_append_sheet(wb, wsW, "Weekday");

    // -- By Hub (only when the breakdown is available; reflects all hubs) --
    if (hubData?.hubs?.length) {
      const hHeader = ["Hub", "Litres", "Revenue (₹)", "Share litres %", "Share revenue %", "Avg litres/day", "Selling days", "Customers", "Disputed/Spoilt"];
      const hRows = hubData.hubs.map((h) => [
        h.hub, h.units, h.revenue, h.share_units, h.share_revenue, h.avg_units_per_day, h.selling_days, h.customers,
        Number((h.delivered - h.units).toFixed(2)),
      ]);
      const wsH = XLSX.utils.aoa_to_sheet([hHeader, ...hRows]);
      wsH["!cols"] = [{ wch: 22 }, { wch: 11 }, { wch: 14 }, { wch: 14 }, { wch: 15 }, { wch: 14 }, { wch: 12 }, { wch: 11 }, { wch: 15 }];
      const lastH = hRows.length;
      [1, 5, 6, 7, 8].forEach((c) => setColFmt(wsH, c, "#,##0", 1, lastH));
      setColFmt(wsH, 2, '"₹"#,##0', 1, lastH);
      setColFmt(wsH, 3, "0.0", 1, lastH);
      setColFmt(wsH, 4, "0.0", 1, lastH);
      XLSX.utils.book_append_sheet(wb, wsH, "By Hub");
    }

    XLSX.writeFile(wb, `${fileStem()}.xlsx`);
  };

  // ---- interactive HTML dashboard (charts + KPIs + tables) -------------
  const exportDashboard = () => {
    if (!days.length || !derived || !summary || !series) return;
    const html = buildDashboardHtml({
      meta: { product, weight, hub, start: series.start, end: series.end, status },
      brand: CONFIG?.BRAND || {},
      summary, derived, days, hubData, insights,
    });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileStem()}_dashboard.html`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  // ---- raw CSV (the daily grid only) -----------------------------------
  const exportCsv = () => {
    if (!days.length) return;
    const header = ["date", "weekday", "litres_net", "qty_delivered", "disputed_spoilt", "revenue_inr", "avg_price_per_litre", "deliveries", "customers"];
    const rows = days.map((d) => {
      const dt = new Date(d.date + "T00:00:00");
      return [d.date, WK_FULL[dt.getDay()], d.units, d.delivered, +(d.delivered - d.units).toFixed(2), d.revenue, d.units ? +(d.revenue / d.units).toFixed(2) : 0, d.lines, d.customers];
    });
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileStem()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  // ---- quick range presets ---------------------------------------------
  const applyPreset = (kind) => {
    if (kind === "fy25") { setStart("2025-04-01"); setEnd("2026-03-31"); return; }
    if (!dataset?.date_max) return;
    const max = dataset.date_max;
    if (kind === "all") { setStart(dataset.date_min); setEnd(max); return; }
    const back = (n) => {
      const d = new Date(max + "T00:00:00"); d.setDate(d.getDate() - (n - 1));
      return d.toISOString().slice(0, 10);
    };
    if (kind === "30") { setStart(back(30)); setEnd(max); }
    if (kind === "90") { setStart(back(90)); setEnd(max); }
  };

  const coverageWarn = dataset?.date_min && (start < dataset.date_min || end > dataset.date_max);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Header + plain-English headline */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "#d2ab67", fontSize: 19, fontWeight: 800, fontFamily: "'Montserrat', sans-serif" }}>Daily Product Sales</div>
            <div style={{ color: "#6f86aa", fontSize: 12.5, marginTop: 3 }}>Pick a product, pack size and dates to see exactly how much sold each day.</div>
          </div>
          {dataset ? (
            <div style={{ fontSize: 11.5, color: "#5f7898", textAlign: "right" }}>
              Live data: <strong style={{ color: "#1f3550" }}>{n0(dataset.row_count)}</strong> rows · {dataset.date_min} → {dataset.date_max}
            </div>
          ) : null}
        </div>
        {summary && derived ? (
          <div style={{ marginTop: 10, background: "linear-gradient(135deg,#074069,#0a5688)", borderRadius: 14, padding: "14px 18px", color: "#eaf3ff", fontSize: 14.5, lineHeight: 1.6 }}>
            Between <b>{fmtDay(series.start)}</b> and <b>{fmtDay(series.end)}</b>, <b style={{ color: "#ffe6b8" }}>{product}{weight ? ` (${weight})` : ""}{hub ? ` · ${hub}` : ""}</b> sold{" "}
            <b style={{ color: "#ffe6b8" }}>{n0(derived.totalUnits)} litres</b> for <b style={{ color: "#ffe6b8" }}>{inrShort(derived.totalRevenue)}</b> —
            about <b>{n0(summary.avg_units_per_day)} litres a day</b> across <b>{n0(summary.active_days)}</b> selling days.
          </div>
        ) : null}
      </div>

      {/* Controls */}
      <div style={CARD}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, alignItems: "end" }}>
          <div>
            <div style={LABEL}>Product</div>
            <select style={INPUT} value={product} disabled={loadingProducts} onChange={(e) => {
              const next = e.target.value; setProduct(next); setHub("");
              const p = products.find((x) => x.product_name === next);
              const w = p?.weights.find((x) => is1Litre(x.weight)) || p?.weights[0];
              setWeight(w ? w.weight : "");
            }}>
              {loadingProducts ? <option>Loading…</option> : null}
              {products.map((p) => <option key={p.product_name} value={p.product_name}>{p.product_name} ({n0(p.total_rows)})</option>)}
            </select>
          </div>
          <div>
            <div style={LABEL}>Pack / weight</div>
            <select style={INPUT} value={weight} onChange={(e) => setWeight(e.target.value)}>
              <option value="">All weights</option>
              {weights.map((w) => <option key={w.weight || "_blank"} value={w.weight}>{w.weight || "(blank)"} · {n0(w.rows)} rows</option>)}
            </select>
          </div>
          <div>
            <div style={LABEL}>Hub</div>
            <select style={INPUT} value={hub} onChange={(e) => setHub(e.target.value)}>
              <option value="">All hubs</option>
              {(hubData?.hubs || []).map((h) => <option key={h.hub} value={h.hub}>{h.hub} · {n0(h.units)} L</option>)}
            </select>
          </div>
          <div>
            <div style={LABEL}>From</div>
            <input style={INPUT} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <div style={LABEL}>To</div>
            <input style={INPUT} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div>
            <div style={LABEL}>Counts as sold</div>
            <select style={INPUT} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="delivered">Delivered only</option>
              <option value="all">All (incl. cancelled/pending)</option>
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
          <span style={{ ...LABEL, margin: 0 }}>Quick range</span>
          <Pill onClick={() => applyPreset("fy25")} active={start === "2025-04-01" && end === "2026-03-31"}>FY 2025-26</Pill>
          <Pill onClick={() => applyPreset("30")}>Last 30 days</Pill>
          <Pill onClick={() => applyPreset("90")}>Last 90 days</Pill>
          <Pill onClick={() => applyPreset("all")}>All data</Pill>
        </div>
        {coverageWarn ? (
          <div style={{ marginTop: 10, fontSize: 11.5, color: "#97753a", background: "#fff5e6", border: "1px solid #ead4ab", borderRadius: 8, padding: "7px 10px" }}>
            Your dates go beyond the loaded data ({dataset.date_min} → {dataset.date_max}). Days outside that range show as zero.
          </div>
        ) : null}
        {productsErr ? <div style={{ marginTop: 10, fontSize: 12, color: "#b94a4a" }}>{productsErr}</div> : null}
      </div>

      {loading ? (
        <div style={{ ...CARD, height: 160, display: "grid", placeItems: "center", color: "#4499ff", fontWeight: 700 }}>Loading sales…</div>
      ) : error ? (
        <div style={{ ...CARD, height: 160, display: "grid", placeItems: "center", color: "#b94a4a", fontWeight: 700 }}>{error}</div>
      ) : !derived ? (
        <div style={{ ...CARD, height: 160, display: "grid", placeItems: "center", color: "#6f86aa" }}>No sales for this selection.</div>
      ) : (
        <>
          {/* Headline stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
            <StatCard label="Litres sold" value={n0(derived.totalUnits)} sub={`${n0(summary.total_lines)} deliveries`} help="Clean litres after removing disputed / spoilt bottles." />
            <StatCard label="Revenue" value={inrShort(derived.totalRevenue)} accent="#2f7a4f" sub={`≈ ${inrFull(derived.avgPrice)} / litre`} help="Total line-item revenue in this window." />
            <StatCard label="Average per day" value={`${n0(summary.avg_units_per_day)} L`} accent="#d2ab67" sub={`${inrShort(derived.totalRevenue / Math.max(summary.days_in_range, 1))} / day`} help={`Over ${n0(summary.days_in_range)} calendar days.`} />
            <StatCard label="Busiest day" value={derived.best ? `${n0(derived.best.units)} L` : "—"} sub={derived.best ? fmtDay(derived.best.date) : ""} help="Single highest-selling day." />
            <StatCard label="Quietest selling day" value={derived.worst ? `${n0(derived.worst.units)} L` : "—"} sub={derived.worst ? fmtDay(derived.worst.date) : ""} help="Lowest day that still had sales." />
            <StatCard label="Customers / day" value={n0(derived.avgCust)} accent="#0a5688" sub={`${n0(derived.spoilage)} L disputed/spoilt`} help="Avg buyers per selling day. Spoilage = delivered minus clean litres." />
          </div>

          {/* Key insights */}
          {insights.length ? (
            <div style={{ ...CARD, background: "linear-gradient(135deg,#fffdf7,#fff4dc)", border: "1px solid #ead4ab" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <div style={{ color: "#8b6914", fontSize: 14, fontWeight: 800 }}>Key insights</div>
                <div style={{ color: "#a07b2d", fontSize: 11.5 }}>Auto-generated from this selection · full set is in the Excel report</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "6px 18px" }}>
                {insights.slice(0, 8).map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", color: "#5a4416", fontSize: 12.5, lineHeight: 1.5 }}>
                    <span style={{ color: "#d2ab67", fontWeight: 800 }}>•</span>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Trend chart */}
          <div style={CARD}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <div style={{ color: "#1f3550", fontSize: 14, fontWeight: 800 }}>
                {granularity === "monthly" ? "Month-by-month" : "Day-by-day"} {splitByHub ? "litres, stacked by hub" : metric === "revenue" ? "revenue" : "litres"}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "inline-flex", border: "1px solid #c7d9ea", borderRadius: 9, overflow: "hidden" }}>
                  {[["daily", "Daily"], ["monthly", "Monthly"]].map(([v, l]) => (
                    <button key={v} onClick={() => setGranularity(v)} style={{ background: granularity === v ? "#0a5688" : "#fff", color: granularity === v ? "#fff" : "#4d5b78", border: "none", padding: "7px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>{l}</button>
                  ))}
                </div>
                <div style={{ display: "inline-flex", border: "1px solid #c7d9ea", borderRadius: 9, overflow: "hidden", opacity: splitByHub ? 0.45 : 1 }}>
                  {[["units", "Litres"], ["revenue", "Revenue"]].map(([v, l]) => (
                    <button key={v} disabled={splitByHub} onClick={() => setMetric(v)} style={{ background: metric === v ? "#074069" : "#fff", color: metric === v ? "#fff" : "#4d5b78", border: "none", padding: "7px 14px", cursor: splitByHub ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700 }}>{l}</button>
                  ))}
                </div>
                {hubData?.hubs?.length > 1 ? (
                  <button onClick={() => setSplitByHub((s) => !s)} style={{ background: splitByHub ? "#2f7a4f" : "#fff", color: splitByHub ? "#fff" : "#4d5b78", border: "1px solid #c7d9ea", borderRadius: 9, padding: "7px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                    {splitByHub ? "✓ Hub split" : "Split by hub"}
                  </button>
                ) : null}
                <button onClick={exportDashboard} title="Interactive HTML dashboard with charts — opens in any browser" style={{ background: "#074069", border: "1px solid #053253", borderRadius: 9, color: "#fff", padding: "7px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>⬇ Dashboard</button>
                <button onClick={exportWorkbook} disabled={exporting} title="Multi-sheet Excel workbook; the Daily sheet is split by hub so you can filter it" style={{ background: "#8b6914", border: "1px solid #7a5b0f", borderRadius: 9, color: "#fffdf7", padding: "7px 14px", cursor: exporting ? "wait" : "pointer", fontSize: 12, fontWeight: 700, opacity: exporting ? 0.6 : 1 }}>{exporting ? "Preparing…" : "⬇ Excel"}</button>
                <button onClick={exportCsv} style={{ background: "#ffffff", border: "1px solid #c7d9ea", borderRadius: 9, color: "#4d5b78", padding: "7px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>CSV</button>
              </div>
            </div>
            <ReactEChartsCore echarts={echarts} option={chartOption} style={{ height: 350 }} notMerge lazyUpdate />
            <div style={HELP}>{splitByHub ? "Each colour is a hub; bar height is total litres. Toggle Daily / Monthly to change the bucket." : granularity === "daily" ? "Bars = each day. The dark line is a 7-day rolling average so you can see the trend through daily noise." : "Each bar is one month's total. Switch to Daily for per-day detail."}</div>
          </div>

          {/* Hub-wise performance */}
          {hubData?.hubs?.length ? (
            <div style={CARD}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <div>
                  <div style={{ color: "#1f3550", fontSize: 14, fontWeight: 800 }}>Hub-wise performance</div>
                  <div style={HELP}>How each distribution hub contributed{hub ? "" : ". Click a hub to filter the whole page to it"}.</div>
                </div>
                {hub ? <button onClick={() => setHub("")} style={{ background: "#fff", border: "1px solid #c7d9ea", borderRadius: 9, color: "#4d5b78", padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>← All hubs</button> : null}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead><tr>{["Hub", "Litres", "Share", "Revenue", "Avg/day", "Customers", "Selling days"].map((h) => <th key={h} style={{ background: "#074069", color: "#fff", padding: "8px 10px", textAlign: h === "Hub" ? "left" : "right", fontSize: 11.5, fontWeight: 700 }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {hubData.hubs.map((h, i) => {
                      const sel = hub === h.hub;
                      return (
                        <tr key={h.hub} onClick={() => setHub(sel ? "" : h.hub)} title="Click to filter to this hub" style={{ cursor: "pointer", background: sel ? "#eaf3ff" : "#fff" }}>
                          <td style={{ padding: "8px 10px", border: "1px solid #eef3f9", color: "#20476d", fontWeight: 700 }}>
                            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: HUB_COLORS[i % HUB_COLORS.length], marginRight: 8 }} />
                            {h.hub}{sel ? " ✓" : ""}
                          </td>
                          <td style={{ padding: "8px 10px", border: "1px solid #eef3f9", color: "#074069", fontWeight: 700, textAlign: "right" }}>{n0(h.units)}</td>
                          <td style={{ padding: "8px 10px", border: "1px solid #eef3f9", minWidth: 130 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ flex: 1, height: 10, background: "#eef3f9", borderRadius: 5 }}>
                                <div style={{ height: 10, width: `${h.share_units}%`, background: HUB_COLORS[i % HUB_COLORS.length], borderRadius: 5 }} />
                              </div>
                              <span style={{ color: "#42607f", fontWeight: 700, width: 42, textAlign: "right" }}>{n1(h.share_units)}%</span>
                            </div>
                          </td>
                          <td style={{ padding: "8px 10px", border: "1px solid #eef3f9", color: "#2f7a4f", textAlign: "right" }}>{inrShort(h.revenue)}</td>
                          <td style={{ padding: "8px 10px", border: "1px solid #eef3f9", color: "#5f7f9f", textAlign: "right" }}>{n0(h.avg_units_per_day)} L</td>
                          <td style={{ padding: "8px 10px", border: "1px solid #eef3f9", color: "#5f7f9f", textAlign: "right" }}>{n0(h.customers)}</td>
                          <td style={{ padding: "8px 10px", border: "1px solid #eef3f9", color: "#5f7f9f", textAlign: "right" }}>{n0(h.selling_days)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* Monthly breakdown + weekday pattern side by side */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 12 }}>
            <div style={CARD}>
              <div style={{ color: "#1f3550", fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Monthly breakdown</div>
              <div style={{ maxHeight: 340, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead><tr>{["Month", "Litres", "Revenue", "Avg/day"].map((h) => <th key={h} style={{ position: "sticky", top: 0, background: "#074069", color: "#fff", padding: "8px 10px", textAlign: h === "Month" ? "left" : "right", fontSize: 11.5, fontWeight: 700 }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {derived.monthly.map((m) => (
                      <tr key={m.ym}>
                        <td style={{ padding: "7px 10px", border: "1px solid #eef3f9", color: "#20476d", fontWeight: 600 }}>
                          {fmtMonth(m.ym)}
                          <div style={{ height: 4, background: "#eef3f9", borderRadius: 3, marginTop: 4 }}>
                            <div style={{ height: 4, width: `${(m.units / derived.maxMonthUnits) * 100}%`, background: "#aac6dc", borderRadius: 3 }} />
                          </div>
                        </td>
                        <td style={{ padding: "7px 10px", border: "1px solid #eef3f9", color: "#074069", fontWeight: 700, textAlign: "right" }}>{n0(m.units)}</td>
                        <td style={{ padding: "7px 10px", border: "1px solid #eef3f9", color: "#2f7a4f", textAlign: "right" }}>{inrShort(m.revenue)}</td>
                        <td style={{ padding: "7px 10px", border: "1px solid #eef3f9", color: "#5f7f9f", textAlign: "right" }}>{m.active ? n0(m.units / m.active) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={CARD}>
              <div style={{ color: "#1f3550", fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Which weekday sells most?</div>
              <div style={HELP}>Average litres sold on each day of the week.</div>
              <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                {derived.weekday.map((w) => (
                  <div key={w.day} style={{ display: "grid", gridTemplateColumns: "44px 1fr 64px", alignItems: "center", gap: 10 }}>
                    <span style={{ color: "#42607f", fontSize: 12, fontWeight: 700 }}>{w.day}</span>
                    <div style={{ height: 16, background: "#eef3f9", borderRadius: 5 }}>
                      <div style={{ height: 16, width: `${(w.avg / derived.maxWk) * 100}%`, background: w.avg >= derived.maxWk * 0.999 ? "#2f7a4f" : "#0a5688", borderRadius: 5, transition: "width .3s" }} />
                    </div>
                    <span style={{ color: "#1f3550", fontSize: 12.5, fontWeight: 700, textAlign: "right" }}>{n0(w.avg)} L</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Daily detail (collapsed by default) */}
          <div style={CARD}>
            <button onClick={() => setShowDaily((s) => !s)} style={{ background: "transparent", border: "none", color: "#1f3550", fontSize: 14, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: 0 }}>
              <span style={{ color: "#d2ab67" }}>{showDaily ? "▾" : "▸"}</span>
              Day-by-day detail ({n0(days.length)} days)
              <span style={{ color: "#8a9cb3", fontSize: 12, fontWeight: 500 }}>{showDaily ? "click to hide" : "click to show every day"}</span>
            </button>
            {showDaily ? (
              <div style={{ maxHeight: 460, overflowY: "auto", overflowX: "auto", marginTop: 12 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead><tr>{["Date", "Litres (net)", "Delivered", "Revenue", "Deliveries", "Customers"].map((h) => <th key={h} style={{ position: "sticky", top: 0, background: "#074069", color: "#fff", padding: "9px 12px", textAlign: h === "Date" ? "left" : "right", fontSize: 11.5, fontWeight: 700 }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {days.map((d) => {
                      const blank = d.lines === 0;
                      return (
                        <tr key={d.date} style={{ background: blank ? "#fbfdff" : "#fff" }}>
                          <td style={{ color: "#20476d", padding: "7px 12px", border: "1px solid #eef3f9", fontFamily: "monospace" }}>{fmtDay(d.date)}</td>
                          <td style={{ color: blank ? "#aab8c9" : "#074069", fontWeight: 700, padding: "7px 12px", border: "1px solid #eef3f9", textAlign: "right" }}>{n0(d.units)}</td>
                          <td style={{ color: "#5f7f9f", padding: "7px 12px", border: "1px solid #eef3f9", textAlign: "right" }}>{n0(d.delivered)}</td>
                          <td style={{ color: blank ? "#aab8c9" : "#2f7a4f", padding: "7px 12px", border: "1px solid #eef3f9", textAlign: "right" }}>{inrFull(d.revenue)}</td>
                          <td style={{ color: "#5f7f9f", padding: "7px 12px", border: "1px solid #eef3f9", textAlign: "right" }}>{n0(d.lines)}</td>
                          <td style={{ color: "#5f7f9f", padding: "7px 12px", border: "1px solid #eef3f9", textAlign: "right" }}>{n0(d.customers)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
