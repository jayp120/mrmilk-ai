import React, { useState, useRef, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const DATA = {
  data_date: "March 1, 2026",
  overview: { total_customers: 20050, total_revenue: 77246159, total_orders: 605478, avg_revenue_per_customer: 3852.68, total_wallet_balance: 3378163, active_customers: 1644, inactive_customers: 16052, suspended_customers: 402, trial_customers: 912, new_customers: 892, dnd_customers: 295, blocked_customers: 154 },
  subscription_status: { "Inactive No Order": 6877, "Inactive No Subscription": 6293, "Inactive": 2882, "Active Subscription": 1473, "Trial Ended": 897, "New Customer": 892, "Suspended Low Balance": 371, "Active No Subscription": 171, "On Vacation": 148, "Suspended": 31, "Trial Running": 13, "Trial Not Converted": 2 },
  hub_performance: { "Pune City Hub": { customers: 11665, revenue: 59839697, orders: 459156 }, "Chinchwad Hub": { customers: 4040, revenue: 17361562, orders: 146279 }, "No Hub Assigned": { customers: 4251, revenue: 44900, orders: 43 }, "Talegaon hub": { customers: 90, revenue: 0, orders: 0 } },
  top_areas_by_revenue: { "Hadapsar": { customers: 1083, revenue: 3970774 }, "Sinhgad Road": { customers: 693, revenue: 3785596 }, "Aundh": { customers: 343, revenue: 2655926 }, "Kharadi": { customers: 462, revenue: 2310462 }, "Wakad": { customers: 576, revenue: 2257429 }, "Bibwewadi": { customers: 324, revenue: 2203682 }, "Kothrud": { customers: 393, revenue: 2129371 }, "Baner Road": { customers: 206, revenue: 1649846 }, "Koregaon Park": { customers: 131, revenue: 1430137 }, "Chinchwad": { customers: 296, revenue: 1406729 }, "Pimpri Chinchwad": { customers: 137, revenue: 1387463 }, "Ravet": { customers: 212, revenue: 1339861 }, "Bavdhan": { customers: 219, revenue: 1273156 }, "Nibm Road": { customers: 128, revenue: 1270477 }, "Ghorpadi": { customers: 223, revenue: 1257449 } },
  wallet_stats: { customers_with_positive_wallet: 2598, customers_with_zero_wallet: 17212, customers_with_negative_wallet: 240, avg_wallet_balance: 168.49, max_wallet_balance: 957768, total_wallet: 3378163 },
  payment_mode: { Cash: 14771, Online: 5279 },
  sources: { "Search Engine": 1871, "Social Media": 1247, "Social Ads": 748, "Word of Mouth": 643, "Google Ads": 591, "Reference": 487, "Newspaper Ad": 476, "Trade Shows": 389, "Friend": 315, "Facebook": 314 },
  top_delivery_boys: { "Suraj Sakhare": 497, "Satish Kengale": 453, "Suhas Sawant": 452, "Santosh Ekhande": 445, "Ashutosh Chaphekar": 443, "Ishwar Bobade": 442, "Ashish Goriwale": 441, "Yuvraj Shinde": 427, "Sagar Satpute": 413, "Jayant Patil": 402 },
  consumption: { avg_daily_liters: 7.962, total_daily_liters: 154425 },
  top_20_customers: [
    { Name: "Saurabh Ghule", Mobile: 8007100751, Area: "Hadapsar", Hub: "Pune City Hub", "Total Revenue": 364970, "Total Orders": 627, "Sub. Status": "Suspended Low Balance", "Wallet Balance": -4236 },
    { Name: "SARASWATIDEVI MITTAL FOUNDATION", Mobile: 8530200908, Area: "Sinhgad Road", Hub: "Pune City Hub", "Total Revenue": 310645, "Total Orders": 499, "Sub. Status": "Active Subscription", "Wallet Balance": -14800 },
    { Name: "Dr Vishnu Patil", Mobile: 9960316318, Area: "Bibwewadi", Hub: "Pune City Hub", "Total Revenue": 299066, "Total Orders": 594, "Sub. Status": "Active Subscription", "Wallet Balance": 3061 },
    { Name: "Rupesh co Neha Patil", Mobile: 9923400519, Area: "Koregaon Park", Hub: "Pune City Hub", "Total Revenue": 239024, "Total Orders": 514, "Sub. Status": "Suspended", "Wallet Balance": -12900 },
    { Name: "Sarita Agarwal", Mobile: 9881690425, Area: "Mukundnagar", Hub: "Pune City Hub", "Total Revenue": 210867, "Total Orders": 636, "Sub. Status": "Active Subscription", "Wallet Balance": 24926 },
    { Name: "Shweta Mangal", Mobile: 9423589866, Area: "Chinchwad", Hub: "Chinchwad Hub", "Total Revenue": 188164, "Total Orders": 612, "Sub. Status": "Active Subscription", "Wallet Balance": 804 },
    { Name: "Beena Agarwal", Mobile: 9823072921, Area: "Koregaon Park", Hub: "Pune City Hub", "Total Revenue": 181999, "Total Orders": 609, "Sub. Status": "Active Subscription", "Wallet Balance": -17400 },
    { Name: "Ashish Duhan", Mobile: 8295880850, Area: "Hadapsar", Hub: "Pune City Hub", "Total Revenue": 179673, "Total Orders": 526, "Sub. Status": "Active Subscription", "Wallet Balance": 2224 },
    { Name: "Mamta Deepak Misal", Mobile: 9923966337, Area: "Camp", Hub: "Pune City Hub", "Total Revenue": 175188, "Total Orders": 629, "Sub. Status": "Active Subscription", "Wallet Balance": 4123 },
    { Name: "Milind Kulkarni", Mobile: 9741176929, Area: "Balewadi Phata", Hub: "Pune City Hub", "Total Revenue": 172027, "Total Orders": 620, "Sub. Status": "Active Subscription", "Wallet Balance": 5341 }
  ],
  high_value_inactive: [
    { Name: "Dr Bhavana Sharma", Mobile: 9425793377, Area: "Kharadi", "Total Revenue": 126996, "Total Orders": 411, "Last Delivery": "2025-12-27" },
    { Name: "Setu Vivek Agarwal", Mobile: 9881084422, Area: "Mohammedwadi", "Total Revenue": 121891, "Total Orders": 623, "Last Delivery": "2026-02-28" },
    { Name: "Arun Ranganath Bahirat", Mobile: 9823828338, Area: "Senapati Bapat Rd", "Total Revenue": 114120, "Total Orders": 557, "Last Delivery": "2026-01-21" },
    { Name: "Vipin Chauhan", Mobile: 8580537886, Area: "Kharadi", "Total Revenue": 108531, "Total Orders": 467, "Last Delivery": "2026-02-08" },
    { Name: "Muktha Praveen", Mobile: 9423517531, Area: "Ghorpadi", "Total Revenue": 90385, "Total Orders": 485, "Last Delivery": "2025-12-07" }
  ]
};

const ROLES = {
  owner:     { label: "Owner", icon: "OM", color: "#d2ab67", title: "Owner / Management", focus: "Full business health, revenue gaps, strategic growth, competitor threats, and high-level decisions. Be brutally honest." },
  marketing: { label: "Marketing", icon: "MK", color: "#44bbff", title: "Marketing Team", focus: "Acquisition sources, campaign ideas with exact WhatsApp copy, festival timing, trial conversion fixes, and referrals." },
  crm:       { label: "CRM", icon: "CR", color: "#ff9944", title: "CRM / Support", focus: "Churn recovery, suspended customers, negative wallet, win-back call scripts, and high-value retention." },
  ops:       { label: "Operations", icon: "OP", color: "#66ff99", title: "Operations / Hubs", focus: "Hub performance, delivery efficiency, no-hub customer fix, and route planning." }
};

const SYSTEM_PROMPT = (data, role) => `You are the MrMilk AI (https://www.mittaldairyfarms.com/) - an elite, brutally honest Senior Marketing & Business Analyst embedded inside Mr. Milk (Mittal Dairy Farms), Pune's premium A2 desi cow milk brand.

You are not a generic chatbot. You are a Pune-native growth consultant who knows every society, lane, and buying behavior across PMC, PCMC, and PMRDA. You have studied this data deeply. You speak like a senior operator, not a marketer.

CURRENT TEAM CONTEXT: ${ROLES[role].title}
FOCUS: ${ROLES[role].focus}

-------------------------------------------
WHO IS MR. MILK (MITTAL DAIRY FARMS)
-------------------------------------------
Brand: Mr. Milk | Parent: Mittal Dairy Farms | Website: mittaldairyfarms.com
Phone: 9922-67-6455 | App: MrMilk (Android + iOS via MilkMaster platform)

PRODUCTS & POSITIONING:
- Mr. Milk A2 Desi Cow Milk - from own farm, Gir & Sahiwal cows, untouched milking process, delivered within 12 hours
- Mr. Milk A2 Desi Cow Ghee - Bilona method, hand-churned, Vedic process, zero machines
- Mr. Milk A2 Paneer - 100% desi cow milk, ultra-fresh, doorstep delivery
- Mr. Milk A2 Dahi - small batch, untouched, loaded with Vitamin A, B12, Calcium
- Mr. Milk A2 Plain Buttermilk - traditional Bilona method, refreshing

BRAND USPs (own farm advantages):
- Single-source milk - one farm, one cow breed, zero adulteration
- Farm to doorstep within 12 hours
- Automated milking parlour - milk never touched by human hands (grass to glass)
- No preservatives, no additives, no growth hormones
- Pure Desi Cows only - Gir & Sahiwal, NO foreign breeds (= pure A2, no A1 contamination)
- App-based flexible subscriptions (MilkMaster platform)
- Free delivery across Pune & PCMC
- Transparent billing

AWARDS:
- Top Trusted Dairy Brand - Times Power Brands
- Lokmat Global Industry Award 2024 (Baku)

This is a PREMIUM brand. Customers pay a premium because they trust the farm, the process, and the A2 health narrative. Every marketing move must protect and reinforce this premium positioning.

-------------------------------------------
REAL CUSTOMER DATA (${data?.data_date || "Unknown Date"})
-------------------------------------------
${JSON.stringify(data || DATA, null, 2)}

-------------------------------------------
PUNE AREA INTELLIGENCE (Your Territory)
-------------------------------------------

PMC (Pune Municipal Corporation):

HADAPSAR - Your #1 area. Dense residential with Magarpatta and Amanora clusters. IT-heavy, premium-subscription friendly.
SINHGAD ROAD - Strong loyalty cluster, high average revenue/customer. Nanded City township is a major untapped growth pocket.
KHARADI - High churn IT zone due to relocation cycles. Country Delight is aggressive here.
KOTHRUD - High trust market, strong legacy competitors, loyalty when retained well.
AUNDH / BANER - High-value premium corridor, ideal for A2 value-added upsells.
KOREGAON PARK - Highest-value households per customer profile. Premium service expectations are highest.
BIBWEWADI - Price-sensitive but loyalty-friendly with wallet and festival campaigns.
BAVDHAN / KALYANI NAGAR / NIBM / BALEWADI - premium growth belts with under-penetration opportunities.

PCMC (Pimpri-Chinchwad) - Chinchwad Hub:
WAKAD / HINJEWADI - high acquisition and high churn due to rental-heavy IT families.
PIMPLE SAUDAGAR / NILAKH / RAVET - expanding family clusters with rising A2 awareness.
PRADHIKARAN / NIGDI - sticky long-term households once trust is established.
BHOSARI / MOSHI / AKURDI / THERGAON - emerging opportunity segments.

PMRDA:
TALEGAON - underperforming in data and/or ops, immediate audit needed.
CHAKAN / DEHU ROAD / ALANDI / LONAVALA BELT - mixed industrial, trust-led and seasonal opportunities.

-------------------------------------------
YOUR REAL COMPETITORS (Who is eating your customers)
-------------------------------------------
1. COUNTRY DELIGHT - biggest threat in Kharadi, Hinjewadi, Wakad, Hadapsar with app-first growth offers.
2. AKSHAYAKALPA ORGANIC - premium organic overlap in Aundh/Koregaon Park.
3. KATRAJ DAIRY - deep local trust in old Pune; wins price-sensitive segments.
4. CHITALE BANDHU - strong brand trust with broad product familiarity.
5. AMUL HOME DELIVERY - aggressive value-led push; dangerous for low-wallet customers.
6. LOCAL VENDORS - relationship and cash-based retention in old neighborhoods.

-------------------------------------------
CRITICAL BUSINESS PROBLEMS (from actual data)
-------------------------------------------
1. CATASTROPHIC CHURN: inactive share is extreme versus subscription benchmark.
2. TOP CUSTOMER RISK: highest-LTV customers in suspended/low-balance state.
3. HIGH-VALUE INACTIVE: revenue-rich dormant accounts need immediate win-back.
4. WALLET CRISIS: wallet-zero and negative segments are suppressing active subscriptions.
5. TALEGAON HUB FAILURE: zero-revenue cluster requires immediate investigation.
6. NO-HUB CUSTOMERS: operational ownership gap blocks serviceability.
7. TRIAL PIPELINE FAILURE: trial-to-paid conversion is critically weak.
8. CASH DEPENDENCY: high cash share adds collection and retention risk.

-------------------------------------------
OUTPUT FORMAT - NON-NEGOTIABLE
-------------------------------------------
EVERY response must follow this structure:

## DATA SNAPSHOT
Exact numbers, real customer names, real mobile numbers, exact rupee values.

## AREA INTELLIGENCE
What is happening in that specific Pune locality right now.

## ROOT CAUSE
Specific cause, direct language, no fluff.

## PRIORITY ACTION PLAN
Numbered actions with who to call/message, and what exact WhatsApp copy to send.

## COMPETITIVE THREAT
Which competitor is benefiting and how in that locality.

## EXECUTION TIMELINE
This week / This month / Next month.

RULES:
- Always use real customers from data with exact mobile and revenue.
- Always show exact figures and counts.
- Give campaign copy in practical Hinglish/Marathi-friendly tone when useful.
- Reference Pune seasonal context: Ganesh Chaturthi, Gudi Padwa, IT transfer cycles, RWA behavior.
- Connect every recommendation to premium A2 own-farm brand positioning.

NEVER:
- Generic advice.
- Vague percentages without counts.
- Ignoring competitor context.
- Diluting premium A2 positioning.

You are the sharpest analyst this company has ever had. Show it.`;

const SUGGESTIONS = [
  "Full business health report - don't hold back",
  "Saurabh Ghule is suspended - what do we do RIGHT NOW?",
  "Which areas is Country Delight eating our customers?",
  "Top 5 high-value inactive - give me the win-back call script",
  "Why is our trial-to-subscription conversion near zero?",
  "Best campaign for Hinjewadi IT crowd this week",
  "Talegaon Hub shows 0 revenue - what's happening?",
  "How do we grow Koregaon Park & Aundh premium segment?"
];

const BRAND_CONTEXT = {
  source: "mittaldairyfarms.com",
  headline: "Pure A2 Milk & A2 Ghee Delivered To Doorstep In Pune & PCMC",
  meta: "Fresh, pure and single-source A2 milk and ghee delivered across Pune and PCMC."
};

const MARKETING_SKILLS = {
  core: { label: "Core Operator", directive: "Default to data-first business triage with clear ownership, timelines, and measurable outcomes." },
  "content-strategy": { label: "Content Strategy", directive: "Plan searchable + shareable content by buyer stage and Pune locality. Prioritize high-intent, high-revenue areas first." },
  "marketing-psychology": { label: "Marketing Psychology", directive: "Apply ethical persuasion: social proof, loss aversion, commitment steps, urgency framing, and friction reduction for conversion." },
  "competitor-alternatives": { label: "Competitor Alternatives", directive: "Frame alternatives vs competitors honestly. Highlight where MrMilk wins, where competitor wins, and migration path." }
};

const CHAT_OBJECTIVES = ["Retention", "Acquisition", "Wallet", "Premium Upsell"];
const CHAT_DEPTH = ["Quick", "Standard", "Deep"];
const CHAT_TONES = ["Direct", "Consultative", "Aggressive"];
const CHAT_OUTPUT_MODES = ["Table", "Playbook", "Scripts"];
const PERSONA_PLAYBOOKS = {
  crm_specialist: {
    label: "CRM Specialist",
    style: "Empathy + urgency + clear next step",
    objection_handling: ["Too expensive", "Will top up later", "Using another vendor"],
    call_flow: ["Rapport", "Problem signal", "Offer", "Close", "Follow-up"]
  },
  area_growth_manager: {
    label: "Area Growth Manager",
    style: "Hyperlocal, cluster-first execution",
    objection_handling: ["Society adoption is low", "No delivery route confidence", "No demand visibility"],
    call_flow: ["Area diagnosis", "Cluster target", "Pilot", "RWA conversion", "Scale"]
  },
  competitor_analyst: {
    label: "Competitor Analyst",
    style: "Win-loss matrix with counter-strategy",
    objection_handling: ["Competitor is cheaper", "Competitor app is easier", "Competitor has better offers"],
    call_flow: ["Threat map", "Differentiator", "Counter-offer", "Retention lock-in", "Review"]
  }
};
const ROLE_DEFAULT_PERSONA = {
  owner: "competitor_analyst",
  marketing: "area_growth_manager",
  crm: "crm_specialist",
  ops: "area_growth_manager"
};
const STRUCTURED_SECTION_KEYS = [
  "data_snapshot",
  "area_intelligence",
  "root_cause",
  "priority_actions",
  "competitive_threat",
  "timeline",
  "whatsapp_scripts"
];
const REGENERABLE_SECTIONS = [
  "area_intelligence",
  "root_cause",
  "priority_actions",
  "competitive_threat",
  "timeline",
  "whatsapp_scripts"
];
const SECTION_LABELS = {
  data_snapshot: "Data Snapshot",
  area_intelligence: "Area Intelligence",
  root_cause: "Root Cause",
  priority_actions: "Priority Actions",
  competitive_threat: "Competitive Threat",
  timeline: "Execution Timeline",
  whatsapp_scripts: "WhatsApp Scripts"
};
const DEFAULT_CHAT_CONTROLS = {
  objective: "Retention",
  depth: "Standard",
  tone: "Consultative",
  output_mode: "Playbook",
  persona: "crm_specialist"
};
const CHAT_CONTEXT_PRESETS = [
  {
    id: "churn_rescue",
    label: "Churn Rescue",
    use_when: "Inactive/suspended customers are increasing",
    controls: { objective: "Retention", depth: "Deep", tone: "Direct", output_mode: "Playbook", persona: "crm_specialist" }
  },
  {
    id: "area_growth",
    label: "Area Growth",
    use_when: "Need locality expansion and RWA conversions",
    controls: { objective: "Acquisition", depth: "Standard", tone: "Consultative", output_mode: "Playbook", persona: "area_growth_manager" }
  },
  {
    id: "wallet_recovery",
    label: "Wallet Recovery",
    use_when: "Zero/negative wallet causing service interruptions",
    controls: { objective: "Wallet", depth: "Quick", tone: "Direct", output_mode: "Scripts", persona: "crm_specialist" }
  },
  {
    id: "premium_push",
    label: "Premium Push",
    use_when: "Growing A2 premium basket in top-value zones",
    controls: { objective: "Premium Upsell", depth: "Standard", tone: "Consultative", output_mode: "Table", persona: "competitor_analyst" }
  }
];

const asArray = (v) => Array.isArray(v) ? v : [];
const asObject = (v) => (v && typeof v === "object" && !Array.isArray(v)) ? v : {};

const parseJsonFromText = (raw) => {
  const text = toText(raw);
  if (!text) return null;
  const candidates = [];
  candidates.push(text);
  const fence = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidates.push(fence[1].trim());
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(text.slice(firstBrace, lastBrace + 1));
  for (const c of candidates) {
    try { return JSON.parse(c); } catch { /* try next */ }
  }
  return null;
};

const normalizeStructuredResponse = (payload) => {
  const p = asObject(payload);
  const timeline = asObject(p.timeline);
  return {
    data_snapshot: asObject(p.data_snapshot),
    area_intelligence: asArray(p.area_intelligence),
    root_cause: asArray(p.root_cause),
    priority_actions: asArray(p.priority_actions),
    competitive_threat: asArray(p.competitive_threat),
    timeline: {
      this_week: asArray(timeline.this_week),
      this_month: asArray(timeline.this_month),
      next_month: asArray(timeline.next_month)
    },
    whatsapp_scripts: asArray(p.whatsapp_scripts)
  };
};

const validateStructuredResponse = (payload) => {
  const errors = [];
  const parsed = normalizeStructuredResponse(payload);
  STRUCTURED_SECTION_KEYS.forEach((k) => {
    if (!(k in parsed)) errors.push(`Missing top-level key: ${k}`);
  });
  if (!Object.keys(parsed.data_snapshot).length) errors.push("data_snapshot must be an object with metrics.");
  if (!parsed.area_intelligence.length) errors.push("area_intelligence must contain at least one item.");
  if (!parsed.root_cause.length) errors.push("root_cause must contain at least one item.");
  if (!parsed.priority_actions.length) errors.push("priority_actions must contain at least one item.");
  if (!parsed.competitive_threat.length) errors.push("competitive_threat must contain at least one item.");
  if (!parsed.timeline.this_week.length && !parsed.timeline.this_month.length && !parsed.timeline.next_month.length) {
    errors.push("timeline must include at least one task across this_week/this_month/next_month.");
  }
  if (!parsed.whatsapp_scripts.length) errors.push("whatsapp_scripts must contain at least one script.");
  return { ok: errors.length === 0, errors, data: parsed };
};

const validateSectionData = (sectionKey, sectionValue) => {
  if (sectionKey === "timeline") {
    const t = asObject(sectionValue);
    const normalized = {
      this_week: asArray(t.this_week),
      this_month: asArray(t.this_month),
      next_month: asArray(t.next_month)
    };
    const ok = normalized.this_week.length || normalized.this_month.length || normalized.next_month.length;
    return { ok: Boolean(ok), normalized, error: ok ? "" : "timeline must include at least one task." };
  }
  if (sectionKey === "data_snapshot") {
    const normalized = asObject(sectionValue);
    return { ok: Object.keys(normalized).length > 0, normalized, error: "data_snapshot cannot be empty." };
  }
  const normalized = asArray(sectionValue);
  return { ok: normalized.length > 0, normalized, error: `${sectionKey} must contain at least one item.` };
};

const scoreStructuredResponse = (structured, analysisPacket) => {
  let score = 0;
  const issues = [];
  if (Object.keys(structured.data_snapshot).length) score += 15; else issues.push("Data snapshot empty.");
  if (structured.area_intelligence.length >= 2) score += 15; else issues.push("Area intelligence too shallow.");
  if (structured.root_cause.length >= 2) score += 15; else issues.push("Root cause too shallow.");
  if (structured.priority_actions.length >= 3) score += 20; else issues.push("Need at least 3 priority actions.");
  if (structured.competitive_threat.length >= 1) score += 10; else issues.push("Competitive section missing.");
  if (structured.timeline.this_week.length && structured.timeline.this_month.length && structured.timeline.next_month.length) score += 15; else issues.push("Timeline missing one or more windows.");
  if (structured.whatsapp_scripts.length >= 2) score += 10; else issues.push("Need at least 2 WhatsApp scripts.");

  const packetTotal = toInt(analysisPacket?.overview?.total_customers);
  const snapTotal = toInt(structured?.data_snapshot?.total_customers);
  if (packetTotal && snapTotal && packetTotal === snapTotal) score += 10;
  else issues.push("data_snapshot total_customers mismatch with analysis packet.");

  return { score: Math.min(score, 100), issues };
};

const toRupee = (n) => `Rs ${toInt(n).toLocaleString()}`;

const buildAnalysisEnginePacket = (data, controls, todayIso) => {
  const overview = asObject(data?.overview);
  const topAreas = Object.entries(asObject(data?.top_areas_by_revenue))
    .map(([area, v]) => ({ area, customers: toInt(v?.customers), revenue: toInt(v?.revenue) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8)
    .map((a) => ({ ...a, avg_revenue_per_customer: a.customers ? Number((a.revenue / a.customers).toFixed(2)) : 0 }));
  const status = asObject(data?.subscription_status);
  const wallet = asObject(data?.wallet_stats);
  const topCustomers = asArray(data?.top_20_customers).slice(0, 8).map((c) => ({
    name: toText(c?.Name),
    mobile: toText(c?.Mobile),
    area: toText(c?.Area),
    status: toText(c?.["Sub. Status"]),
    revenue: toInt(c?.["Total Revenue"]),
    wallet_balance: toInt(c?.["Wallet Balance"]),
    orders: toInt(c?.["Total Orders"])
  }));
  const topInactive = asArray(data?.high_value_inactive).slice(0, 8).map((c) => ({
    name: toText(c?.Name),
    mobile: toText(c?.Mobile),
    area: toText(c?.Area),
    revenue: toInt(c?.["Total Revenue"]),
    orders: toInt(c?.["Total Orders"]),
    last_delivery: toText(c?.["Last Delivery"])
  }));

  const inactiveRate = overview.total_customers ? Number(((toNumber(overview.inactive_customers) / toNumber(overview.total_customers)) * 100).toFixed(2)) : 0;
  return {
    generated_at: new Date().toISOString(),
    today_iso: todayIso,
    controls,
    overview: {
      data_date: toText(data?.data_date),
      total_customers: toInt(overview.total_customers),
      active_customers: toInt(overview.active_customers),
      inactive_customers: toInt(overview.inactive_customers),
      suspended_customers: toInt(overview.suspended_customers),
      total_revenue: toInt(overview.total_revenue),
      total_orders: toInt(overview.total_orders),
      inactive_rate_pct: inactiveRate,
      total_wallet_balance: toInt(overview.total_wallet_balance)
    },
    top_areas: topAreas,
    subscription_status: status,
    wallet_health: {
      positive_customers: toInt(wallet.customers_with_positive_wallet),
      zero_customers: toInt(wallet.customers_with_zero_wallet),
      negative_customers: toInt(wallet.customers_with_negative_wallet),
      total_wallet: toInt(wallet.total_wallet)
    },
    high_value_risk_segments: {
      top_customers: topCustomers,
      high_value_inactive: topInactive
    },
    payment_mode: asObject(data?.payment_mode),
    top_sources: asObject(data?.sources)
  };
};

const buildStructuredSystemInstructions = ({ role, controls, personaPlaybook, todayIso }) => {
  return [
    `You are MrMilk AI, a senior Pune marketing specialist.`,
    `Today (Asia/Kolkata): ${todayIso}.`,
    `Role context: ${ROLES[role]?.title || "Team"} | Focus: ${ROLES[role]?.focus || ""}`,
    `Persona playbook: ${personaPlaybook.label}. Style: ${personaPlaybook.style}.`,
    `Objection handling: ${personaPlaybook.objection_handling.join(", ")}.`,
    `Call flow: ${personaPlaybook.call_flow.join(" -> ")}.`,
    `Controls: objective=${controls.objective}, depth=${controls.depth}, tone=${controls.tone}, output_mode=${controls.output_mode}.`,
    `NON-NEGOTIABLE: Return ONLY strict JSON. No markdown. No prose outside JSON.`,
    `Required top-level keys exactly: data_snapshot, area_intelligence, root_cause, priority_actions, competitive_threat, timeline, whatsapp_scripts.`,
    `Field expectations:`,
    `- data_snapshot: object with exact numbers from analysis packet (no made-up figures).`,
    `- area_intelligence: array of objects with area, insight, evidence, local_context.`,
    `- root_cause: array of objects with issue, evidence, impact.`,
    `- priority_actions: ranked array with rank, owner, objective, action, target_segment, due_date, expected_outcome.`,
    `- competitive_threat: array with competitor, area, threat, counter_move.`,
    `- timeline: object with arrays this_week, this_month, next_month (date-bound tasks).`,
    `- whatsapp_scripts: array with segment, objective, message, cta.`,
    `If data is insufficient, keep keys and return conservative placeholders, but never break schema.`
  ].join("\n");
};

const structuredToMarkdown = (s) => {
  const snap = asObject(s?.data_snapshot);
  const timeline = asObject(s?.timeline);
  const md = [];
  md.push("## Data Snapshot");
  if (Object.keys(snap).length) {
    md.push("| **Metric** | **Value** |");
    md.push("|---|---|");
    Object.entries(snap).forEach(([k, v]) => {
      const value = typeof v === "number" ? v.toLocaleString() : Array.isArray(v) ? JSON.stringify(v) : toText(v);
      md.push(`| ${k} | ${value} |`);
    });
  } else md.push("- No data snapshot returned.");

  md.push("## Area Intelligence");
  asArray(s?.area_intelligence).forEach((x, i) => md.push(`${i + 1}. ${toText(x?.area)} - ${toText(x?.insight || x?.situation)} (evidence: ${toText(x?.evidence)})`));
  if (!asArray(s?.area_intelligence).length) md.push("- No area intelligence returned.");

  md.push("## Root Cause");
  asArray(s?.root_cause).forEach((x, i) => md.push(`${i + 1}. ${toText(x?.issue)} | evidence: ${toText(x?.evidence)} | impact: ${toText(x?.impact)}`));
  if (!asArray(s?.root_cause).length) md.push("- No root cause returned.");

  md.push("## Priority Actions");
  asArray(s?.priority_actions).forEach((x, i) => {
    md.push(`${i + 1}. [${toText(x?.owner)}] ${toText(x?.action)} | due: ${toText(x?.due_date)} | expected: ${toText(x?.expected_outcome)}`);
  });
  if (!asArray(s?.priority_actions).length) md.push("- No priority actions returned.");

  md.push("## Competitive Threat");
  asArray(s?.competitive_threat).forEach((x, i) => md.push(`${i + 1}. ${toText(x?.competitor)} in ${toText(x?.area)}: ${toText(x?.threat)} | counter: ${toText(x?.counter_move)}`));
  if (!asArray(s?.competitive_threat).length) md.push("- No competitive threat returned.");

  md.push("## Execution Timeline");
  md.push("### This Week");
  asArray(timeline.this_week).forEach((x) => md.push(`- ${toText(typeof x === "string" ? x : x?.task || JSON.stringify(x))}`));
  md.push("### This Month");
  asArray(timeline.this_month).forEach((x) => md.push(`- ${toText(typeof x === "string" ? x : x?.task || JSON.stringify(x))}`));
  md.push("### Next Month");
  asArray(timeline.next_month).forEach((x) => md.push(`- ${toText(typeof x === "string" ? x : x?.task || JSON.stringify(x))}`));

  md.push("## WhatsApp Scripts");
  asArray(s?.whatsapp_scripts).forEach((x, i) => {
    md.push(`### Script ${i + 1}: ${toText(x?.segment)} (${toText(x?.objective)})`);
    md.push(`- Message: ${toText(x?.message)}`);
    md.push(`- CTA: ${toText(x?.cta)}`);
  });
  if (!asArray(s?.whatsapp_scripts).length) md.push("- No WhatsApp scripts returned.");

  return md.join("\n");
};

const isVagueQuery = (query, knownAreas = []) => {
  const q = toKey(query);
  const words = q.split(" ").filter(Boolean);
  const hasArea = knownAreas.some((a) => q.includes(toKey(a)));
  const hasSpecificIntent = /(retention|acquisition|wallet|upsell|campaign|churn|reactivate|trial|competitor|script|timeline|hub|area|suspended|inactive|kharadi|hadapsar|aundh|kothrud|waked|wakad|hinjewadi)/.test(q);
  if (words.length <= 3) return true;
  if (!hasArea && !hasSpecificIntent && /(what|how|help|improve|best|do next)/.test(q)) return true;
  return false;
};

const buildClarifyingQuestion = (role) => {
  return `Before I run the strategy for ${ROLES[role]?.title || "your team"}: choose one goal (Retention, Acquisition, Wallet, Premium Upsell) and add area + timeframe (example: "Retention in Kharadi this week").`;
};

const FESTIVAL_EVENTS_2026 = [
  { id: "holika-dahan", date: "2026-03-03", name: "Holika Dahan", type: "festival", confidence: "confirmed", focus: "Milk + dahi stock-up", areas: ["Bibwewadi", "Kothrud", "Sinhgad Road"], offer: "Top up Rs 500, get 1 buttermilk free" },
  { id: "holi", date: "2026-03-04", name: "Holi", type: "festival", confidence: "confirmed", focus: "Party households and bulk demand", areas: ["Aundh", "Baner Road", "Wakad"], offer: "Weekend color-fest hydration pack" },
  { id: "gudi-padwa", date: "2026-03-19", name: "Gudi Padwa", type: "festival", confidence: "confirmed", focus: "Marathi family celebration packs", areas: ["Kothrud", "Sinhgad Road", "Nanded City"], offer: "A2 family starter combo for new year" },
  { id: "ram-navami", date: "2026-03-26", name: "Ram Navami", type: "festival", confidence: "tentative", focus: "Fasting and puja dairy demand", areas: ["Kharadi", "Hadapsar"], offer: "Puja milk pre-booking slots" },
  { id: "makar-sankranti", date: "2026-01-14", name: "Makar Sankranti", type: "festival", confidence: "confirmed", focus: "Til-gud gifting and morning deliveries", areas: ["Kothrud", "Bibwewadi"], offer: "Early morning Sankranti milk slot guarantee" },
  { id: "raksha-bandhan", date: "2026-08-28", name: "Raksha Bandhan", type: "festival", confidence: "confirmed", focus: "Family bundle push", areas: ["Hadapsar", "Chinchwad"], offer: "Sibling family bundle top-up bonus" },
  { id: "janmashtami", date: "2026-09-04", name: "Janmashtami", type: "festival", confidence: "confirmed", focus: "Makhan/dahi demand spike", areas: ["Aundh", "Koregaon Park"], offer: "Janmashtami dahi-ghee combo" },
  { id: "ganesh-chaturthi", date: "2026-09-14", name: "Ganesh Chaturthi", type: "festival", confidence: "tentative", focus: "Milk/dahi/ghee spike for prasad", areas: ["Pune City Hub", "Chinchwad Hub"], offer: "Ganpati 10-day daily milk commitment offer" },
  { id: "dussehra", date: "2026-10-20", name: "Dussehra", type: "festival", confidence: "tentative", focus: "Gift + festive cooking demand", areas: ["Kalyani Nagar", "Aundh"], offer: "Festive ghee gift SKU push" },
  { id: "dhanteras", date: "2026-11-06", name: "Dhanteras", type: "festival", confidence: "tentative", focus: "Premium gifting", areas: ["Koregaon Park", "Aundh"], offer: "Gold-tier A2 festive hamper pre-book" },
  { id: "diwali", date: "2026-11-08", name: "Diwali", type: "festival", confidence: "tentative", focus: "High-volume festive demand and gifting", areas: ["Hadapsar", "Koregaon Park", "Kalyani Nagar"], offer: "Diwali loyalty top-up + free delivery guarantee window" }
];

const DAY_MS = 24 * 60 * 60 * 1000;
const toISODateString = (dateObj) => {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const parseISODate = (iso) => new Date(`${iso}T00:00:00`);
const daysBetween = (fromIso, toIso) => Math.floor((parseISODate(toIso) - parseISODate(fromIso)) / DAY_MS);
const formatDateShort = (iso) => parseISODate(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
const formatDateLongIso = (iso) => parseISODate(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
const formatMonthYear = (year, monthIndex) => new Date(year, monthIndex, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const confidenceStyles = {
  confirmed: { bg: "#1f4f31", border: "#2f7a4a", text: "#bde8c8" },
  tentative: { bg: "#5a3b14", border: "#8f6528", text: "#f1d5a2" },
  system: { bg: "#163757", border: "#2b5f8e", text: "#b8d9ff" }
};
const typePalette = {
  festival: "#d2ab67",
  cashflow: "#4fc3f7",
  retention: "#7adf9a",
  recovery: "#ff9f6e",
  acquisition: "#c6a5ff"
};

const firstWeekdayOfMonth = (year, monthIndex, weekday) => {
  const d = new Date(year, monthIndex, 1);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  return d;
};

const generateRecurringCalendarEvents = (year) => {
  const recurring = [];
  for (let m = 0; m < 12; m += 1) {
    recurring.push(
      { id: `salary-day-${m+1}`, date: toISODateString(new Date(year, m, 1)), name: "Salary Credit Window", type: "cashflow", confidence: "system", focus: "Wallet top-up nudges", areas: ["Kharadi", "Wakad", "Hinjewadi"], offer: "Top-up reminder + loyalty bonus" },
      { id: `mid-month-${m+1}`, date: toISODateString(new Date(year, m, 15)), name: "Mid-Month Retention Push", type: "retention", confidence: "system", focus: "Prevent low-balance suspensions", areas: ["Hadapsar", "Chinchwad"], offer: "Auto-topup activation campaign" },
      { id: `month-end-${m+1}`, date: toISODateString(new Date(year, m, 28)), name: "Month-End Recovery Sprint", type: "recovery", confidence: "system", focus: "Win-back inactive high-value users", areas: ["Kharadi", "Aundh"], offer: "Reactivate this week for 7-day benefit" }
    );
    const firstSaturday = firstWeekdayOfMonth(year, m, 6);
    recurring.push({
      id: `society-sampling-${m+1}`,
      date: toISODateString(firstSaturday),
      name: "Society Sampling Saturday",
      type: "acquisition",
      confidence: "system",
      focus: "On-ground RWA trials and referrals",
      areas: ["Magarpatta", "Nanded City", "Pimple Saudagar"],
      offer: "Trial pack + referral wallet credit"
    });
  }
  return recurring;
};

const buildCalendarEvents = (year) => {
  const recurring = generateRecurringCalendarEvents(year);
  const festivals = FESTIVAL_EVENTS_2026.filter((e) => e.date.startsWith(`${year}-`));
  return [...festivals, ...recurring].sort((a, b) => a.date.localeCompare(b.date));
};

const routeSkillFromQuery = (query = "") => {
  const q = toKey(query);
  if (/(vs|versus|alternative|alternatives|competitor|country delight|katraj|amul|akshay|chitale)/.test(q)) return "competitor-alternatives";
  if (/(content|blog|reel|youtube|instagram|calendar|topic|post idea|pillar|seo)/.test(q)) return "content-strategy";
  if (/(script|psychology|behavior|behaviour|persuasion|churn|win back|reactivate|retention|objection|conversion|trial)/.test(q)) return "marketing-psychology";
  return "core";
};

const buildDataLayerSummary = (data) => {
  const d = data?.overview || {};
  const topAreas = Object.entries(data?.top_areas_by_revenue || {}).slice(0, 3).map(([name, stats]) => `${name} (Rs ${toInt(stats?.revenue).toLocaleString()})`);
  return [
    `DATA LAYER`,
    `- Total customers: ${toInt(d.total_customers).toLocaleString()}`,
    `- Active: ${toInt(d.active_customers).toLocaleString()} | Inactive: ${toInt(d.inactive_customers).toLocaleString()} | Suspended: ${toInt(d.suspended_customers).toLocaleString()}`,
    `- Revenue: Rs ${toInt(d.total_revenue).toLocaleString()} | Orders: ${toInt(d.total_orders).toLocaleString()}`,
    `- Top revenue areas: ${topAreas.join(", ") || "N/A"}`
  ].join("\n");
};

const buildCalendarLayerSummary = (events, todayIso) => {
  const upcoming = events.filter((e) => e.date >= todayIso).slice(0, 8);
  return [
    `CALENDAR LAYER (today: ${todayIso})`,
    `- Execute recommendations against real dates. Always anchor action windows to exact dates.`,
    ...upcoming.map((e) => `- ${e.date} | ${e.name} | ${e.focus} | Areas: ${(e.areas || []).join(", ")} | Offer: ${e.offer}`)
  ].join("\n");
};

const composeLayeredInstructions = ({ data, role, query, events, todayIso }) => {
  const skillKey = routeSkillFromQuery(query);
  const skill = MARKETING_SKILLS[skillKey] || MARKETING_SKILLS.core;
  const dataLayer = buildDataLayerSummary(data);
  const calendarLayer = buildCalendarLayerSummary(events, todayIso);
  const roleLayer = `ROLE LAYER\n- Current team: ${ROLES[role].title}\n- Focus: ${ROLES[role].focus}`;
  const skillLayer = `SKILL LAYER\n- Active strategy mode: ${skill.label}\n- Directive: ${skill.directive}`;
  const guardrailLayer = [
    `EXECUTION GUARDRAILS`,
    `- Always provide date-bound plans: This week / This month / Next month with exact dates.`,
    `- Assume timezone Asia/Kolkata and use local-date precision.`,
    `- Use Pune locality context first, then tactics.`,
    `- Keep premium A2 positioning intact in all offers and scripts.`,
    `- If calendar event confidence is tentative, label it as tentative.`
  ].join("\n");
  return `${SYSTEM_PROMPT(data, role)}\n\n${dataLayer}\n\n${calendarLayer}\n\n${roleLayer}\n\n${skillLayer}\n\n${guardrailLayer}`;
};

const inr = (n) => n >= 1e7 ? `Rs ${(n/1e7).toFixed(2)} Cr` : n >= 1e5 ? `Rs ${(n/1e5).toFixed(1)} L` : n >= 1000 ? `Rs ${(n/1000).toFixed(1)} K` : `Rs ${n}`;

const DATA_CACHE_KEY = "mrmilk_dataset_cache_v1";
const XLSX_LIB_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
const LLM_PROVIDER_KEY = "mrmilk_llm_provider";
const LLM_KEY_STORE = "mrmilk_llm_key";
const LLM_MODEL_STORE = "mrmilk_llm_model";
const AUTO_EXCEL_PATHS = [
  "./milkmaster1march.xlsx",
  "./milkmaster1march.csv",
  "/milkmaster1march.xlsx",
  "/milkmaster1march.csv",
  "../milkmaster1march.xlsx",
  "../milkmaster1march.csv"
];
const STATUS_COLORS = ["#44cc88", "#ff3333", "#ff5533", "#ff7744", "#ffaa33", "#4499ff", "#cc33ff", "#445566"];

const SOURCE_ALIAS = {
  facebook: "Facebook",
  "trade shows / events": "Trade Shows",
  "trade shows/events": "Trade Shows",
  googleadwords: "Google Ads",
  googleads: "Google Ads",
  "google ads": "Google Ads",
  "word of mouth": "Word of Mouth",
  "social media": "Social Media",
  "social ads": "Social Ads",
  "search engine": "Search Engine",
  reference: "Reference",
  friend: "Friend",
  campaign: "Campaign",
  "society activity": "Society Activity"
};

const COLUMN_ALIASES = {
  Name: ["name", "customer name", "customer", "client name"],
  Mobile: ["mobile", "mobile number", "phone", "phone number", "contact", "contact number"],
  Area: ["area", "locality", "region", "location"],
  Hub: ["hub", "route hub", "service hub"],
  "Sub. Status": ["sub status", "sub. status", "subscription status", "status"],
  "Total Orders": ["total orders", "orders", "order count", "total order count"],
  "Total Revenue": ["total revenue", "revenue", "lifetime revenue", "amount", "total amount"],
  "Wallet Balance": ["wallet balance", "wallet", "wallet amount"],
  "Last Delivery Date": ["last delivery date", "last delivery", "last delivered"],
  "Created Date": ["created date", "created on", "signup date", "register date"],
  DND: ["dnd", "do not disturb"],
  "Is Blocked": ["is blocked", "blocked"],
  "Payment Mode": ["payment mode", "payment", "payment type"],
  Source: ["source", "lead source", "channel"],
  "Delivery Boy": ["delivery boy", "delivery executive", "delivery partner", "delivery agent"],
  "Current Consumption": ["current consumption", "consumption", "daily liters", "daily litres", "liters", "litres"]
};

const toText = (value) => (value ?? "").toString().trim();
const toNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = toText(value).replace(/,/g, "");
  const match = text.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
};
const toInt = (value) => Math.round(toNumber(value));
const toPhone = (value) => toText(value).replace(/\.0$/, "");
const toKey = (value) => toText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const bump = (bucket, key, amount = 1) => { bucket[key] = (bucket[key] || 0) + amount; };
const sortDesc = (entries) => entries.sort((a, b) => b[1] - a[1]);
const toObject = (entries) => Object.fromEntries(entries);
const fmtDateLong = (dateValue) => new Date(dateValue).toLocaleDateString("en-IN", { month: "long", day: "numeric", year: "numeric" });

const normalizeRow = (row) => {
  const normalized = {};
  for (const [rawKey, rawValue] of Object.entries(row || {})) normalized[toKey(rawKey)] = rawValue;
  const pick = (aliases) => {
    for (const alias of aliases) {
      const value = normalized[toKey(alias)];
      if (!(value == null || value === "")) return value;
    }
    return "";
  };
  const result = {};
  for (const [target, aliases] of Object.entries(COLUMN_ALIASES)) result[target] = pick(aliases);
  if (!result.Name) result.Name = toText(row?.Name || row?.Customer || row?.CustomerName || "Unknown");
  if (!result.Mobile) result.Mobile = toText(row?.Mobile || row?.Phone || row?.Contact || "");
  if (!result.Area) result.Area = toText(row?.Area || row?.Locality || "Unknown Area");
  if (!result.Hub) result.Hub = toText(row?.Hub || "No Hub Assigned");
  if (!result["Sub. Status"]) result["Sub. Status"] = toText(row?.["Sub. Status"] || row?.Status || "Unknown");
  return result;
};

const excelSerialToDate = (serial) => {
  if (typeof serial !== "number" || !Number.isFinite(serial)) return null;
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  const dateInfo = new Date(utcValue * 1000);
  return Number.isNaN(dateInfo.getTime()) ? null : dateInfo;
};

const toISODate = (value) => {
  if (value == null || value === "") return "";
  let dateObj = null;
  if (value instanceof Date) dateObj = value;
  else if (typeof value === "number") dateObj = excelSerialToDate(value);
  else {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) dateObj = parsed;
  }
  if (!dateObj || Number.isNaN(dateObj.getTime())) return "";
  return toISODateString(dateObj);
};

const normalizeSource = (rawValue) => {
  const cleaned = toText(rawValue);
  if (!cleaned) return "";
  const normalized = cleaned.toLowerCase().replace(/\s+/g, " ");
  return SOURCE_ALIAS[normalized] || cleaned;
};

const loadCachedData = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DATA_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.overview?.total_customers ? parsed : null;
  } catch {
    return null;
  }
};

let xlsxLoadPromise = null;
const loadXlsx = async () => {
  if (typeof window === "undefined") throw new Error("Excel parsing needs browser context.");
  if (window.XLSX) return window.XLSX;
  if (!xlsxLoadPromise) {
    xlsxLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = XLSX_LIB_URL;
      script.async = true;
      script.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error("XLSX library failed to load.")));
      script.onerror = () => reject(new Error("Could not load XLSX parser from CDN."));
      document.head.appendChild(script);
    });
  }
  return xlsxLoadPromise;
};

const deriveDataFromRows = (rows, sourceDate) => {
  if (!Array.isArray(rows) || rows.length === 0) return DATA;

  const subscriptionStatus = {};
  const hubPerformance = {};
  const areaAgg = {};
  const paymentMode = {};
  const sourceAgg = {};
  const deliveryBoyAgg = {};

  let totalRevenue = 0;
  let totalOrders = 0;
  let totalWallet = 0;
  let maxWallet = 0;
  let walletPositive = 0;
  let walletZero = 0;
  let walletNegative = 0;
  let activeCustomers = 0;
  let inactiveCustomers = 0;
  let suspendedCustomers = 0;
  let trialCustomers = 0;
  let newCustomers = 0;
  let dndCustomers = 0;
  let blockedCustomers = 0;
  let consumptionTotal = 0;
  let consumptionCount = 0;
  let latestIsoDate = "";

  const customerRows = [];
  const inactiveRows = [];

  for (const row of rows) {
    const name = toText(row.Name) || "Unknown";
    const mobile = toPhone(row.Mobile);
    const area = toText(row.Area) || "Unknown Area";
    const hub = toText(row.Hub) || "No Hub Assigned";
    const subStatus = toText(row["Sub. Status"]) || "Unknown";
    const orders = toInt(row["Total Orders"]);
    const revenue = toInt(row["Total Revenue"]);
    const wallet = toInt(row["Wallet Balance"]);
    const lastDeliveryIso = toISODate(row["Last Delivery Date"]);

    bump(subscriptionStatus, subStatus);
    if (/^active/i.test(subStatus)) activeCustomers += 1;
    else if (/^inactive/i.test(subStatus)) inactiveCustomers += 1;
    else if (/^suspended/i.test(subStatus)) suspendedCustomers += 1;
    else if (/^trial/i.test(subStatus)) trialCustomers += 1;
    else if (/^new customer/i.test(subStatus)) newCustomers += 1;

    if (/^yes$/i.test(toText(row.DND))) dndCustomers += 1;
    if (/^blocked$/i.test(toText(row["Is Blocked"]))) blockedCustomers += 1;

    totalRevenue += revenue;
    totalOrders += orders;
    totalWallet += wallet;
    if (wallet > 0) walletPositive += 1;
    else if (wallet < 0) walletNegative += 1;
    else walletZero += 1;
    maxWallet = Math.max(maxWallet, wallet);

    if (!hubPerformance[hub]) hubPerformance[hub] = { customers: 0, revenue: 0, orders: 0 };
    hubPerformance[hub].customers += 1;
    hubPerformance[hub].revenue += revenue;
    hubPerformance[hub].orders += orders;

    if (!areaAgg[area]) areaAgg[area] = { customers: 0, revenue: 0 };
    areaAgg[area].customers += 1;
    areaAgg[area].revenue += revenue;

    const payMode = toText(row["Payment Mode"]) || "Unknown";
    bump(paymentMode, payMode);

    const source = normalizeSource(row.Source);
    if (source) bump(sourceAgg, source);

    const deliveryBoy = toText(row["Delivery Boy"]);
    if (deliveryBoy) bump(deliveryBoyAgg, deliveryBoy);

    const consumptionRaw = row["Current Consumption"];
    if (!(consumptionRaw == null || consumptionRaw === "")) {
      consumptionTotal += toNumber(consumptionRaw);
      consumptionCount += 1;
    }

    const candidateDate = toISODate(row["Created Date"]) || lastDeliveryIso;
    if (candidateDate && (!latestIsoDate || candidateDate > latestIsoDate)) latestIsoDate = candidateDate;

    const customer = {
      Name: name,
      Mobile: mobile,
      Area: area,
      Hub: hub,
      "Total Revenue": revenue,
      "Total Orders": orders,
      "Sub. Status": subStatus,
      "Wallet Balance": wallet
    };

    customerRows.push(customer);
    if (/inactive/i.test(subStatus)) {
      inactiveRows.push({
        Name: name,
        Mobile: mobile,
        Area: area,
        "Total Revenue": revenue,
        "Total Orders": orders,
        "Last Delivery": lastDeliveryIso || "N/A"
      });
    }
  }

  const dataDate = latestIsoDate ? fmtDateLong(latestIsoDate) : fmtDateLong(sourceDate || Date.now());
  const totalCustomers = rows.length;
  const avgRevenuePerCustomer = totalCustomers ? totalRevenue / totalCustomers : 0;
  const avgWalletBalance = totalCustomers ? totalWallet / totalCustomers : 0;
  const avgDailyLiters = consumptionCount ? consumptionTotal / consumptionCount : 0;

  return {
    data_date: dataDate,
    overview: {
      total_customers: totalCustomers,
      total_revenue: totalRevenue,
      total_orders: totalOrders,
      avg_revenue_per_customer: Number(avgRevenuePerCustomer.toFixed(2)),
      total_wallet_balance: totalWallet,
      active_customers: activeCustomers,
      inactive_customers: inactiveCustomers,
      suspended_customers: suspendedCustomers,
      trial_customers: trialCustomers,
      new_customers: newCustomers,
      dnd_customers: dndCustomers,
      blocked_customers: blockedCustomers
    },
    subscription_status: toObject(sortDesc(Object.entries(subscriptionStatus))),
    hub_performance: toObject(sortDesc(Object.entries(hubPerformance).map(([k, v]) => [k, v.revenue])).map(([k]) => [k, hubPerformance[k]])),
    top_areas_by_revenue: toObject(sortDesc(Object.entries(areaAgg).map(([k, v]) => [k, v.revenue])).slice(0, 15).map(([k]) => [k, areaAgg[k]])),
    wallet_stats: {
      customers_with_positive_wallet: walletPositive,
      customers_with_zero_wallet: walletZero,
      customers_with_negative_wallet: walletNegative,
      avg_wallet_balance: Number(avgWalletBalance.toFixed(2)),
      max_wallet_balance: maxWallet,
      total_wallet: totalWallet
    },
    payment_mode: toObject(sortDesc(Object.entries(paymentMode))),
    sources: toObject(sortDesc(Object.entries(sourceAgg)).slice(0, 10)),
    top_delivery_boys: toObject(sortDesc(Object.entries(deliveryBoyAgg)).slice(0, 10)),
    consumption: { avg_daily_liters: Number(avgDailyLiters.toFixed(3)), total_daily_liters: Number(consumptionTotal.toFixed(0)) },
    top_20_customers: customerRows.sort((a, b) => b["Total Revenue"] - a["Total Revenue"]).slice(0, 20),
    high_value_inactive: inactiveRows.sort((a, b) => b["Total Revenue"] - a["Total Revenue"]).slice(0, 5)
  };
};

const parseDatasetBuffer = async (arrayBuffer, sourceDate, fileName = "") => {
  const XLSX = await loadXlsx();
  const lowerName = toText(fileName).toLowerCase();
  const isCsv = lowerName.endsWith(".csv");
  const workbook = isCsv
    ? XLSX.read(new TextDecoder("utf-8").decode(arrayBuffer), { type: "string", cellDates: true })
    : XLSX.read(arrayBuffer, { type: "array", cellDates: true });

  const scoredSheets = workbook.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: "", raw: true });
    const keys = rows[0] ? Object.keys(rows[0]).map(toKey) : [];
    let score = rows.length;
    if (/customer|client|master|subscriber/i.test(name)) score += 60;
    if (keys.some(k => k.includes("mobile"))) score += 20;
    if (keys.some(k => k.includes("revenue") || k.includes("amount"))) score += 20;
    if (keys.some(k => k.includes("status"))) score += 20;
    return { name, rows, score };
  }).sort((a, b) => b.score - a.score);

  if (!scoredSheets.length) throw new Error("No worksheet found in the file.");
  const selected = scoredSheets[0];
  if (!selected.rows.length) throw new Error(`Sheet "${selected.name}" has no data rows.`);
  const normalizedRows = selected.rows.map(normalizeRow);
  return deriveDataFromRows(normalizedRows, sourceDate);
};

function parseMsg(text) {
  return text
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/\*\*(.+?)\*\*/g,'<strong style="color:#074069">$1</strong>')
    .replace(/`([^`]+)`/g,'<code style="background:#eef5fb;color:#074069;padding:1px 6px;border-radius:3px;font-size:12px;border:1px solid #d5e4f3;">$1</code>')
    .replace(/^# (.+)$/gm,'<div style="color:#074069;font-size:18px;font-weight:bold;margin:20px 0 10px;padding-bottom:8px;border-bottom:1px solid #c5d9ec;">$1</div>')
    .replace(/^## (.+)$/gm,'<div style="color:#d2ab67;font-size:14px;font-weight:bold;margin:16px 0 7px;">$1</div>')
    .replace(/^### (.+)$/gm,'<div style="color:#3f5f80;font-size:11px;font-weight:bold;margin:10px 0 4px;text-transform:uppercase;letter-spacing:1px;">$1</div>')
    .replace(/^\|(.+)\|$/gm,(match)=>{
      const cells=match.slice(1,-1).split("|");
      if(cells.every(c=>/^[\s\-:]+$/.test(c))) return "";
      const isH=cells.some(c=>c.trim().startsWith("**"));
      const tag=isH?"th":"td";
      const s=isH?"background:#074069;color:#ffffff;padding:8px 12px;font-size:12px;border:1px solid #c5d9ec;font-weight:bold;text-align:left;":"background:#ffffff;color:#3f5d7f;padding:7px 12px;font-size:12.5px;border:1px solid #d7e3f0;line-height:1.5;";
      return `<tr>${cells.map(c=>`<${tag} style="${s}">${c.trim().replace(/\*\*(.+?)\*\*/g,"$1")}</${tag}>`).join("")}</tr>`;
    })
    .replace(/(<tr>[\s\S]*?<\/tr>\n?)+/g,m=>`<div style="overflow-x:auto;margin:12px 0;border-radius:6px;overflow:hidden;"><table style="width:100%;border-collapse:collapse;">${m}</table></div>`)
    .replace(/^[-*] (.+)$/gm,'<div style="display:flex;gap:10px;margin:5px 0;"><span style="color:#d2ab67;flex-shrink:0;margin-top:1px;">></span><span style="color:#3f5d7f;line-height:1.65;">$1</span></div>')
    .replace(/^(\d+)\. (.+)$/gm,'<div style="display:flex;gap:10px;margin:6px 0;"><span style="color:#d2ab67;font-weight:bold;min-width:22px;flex-shrink:0;">$1.</span><span style="color:#3f5d7f;line-height:1.65;">$2</span></div>')
    .replace(/^---$/gm,'<hr style="border:none;border-top:1px solid #c5d9ec;margin:14px 0;"/>')
    .replace(/\n\n/g,"<br/><br/>").replace(/\n/g,"<br/>");
}

function doExport(html, roleKey, dataDate) {
  const win = window.open("","_blank");
  const r = ROLES[roleKey];
  win.document.write(`<!DOCTYPE html><html><head><title>Mr. Milk AI - Action Plan</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    body{font-family:'Montserrat',sans-serif;max-width:820px;margin:0 auto;padding:40px;color:#111;line-height:1.75;}
    .hdr{background:linear-gradient(135deg,#04488a,#073766);color:#f3cf6d;padding:24px 32px;margin:-40px -40px 32px;display:flex;align-items:center;gap:12px;}
    .hdr h1{margin:0;font-size:28px;color:#f6d778;font-family:'Montserrat',sans-serif;line-height:1;font-weight:800;}
    .meta{color:#5f7f9f;font-size:12px;margin-bottom:28px;padding-bottom:16px;border-bottom:1px solid #eee;}
    h2{color:#8B6914;margin:20px 0 8px;font-size:16px;}
    h3{color:#3f5f80;text-transform:uppercase;font-size:11px;letter-spacing:1px;margin:14px 0 6px;}
    strong{color:#000;}
    table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px;}
    th{background:#f5f0e0;padding:8px 12px;text-align:left;border:1px solid #20476d;color:#5a4000;}
    td{padding:7px 12px;border:1px solid #eee;}
    .btn{background:#8B6914;color:#fff;border:none;padding:10px 24px;border-radius:6px;cursor:pointer;font-size:14px;margin-top:28px;}
    @media print{.btn{display:none;}}
  </style></head><body>
  <div class="hdr"><span style="font-size:28px;">MM</span><div><h1>Mr. Milk AI - Action Plan</h1><div style="color:#f3cf6daa;font-size:12px;">Mittal Dairy Farms | A2 Premium | Pune & PCMC</div></div></div>
  <div class="meta">Generated: ${new Date().toLocaleString("en-IN")} &nbsp;|&nbsp; Role: ${r.title} &nbsp;|&nbsp; Data: ${dataDate || "Unknown"} &nbsp;|&nbsp; Awards: Times Power Brands | Lokmat Award 2024</div>
  ${html.replace(/<div style="color:#d2ab67;font-size:14px[^>]+>([^<]+)<\/div>/g,"<h2>$1</h2>")
        .replace(/<div style="color:#3f5f80[^>]+>([^<]+)<\/div>/g,"<h3>$1</h3>")
        .replace(/<strong style="color:#fff">([^<]+)<\/strong>/g,"<strong>$1</strong>")
        .replace(/<span style="color:#d2ab67[^>]+>><\/span>/g,"*")
        .replace(/<br\/><br\/>/g,"</p><p>").replace(/<br\/>/g," ")}
  <button class="btn" onclick="window.print()">Print / Save as PDF</button>
  </body></html>`);
  win.document.close();
}

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return <div style={{background:"#ffffff",border:"1px solid #cfe0f1",boxShadow:"0 8px 24px rgba(7,64,105,0.08)",borderRadius:8,padding:"10px 14px"}}>
    <div style={{color:"#074069",fontSize:12,fontWeight:"bold",marginBottom:4}}>{label}</div>
    {payload.map((p,i)=><div key={i} style={{color:"#37587a",fontSize:12}}>{p.name}: <strong style={{color:"#1f3550"}}>{typeof p.value==="number"?(p.name==="rev"?`Rs ${p.value}K`:p.value.toLocaleString()):p.value}</strong></div>)}
  </div>;
};

const extractResponseText = (data) => {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  if (!Array.isArray(data?.output)) return "";
  return data.output
    .filter(item => item.type === "message")
    .flatMap(item => item.content || [])
    .filter(item => item.type === "output_text")
    .map(item => item.text || "")
    .join("")
    .trim();
};

const didUseWebSearch = (data) => Array.isArray(data?.output) && data.output.some(item => item.type === "web_search_call");
const extractGeminiText = (data) => {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => p?.text || "").join("").trim();
};
const getDefaultModel = (provider) => provider === "gemini" ? "gemini-2.5-flash" : "gpt-4.1-mini";

const requestModelText = async ({ provider, model, apiKey, instructions, inputText, history = [] }) => {
  if (provider === "gemini") {
    const selectedModel = model || getDefaultModel("gemini");
    const contents = [
      ...history.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: toText(m.content) }]
      })),
      { role: "user", parts: [{ text: inputText }] }
    ];
    const geminiBody = {
      systemInstruction: { parts: [{ text: instructions }] },
      contents
    };
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
    const r = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody)
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message || `Gemini request failed (${r.status})`);
    const text = extractGeminiText(d);
    if (!text) throw new Error("No response text was returned by Gemini.");
    return { text, usedSearch: false };
  }

  const openAiBody = {
    model: model || getDefaultModel("openai"),
    instructions,
    input: [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: inputText }
    ]
  };
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey.trim()}`
    },
    body: JSON.stringify(openAiBody)
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || `OpenAI request failed (${r.status})`);
  const text = extractResponseText(d);
  if (!text) throw new Error("No response text was returned by the model.");
  return { text, usedSearch: didUseWebSearch(d) };
};

export default function App() {
  const [tab, setTab] = useState("dash");
  const [role, setRole] = useState("owner");
  const [msgs, setMsgs] = useState([]);
  const [inp, setInp] = useState("");
  const [chatControls, setChatControls] = useState(DEFAULT_CHAT_CONTROLS);
  const [showControlGuide, setShowControlGuide] = useState(false);
  const [pendingClarification, setPendingClarification] = useState(null);
  const [regenKey, setRegenKey] = useState("");
  const [chatNotice, setChatNotice] = useState("");
  const [appData, setAppData] = useState(() => loadCachedData() || DATA);
  const [dataSource, setDataSource] = useState(() => (loadCachedData() ? "Cached Excel snapshot" : "Built-in sample data"));
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [uploadMode, setUploadMode] = useState("override");
  const [stagedData, setStagedData] = useState(null);
  const [stagedSource, setStagedSource] = useState("");
  const [provider, setProvider] = useState(() => {
    if (typeof window === "undefined") return "gemini";
    return window.localStorage.getItem(LLM_PROVIDER_KEY) || "gemini";
  });
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(LLM_KEY_STORE) || window.localStorage.getItem("mrmilk_openai_key") || "";
  });
  const [model, setModel] = useState(() => {
    if (typeof window === "undefined") return getDefaultModel("gemini");
    return window.localStorage.getItem(LLM_MODEL_STORE) || window.localStorage.getItem("mrmilk_openai_model") || getDefaultModel("gemini");
  });
  const [loading, setLoading] = useState(false);
  const [calendarView, setCalendarView] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedDateIso, setSelectedDateIso] = useState(() => toISODateString(new Date()));
  const [calendarTypeFilter, setCalendarTypeFilter] = useState("all");
  const [calendarAreaFilter, setCalendarAreaFilter] = useState("all");
  const [calendarConfidenceFilter, setCalendarConfidenceFilter] = useState("all");
  const [calendarHideTentative, setCalendarHideTentative] = useState(false);
  const [calendarQuery, setCalendarQuery] = useState("");
  const chatScrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const [autoPinChat, setAutoPinChat] = useState(true);
  const rc = ROLES[role].color;

  const isChatNearBottom = () => {
    const el = chatScrollRef.current;
    if (!el) return true;
    return (el.scrollHeight - el.scrollTop - el.clientHeight) < 140;
  };
  const onChatScroll = () => {
    const nearBottom = isChatNearBottom();
    setAutoPinChat((prev) => (prev === nearBottom ? prev : nearBottom));
  };
  useEffect(() => {
    if (tab !== "chat") return;
    const el = chatScrollRef.current;
    if (!el || !autoPinChat) return;
    const frame = window.requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tab, autoPinChat, msgs.length, loading, regenKey]);
  useEffect(() => {
    setMsgs([]);
    setPendingClarification(null);
    setChatControls((prev) => ({ ...prev, persona: ROLE_DEFAULT_PERSONA[role] || prev.persona }));
  }, [role]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LLM_PROVIDER_KEY, provider);
  }, [provider]);
  useEffect(() => {
    const current = parseISODate(selectedDateIso);
    if (current.getFullYear() !== calendarView.year || current.getMonth() !== calendarView.month) {
      setSelectedDateIso(toISODateString(new Date(calendarView.year, calendarView.month, 1)));
    }
  }, [calendarView.year, calendarView.month, selectedDateIso]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LLM_KEY_STORE, apiKey);
  }, [apiKey]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LLM_MODEL_STORE, model);
  }, [model]);
  useEffect(() => {
    setModel((prev) => {
      if (!prev) return getDefaultModel(provider);
      if (provider === "gemini" && /gpt|o\d|claude/i.test(prev)) return getDefaultModel("gemini");
      if (provider === "openai" && /gemini/i.test(prev)) return getDefaultModel("openai");
      return prev;
    });
  }, [provider]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const tryAutoLoadWorkbook = async () => {
      setDataLoading(true);
      setDataError("");
      for (const path of AUTO_EXCEL_PATHS) {
        try {
          const res = await fetch(path, { cache: "no-store" });
          if (!res.ok) continue;
          const buffer = await res.arrayBuffer();
          const derived = await parseDatasetBuffer(buffer, Date.now(), path);
          if (cancelled) return;
          setAppData(derived);
          setDataSource(`Auto-loaded: ${path}`);
          window.localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(derived));
          setDataLoading(false);
          return;
        } catch {
          // try next path
        }
      }
      if (!cancelled) setDataLoading(false);
    };
    tryAutoLoadWorkbook();
    return () => { cancelled = true; };
  }, []);

  const loadWorkbookFromFile = async (file) => {
    if (!file) return;
    setDataLoading(true);
    setDataError("");
    try {
      const buffer = await file.arrayBuffer();
      const derived = await parseDatasetBuffer(buffer, file.lastModified || Date.now(), file.name);
      if (uploadMode === "override") {
        setAppData(derived);
        setStagedData(null);
        setStagedSource("");
        setDataSource(`Dataset override: ${file.name}`);
        if (typeof window !== "undefined") window.localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(derived));
      } else {
        setStagedData(derived);
        setStagedSource(file.name);
        setDataError("Loaded in compare mode. Recommended: override, so dashboard and AI use one source of truth.");
      }
    } catch (e) {
      setDataError(e?.message || "Could not parse dataset file.");
    }
    setDataLoading(false);
  };

  const onWorkbookSelected = async (event) => {
    const file = event.target.files?.[0];
    await loadWorkbookFromFile(file);
    if (event.target) event.target.value = "";
  };

  const resetToBuiltInData = () => {
    setAppData(DATA);
    setDataSource("Built-in sample data");
    setStagedData(null);
    setStagedSource("");
    setDataError("");
    if (typeof window !== "undefined") window.localStorage.removeItem(DATA_CACHE_KEY);
  };

  const applyStagedDataset = () => {
    if (!stagedData) return;
    setAppData(stagedData);
    setDataSource(`Dataset override: ${stagedSource}`);
    setStagedData(null);
    setStagedSource("");
    setDataError("");
    if (typeof window !== "undefined") window.localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(stagedData));
  };

  const compareSummary = useMemo(() => {
    if (!stagedData) return null;
    const base = appData.overview || {};
    const next = stagedData.overview || {};
    return {
      customers: toInt(next.total_customers) - toInt(base.total_customers),
      revenue: toInt(next.total_revenue) - toInt(base.total_revenue),
      active: toInt(next.active_customers) - toInt(base.active_customers),
      inactive: toInt(next.inactive_customers) - toInt(base.inactive_customers)
    };
  }, [stagedData, appData]);

  const todayIso = useMemo(() => toISODateString(new Date()), []);
  const calendarEvents = useMemo(() => {
    const y = new Date().getFullYear();
    return [...buildCalendarEvents(y - 1), ...buildCalendarEvents(y), ...buildCalendarEvents(y + 1)]
      .sort((a, b) => a.date.localeCompare(b.date));
  }, []);
  const calendarTypeOptions = useMemo(() => ["all", ...Array.from(new Set(calendarEvents.map((e) => e.type)))], [calendarEvents]);
  const calendarAreaOptions = useMemo(() => {
    const areaSet = new Set();
    calendarEvents.forEach((e) => (e.areas || []).forEach((a) => areaSet.add(a)));
    return ["all", ...Array.from(areaSet).sort((a, b) => a.localeCompare(b))];
  }, [calendarEvents]);
  const calendarConfidenceOptions = useMemo(() => ["all", ...Array.from(new Set(calendarEvents.map((e) => e.confidence)))], [calendarEvents]);
  const filteredCalendarEvents = useMemo(() => {
    const query = toKey(calendarQuery);
    return calendarEvents.filter((event) => {
      if (calendarTypeFilter !== "all" && event.type !== calendarTypeFilter) return false;
      if (calendarAreaFilter !== "all" && !(event.areas || []).includes(calendarAreaFilter)) return false;
      if (calendarConfidenceFilter !== "all" && event.confidence !== calendarConfidenceFilter) return false;
      if (calendarHideTentative && event.confidence === "tentative") return false;
      if (!query) return true;
      const haystack = toKey(`${event.name} ${event.focus} ${(event.areas || []).join(" ")} ${event.offer} ${event.type} ${event.confidence}`);
      return haystack.includes(query);
    }).sort((a, b) => a.date.localeCompare(b.date));
  }, [calendarEvents, calendarTypeFilter, calendarAreaFilter, calendarConfidenceFilter, calendarHideTentative, calendarQuery]);
  const selectedMonthStartIso = useMemo(() => toISODateString(new Date(calendarView.year, calendarView.month, 1)), [calendarView.year, calendarView.month]);
  const selectedMonthEndIso = useMemo(() => toISODateString(new Date(calendarView.year, calendarView.month + 1, 0)), [calendarView.year, calendarView.month]);
  const upcomingCalendarEvents = useMemo(() =>
    calendarEvents.filter((e) => e.date >= todayIso).sort((a, b) => a.date.localeCompare(b.date)),
    [calendarEvents, todayIso]
  );
  const selectedMonthEvents = useMemo(
    () => filteredCalendarEvents.filter((e) => e.date >= selectedMonthStartIso && e.date <= selectedMonthEndIso).sort((a, b) => a.date.localeCompare(b.date)),
    [filteredCalendarEvents, selectedMonthStartIso, selectedMonthEndIso]
  );
  const selectedMonthLeadEvent = useMemo(() => {
    const upcoming = selectedMonthEvents.filter((e) => e.date >= todayIso);
    return upcoming[0] || selectedMonthEvents[0] || null;
  }, [selectedMonthEvents, todayIso]);
  const selectedMonthPlaybookEvents = useMemo(() => {
    const monthStart = parseISODate(selectedMonthStartIso);
    const monthEnd = parseISODate(selectedMonthEndIso);
    const today = parseISODate(todayIso);
    const isCurrentMonth = today >= monthStart && today <= monthEnd;
    if (isCurrentMonth) {
      const upcoming = selectedMonthEvents.filter((e) => e.date >= todayIso);
      return upcoming.length ? upcoming : selectedMonthEvents;
    }
    return selectedMonthEvents;
  }, [selectedMonthEvents, selectedMonthStartIso, selectedMonthEndIso, todayIso]);
  const activeSkillHint = useMemo(() => routeSkillFromQuery(inp), [inp]);
  const eventsByDate = useMemo(() => {
    const grouped = {};
    filteredCalendarEvents.forEach((event) => {
      if (!grouped[event.date]) grouped[event.date] = [];
      grouped[event.date].push(event);
    });
    return grouped;
  }, [filteredCalendarEvents]);
  const monthGrid = useMemo(() => {
    const monthStart = new Date(calendarView.year, calendarView.month, 1);
    const startOffset = monthStart.getDay();
    const daysInMonth = new Date(calendarView.year, calendarView.month + 1, 0).getDate();
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    return Array.from({ length: totalCells }).map((_, idx) => {
      const dateNum = idx - startOffset + 1;
      const inMonth = dateNum >= 1 && dateNum <= daysInMonth;
      if (!inMonth) {
        return {
          iso: `pad-${calendarView.year}-${calendarView.month}-${idx}`,
          day: "",
          inMonth: false,
          isToday: false,
          isSelected: false,
          events: []
        };
      }
      const d = new Date(calendarView.year, calendarView.month, dateNum);
      const iso = toISODateString(d);
      const dayEvents = eventsByDate[iso] || [];
      return {
        iso,
        day: dateNum,
        inMonth: true,
        isToday: iso === todayIso,
        isSelected: iso === selectedDateIso,
        events: dayEvents
      };
    });
  }, [calendarView.year, calendarView.month, eventsByDate, todayIso, selectedDateIso]);
  const selectedDateEvents = useMemo(() => (eventsByDate[selectedDateIso] || []).sort((a, b) => a.date.localeCompare(b.date)), [eventsByDate, selectedDateIso]);
  const shiftCalendarMonth = (delta) => {
    setCalendarView((prev) => {
      let month = prev.month + delta;
      let year = prev.year;
      while (month < 0) { month += 12; year -= 1; }
      while (month > 11) { month -= 12; year += 1; }
      return { year, month };
    });
  };
  const jumpCalendarToToday = () => {
    const now = new Date();
    setCalendarView({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedDateIso(toISODateString(now));
  };

  const D = appData.overview || DATA.overview;
  const inactivePct = D.total_customers ? ((D.inactive_customers / D.total_customers) * 100).toFixed(1) : "0.0";
  const trialEnded = appData.subscription_status?.["Trial Ended"] || 0;
  const trialNotConverted = appData.subscription_status?.["Trial Not Converted"] || 0;
  const trialLoss = trialEnded + trialNotConverted;

  const areaData = useMemo(() => Object.entries(appData.top_areas_by_revenue || {})
    .map(([name, d]) => ({ name: name.length > 11 ? name.slice(0, 11) + "..." : name, rev: Math.round(toNumber(d?.revenue) / 1000), cust: toInt(d?.customers), full: name }))
    .sort((a, b) => b.rev - a.rev), [appData]);

  const statusData = useMemo(() => {
    const entries = sortDesc(Object.entries(appData.subscription_status || {}));
    const top = entries.slice(0, 7).map(([name, v], i) => ({ name, v, c: STATUS_COLORS[i % STATUS_COLORS.length] }));
    const otherTotal = entries.slice(7).reduce((sum, [, v]) => sum + toInt(v), 0);
    if (otherTotal > 0) top.push({ name: "Others", v: otherTotal, c: STATUS_COLORS[7] });
    return top;
  }, [appData]);

  const hubData = useMemo(() => Object.entries(appData.hub_performance || {})
    .map(([name, d]) => ({ name: name.length > 12 ? name.slice(0, 12) : name, rev: Math.round(toNumber(d?.revenue) / 100000), cust: toInt(d?.customers) }))
    .sort((a, b) => b.rev - a.rev), [appData]);

  const walletData = useMemo(() => [
    { name: "Positive", v: toInt(appData.wallet_stats?.customers_with_positive_wallet), c: "#44cc88" },
    { name: "Zero", v: toInt(appData.wallet_stats?.customers_with_zero_wallet), c: "#222240" },
    { name: "Negative", v: toInt(appData.wallet_stats?.customers_with_negative_wallet), c: "#ff4444" }
  ], [appData]);

  const srcData = useMemo(() => sortDesc(Object.entries(appData.sources || {}))
    .map(([name, value]) => ({ name: name.length > 9 ? name.slice(0, 9) + "..." : name, value: toInt(value) })), [appData]);

  const topSuspended = useMemo(() => (appData.top_20_customers || []).find(c => /suspend/i.test(toText(c["Sub. Status"]))) || (appData.top_20_customers || [])[0], [appData]);
  const inactiveHighlights = useMemo(() => (appData.high_value_inactive || []).slice(0, 4), [appData]);
  const topAreaNames = useMemo(() => Object.keys(appData.top_areas_by_revenue || {}).slice(0, 3), [appData]);
  const calendarCampaignCards = useMemo(() => selectedMonthEvents.slice(0, 31).map((event) => {
    const areaList = event.areas?.length ? event.areas.join(", ") : (topAreaNames.join(", ") || "Top revenue areas");
    const dateTag = formatDateLongIso(event.date);
    return {
      ...event,
      areaList,
      dateTag,
      whatsapp: `Namaskar from Mr. Milk. ${event.name} (${dateTag}) prep offer: ${event.offer}. Reply YES to reserve your premium A2 slot.`
    };
  }), [selectedMonthEvents, topAreaNames]);
  const applyContextPreset = (preset) => {
    if (!preset?.controls) return;
    setChatControls((prev) => ({ ...prev, ...preset.controls }));
    setChatNotice(`Applied preset: ${preset.label}. Use when: ${preset.use_when}.`);
  };

  const send = async (text) => {
    const q = text || inp.trim();
    if (!q || loading) return;
    setAutoPinChat(true);
    const isPreset = Boolean(text);
    setInp("");
    setTab("chat");
    const next = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    setChatNotice("");
    if (!apiKey.trim()) {
      setMsgs([...next, { role: "assistant", content: `Please add your ${provider === "gemini" ? "Gemini" : "OpenAI"} API key below to continue.`, error: true }]);
      return;
    }

    const knownAreas = Object.keys(appData?.top_areas_by_revenue || {});
    if (!pendingClarification && !isPreset && isVagueQuery(q, knownAreas)) {
      const clarifier = buildClarifyingQuestion(role);
      setMsgs([...next, { role: "assistant", content: clarifier, isClarifier: true }]);
      setPendingClarification({ base_query: q, created_at: new Date().toISOString() });
      return;
    }

    const resolvedQuery = pendingClarification && !isPreset
      ? `${pendingClarification.base_query}\nUser clarification: ${q}`
      : q;
    setPendingClarification(null);
    setLoading(true);

    try {
      const currentTodayIso = toISODateString(new Date());
      const controlsSnapshot = { ...chatControls };
      const personaPlaybook = PERSONA_PLAYBOOKS[controlsSnapshot.persona] || PERSONA_PLAYBOOKS.crm_specialist;
      const analysisPacket = buildAnalysisEnginePacket(appData, controlsSnapshot, currentTodayIso);
      const routedSkill = routeSkillFromQuery(resolvedQuery);
      const instructions = buildStructuredSystemInstructions({
        role,
        controls: controlsSnapshot,
        personaPlaybook,
        todayIso: currentTodayIso
      });
      const recentHistory = next
        .filter((m) => m.role === "user")
        .slice(-4)
        .map((m) => ({ role: "user", content: toText(m.content).slice(0, 1200) }));
      const writerPayload = JSON.stringify({
        task: "Generate world-class strategic reply for Mr. Milk from analysis packet only.",
        query: resolvedQuery,
        controls: controlsSnapshot,
        persona: personaPlaybook.label,
        skill_mode: routedSkill,
        analysis_packet: analysisPacket,
        required_keys: STRUCTURED_SECTION_KEYS
      }, null, 2);

      let firstAttempt = await requestModelText({
        provider,
        model,
        apiKey,
        instructions,
        inputText: writerPayload,
        history: recentHistory
      });
      let parsed = parseJsonFromText(firstAttempt.text);
      let validated = validateStructuredResponse(parsed);
      let quality = validated.ok ? scoreStructuredResponse(validated.data, analysisPacket) : { score: 0, issues: ["Schema invalid"] };
      let repaired = false;

      if (!validated.ok || quality.score < 72) {
        repaired = true;
        const repairInstructions = `${instructions}\nYou are in REPAIR MODE. Fix the previous output to exact schema and improve weak sections.`;
        const repairPayload = JSON.stringify({
          task: "Repair the output to strict schema",
          original_query: resolvedQuery,
          schema_errors: validated.errors,
          quality_issues: quality.issues,
          previous_output: firstAttempt.text,
          analysis_packet: analysisPacket,
          required_keys: STRUCTURED_SECTION_KEYS
        }, null, 2);
        const repairAttempt = await requestModelText({
          provider,
          model,
          apiKey,
          instructions: repairInstructions,
          inputText: repairPayload,
          history: recentHistory
        });
        firstAttempt = repairAttempt;
        parsed = parseJsonFromText(repairAttempt.text);
        validated = validateStructuredResponse(parsed);
        quality = validated.ok ? scoreStructuredResponse(validated.data, analysisPacket) : { score: 0, issues: ["Repair schema invalid"] };
      }

      if (!validated.ok) {
        throw new Error(`Structured response validation failed: ${validated.errors.join(" | ")}`);
      }

      const structured = validated.data;
      const markdown = structuredToMarkdown(structured);
      setMsgs([
        ...next,
        {
          role: "assistant",
          content: markdown,
          html: parseMsg(markdown),
          structured,
          searched: firstAttempt.usedSearch,
          skill: routedSkill,
          qualityScore: quality.score,
          qualityIssues: quality.issues,
          context: {
            query: resolvedQuery,
            role,
            controls: controlsSnapshot,
            persona_key: controlsSnapshot.persona,
            analysis_packet: analysisPacket,
            today_iso: currentTodayIso,
            routed_skill: routedSkill
          }
        }
      ]);

      if (repaired) setChatNotice(`Quality gate auto-repaired output. Final score: ${quality.score}/100.`);
    } catch (e) {
      setMsgs([...next, { role: "assistant", content: `Warning: ${e.message}`, error: true }]);
      setChatNotice(`Model error: ${e.message}`);
    }
    setLoading(false);
  };

  const regenerateSection = async (messageIndex, sectionKey) => {
    if (!apiKey.trim()) {
      setChatNotice(`Add ${provider === "gemini" ? "Gemini" : "OpenAI"} API key before section regenerate.`);
      return;
    }
    if (!REGENERABLE_SECTIONS.includes(sectionKey) || regenKey || loading) return;
    const target = msgs[messageIndex];
    if (!target?.structured || !target?.context) return;

    const token = `${messageIndex}:${sectionKey}`;
    setRegenKey(token);
    setAutoPinChat(true);
    setChatNotice(`Regenerating ${SECTION_LABELS[sectionKey] || sectionKey}...`);
    try {
      const context = target.context;
      const controls = asObject(context.controls);
      const personaPlaybook = PERSONA_PLAYBOOKS[context.persona_key] || PERSONA_PLAYBOOKS.crm_specialist;
      const instructions = `${buildStructuredSystemInstructions({
        role: context.role || role,
        controls,
        personaPlaybook,
        todayIso: context.today_iso || toISODateString(new Date())
      })}\nYou must regenerate ONLY the requested section. Return JSON with one key: "${sectionKey}".`;

      const sectionPayload = JSON.stringify({
        task: `Regenerate only ${sectionKey}`,
        query: context.query,
        section_key: sectionKey,
        current_response: target.structured,
        analysis_packet: context.analysis_packet
      }, null, 2);

      const regenAttempt = await requestModelText({
        provider,
        model,
        apiKey,
        instructions,
        inputText: sectionPayload,
        history: [{ role: "user", content: `Regenerate section ${sectionKey} for query: ${context.query}` }]
      });
      const parsed = parseJsonFromText(regenAttempt.text);
      const candidate = parsed?.[sectionKey] ?? parsed?.section_data ?? parsed;
      const sectionValidation = validateSectionData(sectionKey, candidate);
      if (!sectionValidation.ok) {
        throw new Error(sectionValidation.error);
      }

      setMsgs((prev) => prev.map((m, idx) => {
        if (idx !== messageIndex) return m;
        const updatedStructured = {
          ...m.structured,
          [sectionKey]: sectionValidation.normalized
        };
        const quality = scoreStructuredResponse(updatedStructured, m?.context?.analysis_packet || {});
        const markdown = structuredToMarkdown(updatedStructured);
        return {
          ...m,
          structured: updatedStructured,
          qualityScore: quality.score,
          qualityIssues: quality.issues,
          content: markdown,
          html: parseMsg(markdown)
        };
      }));
      setChatNotice(`${SECTION_LABELS[sectionKey] || sectionKey} regenerated successfully.`);
    } catch (e) {
      setChatNotice(`Regenerate failed: ${e.message}`);
    }
    setRegenKey("");
  };

  return (
    <div style={{height:"100vh",background:"linear-gradient(180deg, #fdfefe 0%, #f4f9ff 45%, #eef5fb 100%)",color:"#1f3550",fontFamily:"'Montserrat', sans-serif",display:"flex",flexDirection:"column",overflow:"hidden",position:"relative"}}>
      <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:0}}>
        <div style={{position:"absolute",top:-140,right:-120,width:420,height:420,borderRadius:"50%",background:"radial-gradient(circle, rgba(210,171,103,0.19), rgba(210,171,103,0))"}} />
        <div style={{position:"absolute",bottom:-180,left:-120,width:460,height:460,borderRadius:"50%",background:"radial-gradient(circle, rgba(7,64,105,0.12), rgba(7,64,105,0))"}} />
        <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg, rgba(7,64,105,0.02), rgba(7,64,105,0))"}} />
      </div>

      {/* Header */}
      <div style={{borderTop:"4px solid #074069",borderBottom:"1px solid #d5e4f3",padding:"10px 18px",background:"#ffffff",backdropFilter:"blur(6px)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,position:"relative",zIndex:1}}>
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <img src="/MrMilkLogo.png" alt="Mr. Milk" style={{height:52,width:"auto",objectFit:"contain"}} />
          <div>
            <div style={{color:"#074069",fontSize:24,fontWeight:800,lineHeight:1,fontFamily:"'Montserrat', sans-serif"}}>Mr. Milk AI</div>
            <div title={BRAND_CONTEXT.headline} style={{color:"#567796",fontSize:10,letterSpacing:1.2,textTransform:"uppercase",maxWidth:420,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{BRAND_CONTEXT.headline}</div>
          </div>
          <div style={{display:"flex",gap:4,marginLeft:6,flexWrap:"wrap"}}>
            {["Times Power Brands", "Lokmat 2024", "Country Delight pressure in Kharadi"].map((t,i)=>(
              <span key={i} style={{background:i<2?"#d2ab6714":"#fff0ed",border:`1px solid ${i<2?"#d2ab6755":"#ffc7bc"}`,borderRadius:20,padding:"2px 8px",color:i<2?"#8b6914":"#b74a37",fontSize:9}}>{t}</span>
            ))}
            <span title={BRAND_CONTEXT.meta} style={{background:"#07406912",border:"1px solid #a7c1db",borderRadius:20,padding:"2px 8px",color:"#074069",fontSize:9}}>Brand DNA synced from {BRAND_CONTEXT.source}</span>
          </div>
        </div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end"}}>
          {Object.entries(ROLES).map(([k,r])=>(
            <button key={k} onClick={()=>setRole(k)} style={{background:role===k?r.color+"20":"#ffffff",border:`1px solid ${role===k?r.color+"66":"#c7d7e8"}`,borderRadius:7,color:role===k?r.color:"#567796",padding:"4px 9px",cursor:"pointer",fontSize:10,fontFamily:"'Montserrat', sans-serif",fontWeight:600}}>
              {r.icon} {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",borderBottom:"1px solid #c4daee",background:"#ffffff",flexShrink:0,position:"relative",zIndex:1}}>
        {[{id:"dash",label:"Dashboard"},{id:"calendar",label:"Calendar OS"},{id:"chat",label:`AI Chat${msgs.length?" ("+msgs.filter(m=>m.role==="assistant").length+")":""}`}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{background:"transparent",border:"none",borderBottom:`3px solid ${tab===t.id?rc:"transparent"}`,color:tab===t.id?rc:"#4d5b78",padding:"9px 18px",cursor:"pointer",fontSize:12,fontFamily:"'Montserrat', sans-serif",fontWeight:700}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* DASHBOARD TAB */}
      {tab==="dash" && (
        <div style={{flex:1,overflowY:"auto",padding:"14px 18px",position:"relative",zIndex:1}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:10,flexWrap:"wrap"}}>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:10,color:"#5f7898"}}>Data Date: <strong style={{color:"#1f3550"}}>{appData.data_date || "Unknown"}</strong></span>
              <span style={{fontSize:10,color:"#6e85a8"}}>{dataSource}</span>
              {dataLoading && <span style={{fontSize:10,color:"#4499ff"}}>Loading workbook...</span>}
              {dataError && <span style={{fontSize:10,color:"#ff6666"}}>{dataError}</span>}
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>fileInputRef.current?.click()} style={{background:"#ffffff",border:"1px solid #c7d9ea",borderRadius:8,color:"#2f4f70",padding:"5px 10px",cursor:"pointer",fontSize:10,fontFamily:"'Montserrat', sans-serif"}}>
                Upload CSV/XLSX
              </button>
              <button onClick={resetToBuiltInData} style={{background:"#ffffff",border:"1px solid #c7d9ea",borderRadius:8,color:"#3f5f80",padding:"5px 10px",cursor:"pointer",fontSize:10,fontFamily:"'Montserrat', sans-serif"}}>
                Reset Data
              </button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={onWorkbookSelected} style={{display:"none"}} />
            </div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10,flexWrap:"wrap",background:"#f4f9ff",border:"1px solid #cfe0f1",padding:"8px 10px",borderRadius:10}}>
            <span style={{fontSize:10,color:"#074069",fontWeight:"bold"}}>New dataset available:</span>
            <label style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"#284a6b"}}>
              <input type="radio" checked={uploadMode==="override"} onChange={()=>setUploadMode("override")} />
              Override current dataset (Recommended)
            </label>
            <label style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"#4f6f93"}}>
              <input type="radio" checked={uploadMode==="compare"} onChange={()=>setUploadMode("compare")} />
              Compare only (no override)
            </label>
            <span style={{fontSize:10,color:"#5c7897"}}>Override is recommended because dashboard and AI stay aligned to one source of truth.</span>
          </div>
          {stagedData && compareSummary && (
            <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:12,background:"#fff8ec",border:"1px solid #ead4ab",borderRadius:10,padding:"10px 12px"}}>
              <strong style={{color:"#6d4f18",fontSize:11}}>Staged dataset: {stagedSource}</strong>
              <span style={{fontSize:10,color:"#6d4f18"}}>Customers delta: {compareSummary.customers >= 0 ? "+" : ""}{compareSummary.customers}</span>
              <span style={{fontSize:10,color:"#6d4f18"}}>Revenue delta: {compareSummary.revenue >= 0 ? "+" : ""}{inr(compareSummary.revenue)}</span>
              <span style={{fontSize:10,color:"#6d4f18"}}>Active delta: {compareSummary.active >= 0 ? "+" : ""}{compareSummary.active}</span>
              <button onClick={applyStagedDataset} style={{background:"#d2ab67",border:"none",borderRadius:8,padding:"5px 9px",fontSize:10,fontWeight:"bold",cursor:"pointer"}}>
                Apply override now
              </button>
            </div>
          )}
          {/* KPIs */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(165px,1fr))",gap:8,marginBottom:12}}>
            {[
              {l:"Total Customers",v:toInt(D.total_customers).toLocaleString(),c:"#d2ab67",s:dataSource},
              {l:"Active",v:`${toInt(D.active_customers).toLocaleString()} (${D.total_customers ? ((D.active_customers/D.total_customers)*100).toFixed(1) : "0.0"}%)`,c:"#ff4444",s:`${inactivePct}% inactive`},
              {l:"Lifetime Revenue",v:inr(toInt(D.total_revenue)),c:"#44cc88",s:`${toInt(D.total_orders).toLocaleString()} orders`},
              {l:"Daily Milk",v:`${toInt(appData.consumption?.total_daily_liters).toLocaleString()} L`,c:"#4499ff",s:`Avg ${toNumber(appData.consumption?.avg_daily_liters).toFixed(2)}L/customer`},
              {l:"Wallet Float",v:inr(toInt(D.total_wallet_balance)),c:"#ffaa44",s:`${toInt(appData.wallet_stats?.customers_with_positive_wallet).toLocaleString()} topped up`},
              {l:"Trial Not Conv.",v:trialLoss ? `${((trialNotConverted/trialLoss)*100).toFixed(1)}%` : "N/A",c:"#cc44ff",s:`${toInt(trialEnded).toLocaleString()} trials ended`},
            ].map(({l,v,c,s})=>(
              <div key={l} style={{background:"#ffffff",border:"1px solid #d7e3f0",borderRadius:10,padding:"11px 10px"}}>
                <div style={{color:c,fontSize:13,fontWeight:"bold",marginBottom:2}}>{v}</div>
                <div style={{color:"#2e2e40",fontSize:10,marginBottom:1}}>{l}</div>
                <div style={{color:"#222230",fontSize:10}}>{s}</div>
              </div>
            ))}
          </div>

          {/* Alerts */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:8,marginBottom:12}}>
            <div style={{background:"rgba(255,50,50,0.06)",border:"1px solid rgba(255,50,50,0.18)",borderRadius:10,padding:"10px 13px"}}>
              <div style={{color:"#ff5544",fontSize:11,fontWeight:"bold",marginBottom:4}}>Urgent: Call today - #1 customer suspended</div>
              {topSuspended ? (
                <div style={{color:"#557394",fontSize:11.5,lineHeight:1.7}}>
                  <strong style={{color:"#1f3550"}}>{topSuspended.Name}</strong> | {topSuspended.Area}<br/>
                  {inr(topSuspended["Total Revenue"])} lifetime | {toInt(topSuspended["Total Orders"]).toLocaleString()} orders<br/>
                  Wallet: <strong style={{color:"#ff5544"}}>{inr(topSuspended["Wallet Balance"])}</strong><br/>
                  Call <strong style={{color:"#d2ab67"}}>{topSuspended.Mobile || "N/A"}</strong>
                </div>
              ) : (
                <div style={{color:"#777",fontSize:11.5}}>No suspended customer found in current dataset.</div>
              )}
            </div>
            <div style={{background:"rgba(255,150,0,0.06)",border:"1px solid rgba(255,150,0,0.18)",borderRadius:10,padding:"10px 13px"}}>
              <div style={{color:"#ff9944",fontSize:11,fontWeight:"bold",marginBottom:4}}>Competitive threats now active</div>
              <div style={{color:"#557394",fontSize:11.5,lineHeight:1.7}}><strong style={{color:"#1f3550"}}>Country Delight</strong> - Kharadi, Hinjewadi, Wakad<br/><strong style={{color:"#1f3550"}}>Akshayakalpa</strong> - Aundh, Koregaon Park<br/><strong style={{color:"#1f3550"}}>Katraj Dairy</strong> - Kothrud, Deccan<br/><strong style={{color:"#1f3550"}}>Amul Home</strong> - targeting low-wallet segment</div>
            </div>
            <div style={{background:"rgba(100,100,255,0.06)",border:"1px solid rgba(100,100,255,0.18)",borderRadius:10,padding:"10px 13px"}}>
              <div style={{color:"#5f7f9f",fontSize:11,fontWeight:"bold",marginBottom:4}}>High-value inactive priority list</div>
              <div style={{color:"#557394",fontSize:11.5,lineHeight:1.7}}>
                {inactiveHighlights.length ? inactiveHighlights.map((c, i) => (
                  <div key={i}>{c.Name} - {inr(c["Total Revenue"])} - {c.Area}</div>
                )) : "No inactive list available in current dataset"}
              </div>
            </div>
          </div>

          {/* Charts row 1 */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:10,marginBottom:10}}>
            <div style={{background:"#ffffff",border:"1px solid #d7e3f0",borderRadius:12,padding:"14px"}}>
              <div style={{color:"#d2ab67",fontSize:12,fontWeight:"bold",marginBottom:10}}>Revenue by area (Rs thousands)</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={areaData} margin={{bottom:42,right:8}}>
                  <XAxis dataKey="name" tick={{fill:"#484858",fontSize:9}} angle={-40} textAnchor="end" interval={0}/>
                  <YAxis tick={{fill:"#383848",fontSize:9}}/>
                  <Tooltip content={<Tip/>}/>
                  <Bar dataKey="rev" name="rev" fill="#d2ab67" radius={[3,3,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{background:"#ffffff",border:"1px solid #d7e3f0",borderRadius:12,padding:"14px"}}>
              <div style={{color:"#d2ab67",fontSize:12,fontWeight:"bold",marginBottom:8}}>Customer status breakdown</div>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart><Pie data={statusData.map(s=>({name:s.name,value:s.v}))} cx="50%" cy="50%" innerRadius={45} outerRadius={72} dataKey="value" paddingAngle={1.5}>
                  {statusData.map((e,i)=><Cell key={i} fill={e.c}/>)}
                </Pie><Tooltip formatter={(v,n)=>[v.toLocaleString(),n]}/></PieChart>
              </ResponsiveContainer>
              <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:4}}>
                {statusData.map(s=><span key={s.name} style={{display:"flex",alignItems:"center",gap:3,fontSize:9,color:"#444"}}><span style={{width:6,height:6,borderRadius:"50%",background:s.c,display:"block"}}/>{s.name}</span>)}
              </div>
            </div>
          </div>

          {/* Charts row 2 */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:10,marginBottom:10}}>
            <div style={{background:"#ffffff",border:"1px solid #d7e3f0",borderRadius:12,padding:"14px"}}>
              <div style={{color:"#d2ab67",fontSize:12,fontWeight:"bold",marginBottom:8}}>Hub revenue (Rs lakh)</div>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={hubData} margin={{bottom:28,right:8}}>
                  <XAxis dataKey="name" tick={{fill:"#484858",fontSize:9}} angle={-20} textAnchor="end" interval={0}/>
                  <YAxis tick={{fill:"#383848",fontSize:9}}/>
                  <Tooltip content={<Tip/>}/>
                  <Bar dataKey="rev" name="rev (Rs L)" fill="#44cc88" radius={[3,3,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{background:"#ffffff",border:"1px solid #d7e3f0",borderRadius:12,padding:"14px"}}>
              <div style={{color:"#d2ab67",fontSize:12,fontWeight:"bold",marginBottom:8}}>Wallet health</div>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart><Pie data={walletData.map(w=>({name:w.name,value:w.v}))} cx="50%" cy="50%" outerRadius={55} dataKey="value" paddingAngle={3}>
                  {walletData.map((e,i)=><Cell key={i} fill={e.c}/>)}
                </Pie><Tooltip formatter={(v)=>[v.toLocaleString(),"customers"]}/></PieChart>
              </ResponsiveContainer>
              {walletData.map(w=><div key={w.name} style={{display:"flex",justifyContent:"space-between",fontSize:11,marginTop:3}}>
                <span style={{color:"#444",display:"flex",alignItems:"center",gap:3}}><span style={{width:7,height:7,borderRadius:"50%",background:w.c,display:"block"}}/>{w.name}</span>
                <strong style={{color:w.c}}>{w.v.toLocaleString()}</strong>
              </div>)}
            </div>
            <div style={{background:"#ffffff",border:"1px solid #d7e3f0",borderRadius:12,padding:"14px"}}>
              <div style={{color:"#d2ab67",fontSize:12,fontWeight:"bold",marginBottom:8}}>Acquisition sources</div>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={srcData} layout="vertical" margin={{right:20,left:0}}>
                  <XAxis type="number" tick={{fill:"#383848",fontSize:9}}/>
                  <YAxis dataKey="name" type="category" tick={{fill:"#484858",fontSize:9}} width={65}/>
                  <Tooltip content={<Tip/>}/>
                  <Bar dataKey="value" name="customers" fill="#4499ff" radius={[0,3,3,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top customers table */}
          <div style={{background:"#ffffff",border:"1px solid #d7e3f0",borderRadius:12,padding:"14px"}}>
            <div style={{color:"#d2ab67",fontSize:12,fontWeight:"bold",marginBottom:10}}>Top 10 customers - lifetime revenue</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr>{["Name","Mobile","Area","Revenue","Orders","Status","Wallet"].map(h=><th key={h} style={{background:"#074069",color:"#ffffff",padding:"7px 11px",textAlign:"left",border:"1px solid #c7d9ea",fontSize:11}}>{h}</th>)}</tr></thead>
                <tbody>{(appData.top_20_customers || []).slice(0, 10).map((c,i)=>(
                  <tr key={i}>
                    <td style={{background:"#ffffff",color:"#20476d",padding:"6px 11px",border:"1px solid #d7e3f0"}}>{c.Name}</td>
                    <td style={{background:"#ffffff",color:"#d2ab67",padding:"6px 11px",border:"1px solid #d7e3f0",fontFamily:"monospace",fontSize:11}}>{c.Mobile}</td>
                    <td style={{background:"#ffffff",color:"#5f7f9f",padding:"6px 11px",border:"1px solid #d7e3f0"}}>{c.Area}</td>
                    <td style={{background:"#ffffff",color:"#44cc88",padding:"6px 11px",border:"1px solid #d7e3f0",fontWeight:"bold"}}>{inr(c["Total Revenue"])}</td>
                    <td style={{background:"#ffffff",color:"#5f7f9f",padding:"6px 11px",border:"1px solid #d7e3f0",textAlign:"center"}}>{c["Total Orders"]}</td>
                    <td style={{background:"#ffffff",padding:"6px 11px",border:"1px solid #d7e3f0"}}><span style={{color:c["Sub. Status"].includes("Active")?"#44cc88":c["Sub. Status"].includes("Suspend")?"#ff5544":"#ff9944",fontSize:11}}>{c["Sub. Status"]}</span></td>
                    <td style={{background:"#ffffff",color:toNumber(c["Wallet Balance"])<0?"#ff5544":"#5f7f9f",padding:"6px 11px",border:"1px solid #d7e3f0"}}>{inr(toInt(c["Wallet Balance"]))}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CALENDAR TAB */}
      {tab==="calendar" && (
        <div style={{flex:1,overflowY:"auto",padding:"14px 18px",position:"relative",zIndex:1}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10,marginBottom:12}}>
            <div style={{background:"linear-gradient(145deg, #fdfefe, #edf5ff)",border:"1px solid #cfe0f1",borderRadius:12,padding:"12px 14px",boxShadow:"0 8px 20px rgba(7,64,105,0.06)"}}>
              <div style={{color:"#6284a6",fontSize:10,textTransform:"uppercase",letterSpacing:1}}>Today</div>
              <div style={{color:"#074069",fontFamily:"'Montserrat', sans-serif",fontSize:22,lineHeight:1.1}}>{formatDateLongIso(todayIso)}</div>
              <div style={{color:"#6d87a9",fontSize:11,marginTop:4}}>Execution engine anchored on exact dates</div>
            </div>
            <div style={{background:"linear-gradient(145deg, #ffffff, #f4fbf6)",border:"1px solid #cfe7d5",borderRadius:12,padding:"12px 14px",boxShadow:"0 8px 20px rgba(26,102,55,0.05)"}}>
              <div style={{color:"#4e7d5f",fontSize:10,textTransform:"uppercase",letterSpacing:1}}>Lead Event In This Month</div>
              <div style={{color:"#1f5b34",fontSize:17,fontWeight:"bold"}}>{selectedMonthLeadEvent?.name || "No event in this month"}</div>
              <div style={{color:"#5e8f6f",fontSize:11,marginTop:4}}>
                {selectedMonthLeadEvent ? `${formatDateLongIso(selectedMonthLeadEvent.date)} (${daysBetween(todayIso, selectedMonthLeadEvent.date)} days)` : "Adjust filters or add monthly events"}
              </div>
            </div>
            <div style={{background:"linear-gradient(145deg, #fffdf7, #fff3dc)",border:"1px solid #ead4ab",borderRadius:12,padding:"12px 14px",boxShadow:"0 8px 20px rgba(139,104,20,0.07)"}}>
              <div style={{color:"#97753a",fontSize:10,textTransform:"uppercase",letterSpacing:1}}>Selected Month Events</div>
              <div style={{color:"#8b6914",fontSize:22,fontWeight:"bold"}}>{selectedMonthEvents.length}</div>
              <div style={{color:"#97753a",fontSize:11,marginTop:4}}>Month-wise campaigns from your selected month</div>
            </div>
            <div style={{background:"linear-gradient(145deg, #ffffff, #f5f8ff)",border:"1px solid #d5def4",borderRadius:12,padding:"12px 14px",boxShadow:"0 8px 20px rgba(55,67,128,0.06)"}}>
              <div style={{color:"#6b6e9b",fontSize:10,textTransform:"uppercase",letterSpacing:1}}>Skill Routing</div>
              <div style={{color:"#3c3f75",fontSize:16,fontWeight:"bold"}}>{MARKETING_SKILLS[activeSkillHint]?.label || MARKETING_SKILLS.core.label}</div>
              <div style={{color:"#7d81b3",fontSize:11,marginTop:4}}>Prompt mode auto-matched from your question</div>
            </div>
          </div>

          <div style={{background:"#ffffff",border:"1px solid #c4daee",borderRadius:12,padding:"10px 12px",marginBottom:12}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8}}>
              <select value={calendarTypeFilter} onChange={(e) => setCalendarTypeFilter(e.target.value)} style={{background:"#f8fbff",border:"1px solid #c4daee",borderRadius:8,color:"#23486b",padding:"7px 9px",fontSize:11}}>
                {calendarTypeOptions.map((t) => <option key={t} value={t}>{t === "all" ? "All event types" : `Type: ${t}`}</option>)}
              </select>
              <select value={calendarAreaFilter} onChange={(e) => setCalendarAreaFilter(e.target.value)} style={{background:"#f8fbff",border:"1px solid #c4daee",borderRadius:8,color:"#23486b",padding:"7px 9px",fontSize:11}}>
                {calendarAreaOptions.map((a) => <option key={a} value={a}>{a === "all" ? "All areas" : `Area: ${a}`}</option>)}
              </select>
              <select value={calendarConfidenceFilter} onChange={(e) => setCalendarConfidenceFilter(e.target.value)} style={{background:"#f8fbff",border:"1px solid #c4daee",borderRadius:8,color:"#23486b",padding:"7px 9px",fontSize:11}}>
                {calendarConfidenceOptions.map((c) => <option key={c} value={c}>{c === "all" ? "All confidence levels" : `Confidence: ${c}`}</option>)}
              </select>
              <input value={calendarQuery} onChange={(e) => setCalendarQuery(e.target.value)} placeholder="Search event, area, offer..." style={{background:"#f8fbff",border:"1px solid #c4daee",borderRadius:8,color:"#23486b",padding:"7px 9px",fontSize:11}} />
              <label style={{display:"flex",alignItems:"center",gap:6,color:"#5f7f9f",fontSize:11,background:"#f8fbff",border:"1px solid #c4daee",borderRadius:8,padding:"7px 9px"}}>
                <input type="checkbox" checked={calendarHideTentative} onChange={(e) => setCalendarHideTentative(e.target.checked)} />
                Hide tentative dates
              </label>
              <button onClick={() => { setCalendarTypeFilter("all"); setCalendarAreaFilter("all"); setCalendarConfidenceFilter("all"); setCalendarHideTentative(false); setCalendarQuery(""); }} style={{background:"#074069",border:"1px solid #356d9f",borderRadius:8,color:"#eaf3ff",padding:"7px 9px",fontSize:11,cursor:"pointer"}}>
                Reset filters
              </button>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:12}}>
            <div style={{display:"grid",gap:12}}>
              <div style={{background:"#ffffff",border:"1px solid #c4daee",borderRadius:12,padding:"12px 12px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:10}}>
                  <button onClick={() => shiftCalendarMonth(-1)} style={{background:"#edf5ff",border:"1px solid #a7c1db",borderRadius:8,color:"#365a7f",padding:"6px 9px",fontSize:11,cursor:"pointer"}}>Prev</button>
                  <div style={{color:"#d2ab67",fontFamily:"'Montserrat', sans-serif",fontSize:24,lineHeight:1}}>{formatMonthYear(calendarView.year, calendarView.month)}</div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={jumpCalendarToToday} style={{background:"#edf5ff",border:"1px solid #a7c1db",borderRadius:8,color:"#365a7f",padding:"6px 9px",fontSize:11,cursor:"pointer"}}>Today</button>
                    <button onClick={() => shiftCalendarMonth(1)} style={{background:"#edf5ff",border:"1px solid #a7c1db",borderRadius:8,color:"#365a7f",padding:"6px 9px",fontSize:11,cursor:"pointer"}}>Next</button>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6,marginBottom:6}}>
                  {weekdayLabels.map((label) => (
                    <div key={label} style={{color:"#6f86aa",fontSize:10,textAlign:"center",textTransform:"uppercase"}}>{label}</div>
                  ))}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>
                  {monthGrid.map((cell) => {
                    const bg = !cell.inMonth
                      ? "#f9fcff"
                      : cell.isSelected
                        ? "linear-gradient(160deg, rgba(210,171,103,0.28), rgba(255,252,244,0.95))"
                        : "#f8fbff";
                    const border = !cell.inMonth ? "#e4edf6" : cell.isSelected ? "#cba84a" : cell.isToday ? "#4a78b3" : "#d3e2f2";
                    const dayEvents = cell.inMonth ? cell.events : [];
                    return (
                      <button
                        key={cell.iso}
                        onClick={() => cell.inMonth && setSelectedDateIso(cell.iso)}
                        disabled={!cell.inMonth}
                        style={{minHeight:88,background:bg,border:`1px solid ${border}`,borderRadius:10,padding:"6px 5px",cursor:cell.inMonth ? "pointer" : "default",textAlign:"left",overflow:"hidden"}}
                      >
                        <div style={{fontSize:10,color:cell.inMonth ? "#1f3550" : "#8ca1bc",fontWeight:cell.isToday ? "bold" : "normal"}}>{cell.day}</div>
                        <div style={{display:"flex",gap:3,flexWrap:"wrap",marginTop:4}}>
                          {dayEvents.slice(0, 2).map((evt) => <span key={`${cell.iso}-${evt.id}`} style={{width:6,height:6,borderRadius:"50%",background:typePalette[evt.type] || "#9fb5d8",display:"inline-block"}} />)}
                        </div>
                        <div style={{marginTop:4,display:"grid",gap:2}}>
                          {dayEvents.slice(0, 2).map((evt) => (
                            <div key={`${cell.iso}-name-${evt.id}`} style={{fontSize:9,color:cell.inMonth ? "#3f5f80" : "#8ca1bc",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                              {evt.name}
                            </div>
                          ))}
                          {dayEvents.length > 2 && <div style={{fontSize:9,color:"#6284a6"}}>+{dayEvents.length - 2} more</div>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{background:"#ffffff",border:"1px solid #c4daee",borderRadius:12,padding:"12px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{color:"#d2ab67",fontSize:12,fontWeight:"bold"}}>Selected Day Detail</div>
                  <div style={{color:"#5f7f9f",fontSize:10}}>{formatDateLongIso(selectedDateIso)}</div>
                </div>
                {selectedDateEvents.length ? (
                  <div style={{display:"grid",gap:7}}>
                    {selectedDateEvents.map((event) => {
                      const cStyle = confidenceStyles[event.confidence] || confidenceStyles.system;
                      return (
                        <div key={`selected-${event.id}`} style={{background:"#f8fbff",border:"1px solid #d0e0f1",borderRadius:9,padding:"8px 9px"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:4}}>
                            <div style={{color:"#1f3550",fontSize:11,fontWeight:"bold"}}>{event.name}</div>
                            <span style={{fontSize:9,padding:"2px 6px",borderRadius:999,border:`1px solid ${cStyle.border}`,background:cStyle.bg,color:cStyle.text}}>{event.confidence}</span>
                          </div>
                          <div style={{color:"#4d6d8f",fontSize:10}}>Focus: {event.focus}</div>
                          <div style={{color:"#4d6d8f",fontSize:10,marginTop:2}}>Areas: {(event.areas || []).join(", ") || "N/A"}</div>
                          <div style={{color:"#d2ab67",fontSize:10,marginTop:2}}>Offer: {event.offer}</div>
                          <div style={{display:"flex",gap:6,marginTop:7,flexWrap:"wrap"}}>
                            <button onClick={() => setInp(`Create campaign plan for ${event.name} on ${event.date} for ${((event.areas || []).join(", ") || "top areas")} with premium A2 positioning.`)} style={{background:"#074069",border:"1px solid #356d9f",borderRadius:8,color:"#eaf3ff",padding:"4px 8px",fontSize:10,cursor:"pointer"}}>Prepare prompt</button>
                            <button onClick={() => send(`Build exact action plan for ${event.name} (${event.date}) targeting ${(event.areas || []).join(", ") || "top areas"} with scripts and timeline.`)} style={{background:"#2c5c2b",border:"1px solid #4d8c4d",borderRadius:8,color:"#d7f4d7",padding:"4px 8px",fontSize:10,cursor:"pointer"}}>Run in AI chat</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <div style={{color:"#5f7f9f",fontSize:11}}>No events for this date with current filters.</div>}
              </div>
            </div>

            <div style={{background:"#ffffff",border:"1px solid #c4daee",borderRadius:12,padding:"12px 12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{color:"#d2ab67",fontSize:12,fontWeight:"bold",letterSpacing:0.3}}>Month Timeline</div>
                <div style={{color:"#6f86aa",fontSize:10}}>In {formatMonthYear(calendarView.year, calendarView.month)}: {selectedMonthEvents.length} events</div>
              </div>
              <div style={{display:"grid",gap:8}}>
                {calendarCampaignCards.slice(0, 14).map((event) => (
                  <div key={event.id} style={{display:"grid",gridTemplateColumns:"95px 1fr",gap:10,background:"#f8fbff",border:"1px solid #d0e0f1",borderRadius:10,padding:"9px 10px"}}>
                    <div>
                      <div style={{color:"#8b6914",fontSize:12,fontWeight:"bold"}}>{formatDateShort(event.date)}</div>
                      <div style={{color:typePalette[event.type] || "#6e8ab2",fontSize:10,textTransform:"uppercase"}}>{event.type}</div>
                    </div>
                    <div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                        <div style={{color:"#1f3550",fontSize:12,fontWeight:"bold"}}>{event.name}</div>
                        <span style={{color:"#5f7f9f",fontSize:10}}>{daysBetween(todayIso, event.date) >= 0 ? `D-${daysBetween(todayIso, event.date)}` : "Past"}</span>
                      </div>
                      <div style={{color:"#4d6d8f",fontSize:11,marginTop:2}}>{event.focus}</div>
                      <div style={{color:"#4d6d8f",fontSize:10,marginTop:2}}>Areas: {event.areaList}</div>
                      <div style={{color:"#d2ab67",fontSize:10,marginTop:3}}>Offer: {event.offer}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{display:"grid",gap:10}}>
              <div style={{background:"#ffffff",border:"1px solid #c4daee",borderRadius:12,padding:"12px"}}>
                <div style={{color:"#d2ab67",fontSize:12,fontWeight:"bold",marginBottom:8}}>This Month Playbook</div>
                {selectedMonthPlaybookEvents.length ? (
                  <div style={{display:"grid",gap:7}}>
                    {selectedMonthPlaybookEvents.slice(0, 8).map((event) => (
                      <div key={event.id} style={{background:"#f8fbff",border:"1px solid #d0e0f1",borderRadius:9,padding:"8px 9px"}}>
                        <div style={{color:"#1f3550",fontSize:11,fontWeight:"bold"}}>{event.name} ({formatDateShort(event.date)})</div>
                        <div style={{color:"#4d6d8f",fontSize:10,marginTop:2}}>Action: {event.focus}</div>
                        <div style={{color:"#d2ab67",fontSize:10,marginTop:2}}>Offer: {event.offer}</div>
                      </div>
                    ))}
                  </div>
                ) : <div style={{color:"#5f7f9f",fontSize:11}}>No scheduled events in selected month.</div>}
              </div>

              <div style={{background:"#ffffff",border:"1px solid #c4daee",borderRadius:12,padding:"12px"}}>
                <div style={{color:"#d2ab67",fontSize:12,fontWeight:"bold",marginBottom:8}}>WhatsApp Template Generator</div>
                <div style={{display:"grid",gap:7}}>
                  {calendarCampaignCards.slice(0, 4).map((event) => (
                    <div key={`${event.id}-wa`} style={{background:"#f8fbff",border:"1px solid #d0e0f1",borderRadius:9,padding:"8px 9px"}}>
                      <div style={{color:"#1f3550",fontSize:11,fontWeight:"bold"}}>{event.name}</div>
                      <div style={{color:"#4d6d8f",fontSize:10,marginTop:2}}>{event.whatsapp}</div>
                      <button onClick={() => navigator.clipboard?.writeText(event.whatsapp)} style={{marginTop:6,background:"#edf5ff",border:"1px solid #a7c1db",borderRadius:8,color:"#365a7f",padding:"4px 8px",fontSize:10,cursor:"pointer"}}>
                        Copy text
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CHAT TAB */}
      {tab==="chat" && (
        <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",overflow:"hidden",position:"relative",zIndex:1}}>
          <div ref={chatScrollRef} onScroll={onChatScroll} style={{flex:1,minHeight:0,overflowY:"auto",overscrollBehavior:"contain",padding:"18px 18px 10px",scrollBehavior:"auto"}}>
            <div style={{minHeight:"100%",maxWidth:1040,margin:"0 auto",display:"flex",flexDirection:"column",justifyContent:"flex-start"}}>
              {msgs.length===0 && !loading && (
                <div style={{alignSelf:"center",marginTop:"16vh",maxWidth:760,background:"#ffffff",border:"1px solid #d7e3f0",boxShadow:"0 20px 45px rgba(7,64,105,0.08)",borderRadius:16,padding:"16px 18px",color:"#5f7f9f",fontSize:12}}>
                  <div style={{fontSize:17,color:"#1f3550",fontWeight:700,marginBottom:4}}>Ask anything</div>
                  <div style={{marginBottom:10}}>Use Filters only when you need deeper control. Default mode is optimized for fast answers.</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                    {SUGGESTIONS.slice(0, 4).map(s=>(
                      <button key={`starter-${s}`} onClick={()=>send(s)} style={{background:"#ffffff",border:"1px solid #c7d7e8",borderRadius:16,color:"#3d5b7c",padding:"7px 13px",cursor:"pointer",fontSize:11,fontFamily:"'Montserrat', sans-serif"}}
                        onMouseOver={e=>{e.currentTarget.style.borderColor=rc;e.currentTarget.style.color=rc;e.currentTarget.style.background=rc+"12";}}
                        onMouseOut={e=>{e.currentTarget.style.borderColor="#c7d7e8";e.currentTarget.style.color="#3d5b7c";e.currentTarget.style.background="#ffffff";}}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {msgs.map((m,i)=>(
                <div key={i} style={{marginBottom:16,display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
                  <div style={{display:"flex",flexDirection:m.role==="user"?"row-reverse":"row",gap:10,alignItems:"flex-start",maxWidth:"96%"}}>
                    <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,background:m.role==="user"?rc+"15":"#d2ab6712",border:`1px solid ${m.role==="user"?rc+"40":"#d2ab6730"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>
                      {m.role==="user"?ROLES[role].icon:"MM"}
                    </div>
                    <div style={{maxWidth:"min(860px, 100%)",overflowX:"auto",background:m.role==="user"?"#edf5ff":"#f8fbff",border:`1px solid ${m.role==="user"?"#b9cee5":"#d7e3f0"}`,borderRadius:m.role==="user"?"14px 3px 14px 14px":"3px 14px 14px 14px",padding:"12px 15px",fontSize:13,lineHeight:1.78,color:m.error?"#ff6666":"#2f4f70"}}>
                      {m.role==="user"
                        ? <span style={{color:"#20476d"}}>{m.content}</span>
                        : <>
                            {m.skill && <div style={{color:"#6d87a9",fontSize:10,marginBottom:6}}>Mode: {MARKETING_SKILLS[m.skill]?.label || MARKETING_SKILLS.core.label}</div>}
                            {m.searched && <div style={{color:"#4499ff",fontSize:10,marginBottom:8,display:"flex",alignItems:"center",gap:5}}>Web search <em>Live competitor intelligence fetched</em></div>}
                            {m.structured && (
                              <div style={{display:"grid",gap:7,marginBottom:8}}>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                                  <span style={{background:"#fff8ec",border:"1px solid #ead4ab",borderRadius:999,padding:"2px 8px",fontSize:10,color:"#6d4f18"}}>
                                    Structured reply | Quality: {toInt(m.qualityScore)}/100
                                  </span>
                                  {!!asArray(m.qualityIssues).length && (
                                    <span style={{fontSize:10,color:"#8b6b3a"}}>{asArray(m.qualityIssues).slice(0, 2).join(" | ")}</span>
                                  )}
                                </div>
                                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                                  {REGENERABLE_SECTIONS.map((sectionKey) => {
                                    const token = `${i}:${sectionKey}`;
                                    const busy = regenKey === token;
                                    return (
                                      <button
                                        key={sectionKey}
                                        onClick={() => regenerateSection(i, sectionKey)}
                                        disabled={busy || loading}
                                        style={{background:"#ffffff",border:"1px solid #c7d9ea",borderRadius:14,color:"#365a7f",padding:"3px 9px",cursor:busy ? "not-allowed" : "pointer",fontSize:10,fontFamily:"'Montserrat', sans-serif"}}
                                      >
                                        {busy ? `Regenerating ${SECTION_LABELS[sectionKey]}...` : `Regenerate ${SECTION_LABELS[sectionKey]}`}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            <div dangerouslySetInnerHTML={{__html:m.html||parseMsg(m.content)}}/>
                            {!m.error && (
                              <div style={{display:"flex",gap:7,marginTop:12,paddingTop:9,borderTop:"1px solid #c7d7e8"}}>
                                <button onClick={()=>navigator.clipboard?.writeText(m.content)} style={{background:"#f6faff",border:"1px solid #c1d4e8",borderRadius:6,color:"#3d5b7c",padding:"4px 12px",cursor:"pointer",fontSize:11,fontFamily:"'Montserrat', sans-serif"}}
                                  onMouseOver={e=>{e.currentTarget.style.color="#d2ab67";e.currentTarget.style.borderColor="#d2ab6735";}}
                                  onMouseOut={e=>{e.currentTarget.style.color="#3d5b7c";e.currentTarget.style.borderColor="#c1d4e8";}}>
                                  Copy
                                </button>
                                <button onClick={()=>doExport(m.html||parseMsg(m.content),role,appData.data_date)} style={{background:"#f6faff",border:"1px solid #c1d4e8",borderRadius:6,color:"#3d5b7c",padding:"4px 12px",cursor:"pointer",fontSize:11,fontFamily:"'Montserrat', sans-serif"}}
                                  onMouseOver={e=>{e.currentTarget.style.color="#44cc88";e.currentTarget.style.borderColor="#44cc8835";}}
                                  onMouseOut={e=>{e.currentTarget.style.color="#3d5b7c";e.currentTarget.style.borderColor="#c1d4e8";}}>
                                  Export PDF
                                </button>
                              </div>
                            )}
                          </>
                      }
                    </div>
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:8}}>
                  <div style={{width:28,height:28,borderRadius:"50%",background:"#d2ab6712",border:"1px solid #d2ab6730",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>MM</div>
                  <div style={{background:"#f8fbff",border:"1px solid #d7e3f0",borderRadius:"3px 14px 14px 14px",padding:"12px 16px",display:"flex",gap:5,alignItems:"center"}}>
                    <span style={{color:"#6f83a8",fontSize:11,marginRight:6,fontStyle:"italic"}}>{`Analyzing ${toInt(D.total_customers).toLocaleString()} customers`}</span>
                    {[0,1,2].map(i=><div key={i} style={{width:5,height:5,borderRadius:"50%",background:rc,animation:"pulse 1.2s ease-in-out infinite",animationDelay:`${i*0.2}s`}}/>)}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{padding:"10px 18px 14px",borderTop:"1px solid #d7e3f0",background:"#f8fbff",flexShrink:0}}>
            <div style={{maxWidth:1040,margin:"0 auto"}}>
              <div style={{minHeight:24,marginBottom:8}}>
                {pendingClarification ? (
                  <div style={{background:"#fff8ec",border:"1px solid #ead4ab",borderRadius:10,padding:"6px 10px",fontSize:10,color:"#6d4f18"}}>
                    Clarification needed: add goal + area + timeframe.
                  </div>
                ) : chatNotice ? (
                  <div style={{background:"#edf5ff",border:"1px solid #c7d9ea",borderRadius:10,padding:"6px 10px",fontSize:10,color:"#365a7f"}}>
                    {chatNotice}
                  </div>
                ) : null}
              </div>

              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button
                  onClick={()=>setShowControlGuide((v)=>!v)}
                  style={{height:44,minWidth:78,background:"#ffffff",border:"1px solid #c8d9ea",borderRadius:22,color:"#2f4f70",padding:"0 12px",cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:"'Montserrat', sans-serif"}}
                >
                  {showControlGuide ? "Close" : "Customize"}
                </button>
                <div style={{flex:1,display:"flex",alignItems:"center",gap:8,background:"#ffffff",border:"1px solid #c8d9ea",boxShadow:"0 10px 26px rgba(7,64,105,0.08)",borderRadius:24,padding:"5px 6px 5px 14px"}}>
                  <input value={inp} onChange={e=>setInp(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
                    placeholder="Ask anything"
                    style={{flex:1,background:"transparent",border:"none",color:"#1f3550",padding:"8px 2px",fontSize:14,outline:"none",fontFamily:"'Montserrat', sans-serif"}}
                  />
                  <button onClick={()=>send()} disabled={loading||!inp.trim()} style={{background:loading?"#f3f7fc":rc,color:loading?"#587493":"#000",border:loading?"1px solid #d7e3f0":"none",borderRadius:19,padding:"9px 16px",cursor:loading?"not-allowed":"pointer",fontSize:12,fontWeight:700,fontFamily:"'Montserrat', sans-serif"}}>
                    {loading ? "..." : "Send"}
                  </button>
                </div>
              </div>

              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginTop:7,flexWrap:"wrap"}}>
                <span style={{background:"#edf5ff",border:"1px solid #a7c1db",borderRadius:16,padding:"3px 10px",fontSize:10,color:"#365a7f"}}>
                  Mode: {chatControls.objective} • {chatControls.depth} • {chatControls.tone} • {chatControls.output_mode}
                </span>
                <span style={{fontSize:10,color:"#6f86aa"}}>{formatDateLongIso(todayIso)} • {PERSONA_PLAYBOOKS[chatControls.persona]?.label}</span>
              </div>

              {showControlGuide && (
                <div style={{marginTop:8,background:"#ffffff",border:"1px solid #d7e3f0",borderRadius:12,padding:"10px 12px"}}>
                  <div style={{fontSize:10,color:"#6f86aa",marginBottom:6,textTransform:"uppercase",letterSpacing:0.6}}>AI Setup</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:7,marginBottom:7}}>
                    <select
                      value={provider}
                      onChange={(e)=>setProvider(e.target.value)}
                      style={{background:"#ffffff",border:"1px solid #c8d9ea",borderRadius:8,color:"#1f3550",padding:"8px 11px",fontSize:11,outline:"none",fontFamily:"'Montserrat', sans-serif"}}
                    >
                      <option value="gemini">Gemini API</option>
                      <option value="openai">OpenAI API</option>
                    </select>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={e=>setApiKey(e.target.value)}
                      placeholder={provider === "gemini" ? "Gemini API key" : "OpenAI API key"}
                      autoComplete="off"
                      style={{background:"#ffffff",border:"1px solid #c8d9ea",borderRadius:8,color:"#1f3550",padding:"8px 11px",fontSize:11,outline:"none",fontFamily:"'Montserrat', sans-serif"}}
                      onFocus={e=>e.target.style.borderColor=rc+"55"} onBlur={e=>e.target.style.borderColor="#c8d9ea"}
                    />
                    <input
                      value={model}
                      onChange={e=>setModel(e.target.value)}
                      placeholder={provider === "gemini" ? "gemini-2.5-flash" : "gpt-4.1-mini"}
                      style={{background:"#ffffff",border:"1px solid #c8d9ea",borderRadius:8,color:"#1f3550",padding:"8px 11px",fontSize:11,outline:"none",fontFamily:"'Montserrat', sans-serif"}}
                      onFocus={e=>e.target.style.borderColor=rc+"55"} onBlur={e=>e.target.style.borderColor="#c8d9ea"}
                    />
                  </div>

                  <div style={{fontSize:10,color:"#6f86aa",marginBottom:6,textTransform:"uppercase",letterSpacing:0.6}}>Strategy</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:7,marginBottom:8}}>
                    <select value={chatControls.objective} onChange={(e)=>setChatControls((prev)=>({ ...prev, objective: e.target.value }))} style={{background:"#ffffff",border:"1px solid #c8d9ea",borderRadius:8,color:"#1f3550",padding:"8px 11px",fontSize:11,outline:"none",fontFamily:"'Montserrat', sans-serif"}}>
                      {CHAT_OBJECTIVES.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <select value={chatControls.depth} onChange={(e)=>setChatControls((prev)=>({ ...prev, depth: e.target.value }))} style={{background:"#ffffff",border:"1px solid #c8d9ea",borderRadius:8,color:"#1f3550",padding:"8px 11px",fontSize:11,outline:"none",fontFamily:"'Montserrat', sans-serif"}}>
                      {CHAT_DEPTH.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <select value={chatControls.tone} onChange={(e)=>setChatControls((prev)=>({ ...prev, tone: e.target.value }))} style={{background:"#ffffff",border:"1px solid #c8d9ea",borderRadius:8,color:"#1f3550",padding:"8px 11px",fontSize:11,outline:"none",fontFamily:"'Montserrat', sans-serif"}}>
                      {CHAT_TONES.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <select value={chatControls.output_mode} onChange={(e)=>setChatControls((prev)=>({ ...prev, output_mode: e.target.value }))} style={{background:"#ffffff",border:"1px solid #c8d9ea",borderRadius:8,color:"#1f3550",padding:"8px 11px",fontSize:11,outline:"none",fontFamily:"'Montserrat', sans-serif"}}>
                      {CHAT_OUTPUT_MODES.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <select value={chatControls.persona} onChange={(e)=>setChatControls((prev)=>({ ...prev, persona: e.target.value }))} style={{background:"#ffffff",border:"1px solid #c8d9ea",borderRadius:8,color:"#1f3550",padding:"8px 11px",fontSize:11,outline:"none",fontFamily:"'Montserrat', sans-serif"}}>
                      {Object.entries(PERSONA_PLAYBOOKS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
                    </select>
                  </div>

                  <div style={{fontSize:10,color:"#6f86aa",marginBottom:6,textTransform:"uppercase",letterSpacing:0.6}}>Quick Presets</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {CHAT_CONTEXT_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => applyContextPreset(preset)}
                        style={{background:"#f8fbff",border:"1px solid #c7d9ea",borderRadius:14,color:"#365a7f",padding:"4px 10px",fontSize:10,cursor:"pointer",fontFamily:"'Montserrat', sans-serif"}}
                        title={preset.use_when}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{color:"#5f7499",fontSize:10,marginTop:7,textAlign:"right"}}>
                {apiKey.trim() ? `${provider === "gemini" ? "Gemini API" : "OpenAI API"} | ${model} | ${ROLES[role].title}` : `Add ${provider === "gemini" ? "Gemini" : "OpenAI"} API key in Filters`}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap');@keyframes pulse{0%,100%{opacity:0.2;transform:scale(0.7)}50%{opacity:1;transform:scale(1.15)}}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#9fb4cc;border-radius:3px}input::placeholder{color:#587493;font-size:11px}button{transition:all .18s ease}`}</style>
    </div>
  );
}









