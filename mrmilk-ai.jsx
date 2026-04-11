import React, { startTransition, useState, useRef, useEffect, useMemo, useDeferredValue } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart, ScatterChart, TreemapChart } from "echarts/charts";
import { GraphicComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { captureChatAudit } from "./mrmilk-chat-audit.js";
import ContentStudio from "./src/ContentStudio.jsx";
import ImportCenter from "./src/ImportCenter.jsx";
import { fetchCustomerRecords, fetchCustomerSummary, proxyChat } from "./src/utils/importApi.js";

echarts.use([BarChart, LineChart, PieChart, ScatterChart, TreemapChart, GraphicComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent, CanvasRenderer]);

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
- Doorstep delivery across Pune & PCMC
- Transparent billing

AWARDS:
- Top Trusted Dairy Brand - Times Power Brands
- Lokmat Global Industry Award 2024 (Baku)

This is a PREMIUM brand. Customers pay a premium because they trust the farm, the process, and the A2 health narrative. Every marketing move must protect and reinforce this premium positioning.

-------------------------------------------
NON-NEGOTIABLE COMMERCIAL ETHICS
-------------------------------------------
- No discounts.
- No discount-like language, price cuts, cashback, bulk-order pushes, or buy-more-save-more framing.
- Only acquisition offer allowed: first-time 7L trial pack where the customer pays for 6L and receives 1L extra.
- Retention and reactivation must stay service-led: preferred restart date, quantity planning, wallet guidance, delivery continuity support, premium reassurance, founder/team callback.
- Make recommendations feel valuable, premium, and trust-led, never cheap or promotional.

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
    call_flow: ["Rapport", "Problem signal", "Value path", "Close", "Follow-up"]
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
    objection_handling: ["Competitor is cheaper", "Competitor app is easier", "Competitor has a louder promo"],
    call_flow: ["Threat map", "Differentiator", "Counter-position", "Retention lock-in", "Review"]
  }
};
const ROLE_DEFAULT_PERSONA = {
  owner: "competitor_analyst",
  marketing: "area_growth_manager",
  crm: "crm_specialist",
  ops: "area_growth_manager"
};
const RESEARCH_META_KEYS = [
  "answer",
  "customer_data_list",
  "citations",
  "confidence",
  "last_verified_at",
  "model_used"
];
const STRUCTURED_SECTION_KEYS = [
  "data_snapshot",
  "area_intelligence",
  "root_cause",
  "priority_actions",
  "competitive_threat",
  "timeline",
  "whatsapp_scripts"
];
const REQUIRED_RESPONSE_KEYS = [...RESEARCH_META_KEYS, ...STRUCTURED_SECTION_KEYS];
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
  primary_outcome: "customer_list",
  objective: "Retention",
  depth: "Standard",
  tone: "Consultative",
  output_mode: "Table",
  persona: "crm_specialist"
};
const FREE_PROVIDER_OPTIONS = ["nvidia", "gemini"];
const PROVIDER_META = {
  gemini: { label: "Gemini API", keyLabel: "Gemini", defaultModel: "gemini-2.5-flash" },
  openai: { label: "OpenAI API", keyLabel: "OpenAI", defaultModel: "gpt-4.1-mini" },
  nvidia: { label: "NVIDIA NIM", keyLabel: "NVIDIA", defaultModel: "qwen/qwen2-7b-instruct" }
};
const NVIDIA_MODEL_ALIASES = {
  "qwen2-7b-instruct": "qwen/qwen2-7b-instruct",
  "qwen/qwen2-7b-instruct": "qwen/qwen2-7b-instruct",
  "qwen2.5-coder-7b-instruct": "qwen/qwen2.5-coder-7b-instruct",
  "qwen/qwen2.5-coder-7b-instruct": "qwen/qwen2.5-coder-7b-instruct",
  "llama-3.3-nemotron-super-49b-v1.5": "nvidia/llama-3.3-nemotron-super-49b-v1.5",
  "nvidia/llama-3.3-nemotron-super-49b-v1.5": "nvidia/llama-3.3-nemotron-super-49b-v1.5",
  "llama-3.1-nemotron-nano-4b-v1.1": "nvidia/llama-3.1-nemotron-nano-4b-v1.1",
  "nvidia/llama-3.1-nemotron-nano-4b-v1.1": "nvidia/llama-3.1-nemotron-nano-4b-v1.1"
};
const CHAT_CONTEXT_PRESETS = [
  {
    id: "churn_rescue",
    label: "Churn Rescue",
    use_when: "Inactive/suspended customers are increasing",
    controls: { primary_outcome: "action_plan", objective: "Retention", depth: "Deep", tone: "Direct", output_mode: "Playbook", persona: "crm_specialist" }
  },
  {
    id: "area_growth",
    label: "Area Growth",
    use_when: "Need locality expansion and RWA conversions",
    controls: { primary_outcome: "action_plan", objective: "Acquisition", depth: "Standard", tone: "Consultative", output_mode: "Playbook", persona: "area_growth_manager" }
  },
  {
    id: "wallet_recovery",
    label: "Wallet Recovery",
    use_when: "Zero/negative wallet causing service interruptions",
    controls: { primary_outcome: "scripts", objective: "Wallet", depth: "Quick", tone: "Direct", output_mode: "Scripts", persona: "crm_specialist" }
  },
  {
    id: "premium_push",
    label: "Premium Push",
    use_when: "Growing A2 premium basket in top-value zones",
    controls: { primary_outcome: "root_cause", objective: "Premium Upsell", depth: "Standard", tone: "Consultative", output_mode: "Table", persona: "competitor_analyst" }
  }
];
const CHAT_OUTCOME_OPTIONS = [
  {
    id: "customer_list",
    label: "Customer Match",
    responseMode: "customer_preview",
    defaultOutputMode: "Table",
    requiresModel: false,
    helper: "You'll get a grounded summary first: count, why they matched, source date, and a button to open the full list only when you want it.",
    placeholder: "Which customers have wallet balance but no order in the last 60 days?",
    prompts: [
      "Which customers have wallet balance but no order in the last 60 days?",
      "Which customers prove the issue in Hadapsar?",
      "How many suspended customers are in Hadapsar right now?",
      "Give me a preview of high-value inactive customers to call today"
    ]
  },
  {
    id: "root_cause",
    label: "Root Cause",
    responseMode: "strategy_brief",
    defaultOutputMode: "Playbook",
    requiresModel: true,
    helper: "You'll get the main problem, proof behind it, and the business reason it is happening.",
    placeholder: "Why are we losing premium customers in Kharadi this month?",
    prompts: [
      "Why is trial conversion weak in Pune City Hub?",
      "Why are premium households churning in Kharadi?",
      "What is causing negative wallet growth in Hadapsar?",
      "Why is Talegaon underperforming versus the rest?"
    ]
  },
  {
    id: "action_plan",
    label: "Action Plan",
    responseMode: "strategy_brief",
    defaultOutputMode: "Playbook",
    requiresModel: true,
    helper: "You'll get a premium-safe plan with owners, timelines, and customer actions that protect the brand.",
    placeholder: "Build a premium-safe reactivation plan for suspended customers in Hadapsar this week",
    prompts: [
      "Build a premium-safe reactivation plan for suspended customers in Hadapsar this week",
      "Give me a 30-day premium growth plan for Koregaon Park",
      "Create a wallet recovery plan without price cuts for Wakad",
      "What should CRM do this week for high-value inactive customers?"
    ]
  },
  {
    id: "scripts",
    label: "Scripts",
    responseMode: "script_brief",
    defaultOutputMode: "Scripts",
    requiresModel: true,
    helper: "You'll get more natural customer-ready scripts that stay premium and never use discount language.",
    placeholder: "Write a premium WhatsApp restart script for inactive customers in Hadapsar",
    prompts: [
      "Write a premium WhatsApp restart script for inactive customers in Hadapsar",
      "Give me a wallet top-up call script without discount language",
      "Create a first-time trial pack script for new leads in Baner",
      "Write a premium service reassurance script for high-value loyal customers"
    ]
  }
];
const CHAT_OUTCOME_META = CHAT_OUTCOME_OPTIONS.reduce((acc, option) => {
  acc[option.id] = option;
  return acc;
}, {});
const OFFER_POLICY = {
  principle: "Make it feel valuable, not cheaper. Make it feel premium, not promotional.",
  summary: "No discounts. No discount-like language. No bulk-order incentives. No buy-more-save-more framing. Only first-time 7L trial pack where customer pays for 6L and receives 1L extra.",
  allowedAcquisitionOffer: "First-time 7L trial pack: customer pays for 6L and receives 1L extra.",
  allowedFrames: [
    "trial pack",
    "priority restart",
    "personalized plan",
    "preferred delivery setup",
    "guided onboarding",
    "premium service support",
    "farm-trust reassurance"
  ],
  blockedTerms: [
    "discount",
    "flat off",
    "cashback",
    "bulk deal",
    "festival offer",
    "combo price",
    "buy more save more",
    "free",
    "bonus",
    "wallet credit",
    "coupon",
    "voucher",
    "promo code"
  ]
};
const BUSINESS_DEFINITIONS = {
  wallet_balance_available: "wallet_balance > 0 unless the user explicitly asks for negative or zero wallet customers",
  inactive_customer: "status contains inactive, or the user explicitly asks for a no-order window grounded on last_delivery",
  last_order_proxy: "When the workbook does not expose a separate last-order field, MrMilk AI uses last_delivery as the operational recency signal",
  active_customer: "status contains active and does not contain inactive",
  trial_customer: "status contains trial or new customer",
  data_grounding: "Customer analytics must come from the active workbook only. No invented rows, no guessed totals."
};
const PROOF_TABLE_PREVIEW_ROWS = 8;
const PROOF_PAGE_SIZE = 250;
const PROOF_PAGE_SIZE_OPTIONS = [250, 1000, 5000, "all"];
const PROOF_SORT_OPTIONS = [
  { value: "revenue_desc", label: "Highest revenue" },
  { value: "wallet_asc", label: "Lowest wallet balance" },
  { value: "last_delivery_desc", label: "Latest delivery" },
  { value: "consumption_desc", label: "Highest consumption" }
];
const SORT_MODE_TO_TABLE_SORTING = {
  revenue_desc: [{ id: "revenue", desc: true }],
  wallet_asc: [{ id: "wallet_balance", desc: false }],
  last_delivery_desc: [{ id: "last_delivery", desc: true }],
  consumption_desc: [{ id: "current_consumption", desc: true }]
};

const asArray = (v) => Array.isArray(v) ? v : [];
const asObject = (v) => (v && typeof v === "object" && !Array.isArray(v)) ? v : {};
const clampConfidence = (value) => {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.min(1, Number(num.toFixed(2))));
};

function normalizeCustomerRecord(row = {}) {
  const mapped = {
    name: toText(row.name || row.Name),
    mobile: toText(row.mobile || row.Mobile),
    area: toText(row.area || row.Area),
    hub: toText(row.hub || row.Hub || "No Hub Assigned"),
    status: toText(row.status || row["Sub. Status"]),
    revenue: toInt(row.revenue ?? row["Total Revenue"]),
    orders: toInt(row.orders ?? row["Total Orders"]),
    wallet_balance: toInt(row.wallet_balance ?? row["Wallet Balance"]),
    last_delivery: toText(row.last_delivery || row["Last Delivery"]),
    source: toText(row.source || row.Source),
    payment_mode: toText(row.payment_mode || row["Payment Mode"]),
    delivery_boy: toText(row.delivery_boy || row["Delivery Boy"]),
    current_consumption: toNumber(row.current_consumption ?? row["Current Consumption"]),
    note: toText(row.note || row.Note || row.Notes || row.Remark || row.Remarks || row.Comment || row["Sales Note"]),
    why_it_matters: toText(row.why_it_matters || row["Why It Matters"])
  };
  return mapped;
}

function getCustomerRecords(data) {
  const direct = asArray(data?.customer_records).map(normalizeCustomerRecord).filter((row) => row.name || row.mobile);
  if (direct.length) return direct;
  const seeded = [
    ...asArray(data?.top_20_customers).map((row) => normalizeCustomerRecord(row)),
    ...asArray(data?.high_value_inactive).map((row) => normalizeCustomerRecord({
      ...row,
      "Sub. Status": "Inactive",
      "Wallet Balance": row["Wallet Balance"] ?? 0
    }))
  ];
  const seen = new Set();
  return seeded.filter((row) => {
    const key = `${row.mobile}|${row.name}|${row.area}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return row.name || row.mobile;
  });
}

function buildCustomerDatasetFingerprint(data) {
  const records = getCustomerRecords(data);
  const sample = records.slice(0, 8).map((row) => `${row.mobile}|${row.revenue}|${row.status}`).join("::");
  return [toText(data?.data_date), records.length, sample].join("|");
}

function rankCustomerForQuery(record, query = "") {
  const q = toKey(query);
  const tokens = q.split(" ").filter((token) => token.length >= 3);
  const haystack = toKey(`${record.name} ${record.mobile} ${record.area} ${record.hub} ${record.status} ${record.source} ${record.payment_mode} ${record.note}`);
  let score = 0;
  tokens.forEach((token) => {
    if (haystack.includes(token)) score += 3;
  });
  if (/suspend|low balance|wallet/.test(q) && /suspend/.test(toKey(record.status))) score += 7;
  if (/inactive|churn|reactivate|win back/.test(q) && /inactive/.test(toKey(record.status))) score += 7;
  if (/trial/.test(q) && /trial|new customer/.test(toKey(record.status))) score += 6;
  if (/top|high value|premium|revenue|ltv|vip/.test(q)) score += Math.min(record.revenue / 50000, 8);
  if (/wallet|balance|top up|collect/.test(q) && record.wallet_balance < 0) score += 6;
  if (/note|notes|remark|remarks|reason|comment/.test(q) && toText(record.note)) score += 5;
  if (/order|delivery/.test(q) && record.orders > 0) score += Math.min(record.orders / 100, 5);
  if (!tokens.length) score += Math.min(record.revenue / 75000, 4);
  return score;
}

function findRelevantCustomers(data, query, limit = 6) {
  const records = getCustomerRecords(data);
  const ranked = records
    .map((record) => ({ ...record, _score: rankCustomerForQuery(record, query) }))
    .filter((record) => record._score > 0)
    .sort((a, b) => (b._score - a._score) || (b.revenue - a.revenue) || (b.orders - a.orders))
    .slice(0, limit)
    .map(({ _score, ...record }) => record);
  if (ranked.length) return ranked;
  return records
    .slice()
    .sort((a, b) => (b.revenue - a.revenue) || (b.orders - a.orders))
    .slice(0, limit);
}

function extractTimeWindowDays(query = "") {
  const q = toKey(query);
  if (/(one|1)\s*(or|-|to)\s*(two|2)\s*months/.test(q)) return null;
  const dayMatch = q.match(/(?:last|past|for)\s+(\d{1,3})\s+days?/);
  if (dayMatch) return toInt(dayMatch[1]);
  const monthMatch = q.match(/(?:last|past|for)\s+(\d{1,2})\s+months?/);
  if (monthMatch) return toInt(monthMatch[1]) * 30;
  if (/\blast month\b|\bpast month\b|\bprevious month\b/.test(q)) return 30;
  if (/\blast two months\b|\bpast two months\b|\bprevious two months\b/.test(q)) return 60;
  return null;
}

function hasAmbiguousTimeframe(query = "") {
  return /(one|1)\s*(or|-|to)\s*(two|2)\s*months/.test(toKey(query));
}

function extractRequestedCustomerCount(query, fallback = 8) {
  const direct = toText(query).match(/\b(\d{1,2})\s+(customers|customer|accounts|people|rows|list)\b/i);
  if (!direct?.[1]) return fallback;
  const count = Number(direct[1]);
  if (!Number.isFinite(count)) return fallback;
  return Math.max(3, Math.min(20, count));
}

function isCustomerListIntent(query = "") {
  const q = toKey(query);
  return /(customer list|list of customers|show customers|show me customers|which customers|exact customer|actual customer|customer proof|proof customer|customer rows|proof rows|mobile list|contact list|all customers|all matching customers|full list|full customer list|entire customer list|who are the customers|give me .*customers|customers fall|customers for this result|customer data list|exact data|full data|all matched data|complete data|full records|exact records|all rows|matching rows)/.test(q);
}

function isExplicitCustomerListQuery(query = "") {
  const q = toKey(query);
  return /(full customer list|full list|exact customer list|exact customer data|complete customer data|all matching customers|all matched customers|show full list|open full list|full data|exact data|view customer list|customer records|raw rows|full records|mobile list|contact list)/.test(q);
}

function isExplicitCustomerExportQuery(query = "") {
  return /(export|download|csv|report|sheet).*(customer|customers|rows|records|data)|customer export/.test(toKey(query));
}

function isDeterministicCustomerQuery(query = "", simpleMode = false) {
  const q = toKey(query);
  if (isCustomerListIntent(query)) return true;
  if (/(suspended|inactive|active|trial|new customer|negative wallet|zero wallet|positive wallet|blocked|dnd|cash|online|no hub|without hub|unassigned hub)\s+(customer|customers|accounts|people|rows)\b/.test(q)) return true;
  if (/(show|give|find|which|who|list|full|all|exact|actual).*(customer|customers|rows|mobiles|accounts)/.test(q)) return true;
  if (/customer(s)?\s+(in|from|under|with|matching|for)\b/.test(q) && /(area|hub|wallet|status|suspend|inactive|active|trial|cash|online|blocked|dnd|negative|positive|zero)/.test(q)) return true;
  if (simpleMode && /(customer|customers|rows|mobiles|accounts)/.test(q) && /(proof|mobile|wallet|inactive|suspend|hub|area)/.test(q)) return true;
  return false;
}

function matchesCustomerStatus(record, statusType = "") {
  const status = toKey(record?.status);
  if (!statusType) return true;
  if (statusType === "suspended") return /suspend/.test(status);
  if (statusType === "inactive") return /inactive/.test(status);
  if (statusType === "trial") return /trial|new customer/.test(status);
  if (statusType === "active") return /active/.test(status) && !/inactive/.test(status);
  if (statusType === "blocked") return /blocked/.test(status);
  if (statusType === "dnd") return /\bdnd\b/.test(status);
  return status.includes(toKey(statusType));
}

function sortCustomerRecords(records = [], sortMode = "revenue_desc") {
  const rows = asArray(records).slice();
  return rows.sort((a, b) => {
    if (sortMode === "wallet_asc") return toInt(a.wallet_balance) - toInt(b.wallet_balance) || toInt(b.revenue) - toInt(a.revenue);
    if (sortMode === "last_delivery_desc") return toText(b.last_delivery).localeCompare(toText(a.last_delivery)) || toInt(b.revenue) - toInt(a.revenue);
    if (sortMode === "consumption_desc") return toNumber(b.current_consumption) - toNumber(a.current_consumption) || toInt(b.revenue) - toInt(a.revenue);
    return toInt(b.revenue) - toInt(a.revenue) || toInt(b.orders) - toInt(a.orders);
  });
}

function filterCustomerRecords(dataOrRecords, filters = {}) {
  const records = Array.isArray(dataOrRecords)
    ? asArray(dataOrRecords).map(normalizeCustomerRecord)
    : getCustomerRecords(dataOrRecords);
  const areaSet = new Set(asArray(filters.areas).map((value) => toKey(value)).filter(Boolean));
  const hubSet = new Set(asArray(filters.hubs).map((value) => toKey(value)).filter(Boolean));
  const sourceSet = new Set(asArray(filters.sources).map((value) => toKey(value)).filter(Boolean));
  const paymentSet = new Set(asArray(filters.paymentModes).map((value) => toKey(value)).filter(Boolean));
  const deliverySet = new Set(asArray(filters.deliveryBoys).map((value) => toKey(value)).filter(Boolean));
  const customerKeySet = new Set(asArray(filters.customerKeys).map((value) => toText(value)).filter(Boolean));
  const statusText = asArray(filters.statusText).map((value) => toKey(value)).filter(Boolean);
  const nameTokens = asArray(filters.names).map((value) => toKey(value)).filter(Boolean);
  const searchText = toKey(filters.queryText);
  return records.filter((record) => {
    const customerKey = `${toText(record.mobile)}|${toText(record.name)}|${toText(record.area)}`;
    const haystack = toKey(`${record.name} ${record.mobile} ${record.area} ${record.hub} ${record.status} ${record.source} ${record.payment_mode} ${record.delivery_boy} ${record.note}`);
    if (filters.mobile && !toText(record.mobile).includes(toText(filters.mobile))) return false;
    if (areaSet.size && !areaSet.has(toKey(record.area))) return false;
    if (hubSet.size && !hubSet.has(toKey(record.hub))) return false;
    if (sourceSet.size && !sourceSet.has(toKey(record.source))) return false;
    if (deliverySet.size && !deliverySet.has(toKey(record.delivery_boy))) return false;
    if (customerKeySet.size && !customerKeySet.has(customerKey)) return false;
    if (nameTokens.length && !nameTokens.some((token) => token && toKey(record.name).includes(token))) return false;
    if (filters.statusType && !matchesCustomerStatus(record, filters.statusType)) return false;
    if (filters.requireActive && !matchesCustomerStatus(record, "active")) return false;
    if (filters.requireBlocked && !matchesCustomerStatus(record, "blocked")) return false;
    if (filters.requireDnd && !matchesCustomerStatus(record, "dnd")) return false;
    if (statusText.length && !statusText.some((token) => token && toKey(record.status).includes(token))) return false;
    if (filters.wallet === "negative" && !(toInt(record.wallet_balance) < 0)) return false;
    if (filters.wallet === "zero" && toInt(record.wallet_balance) !== 0) return false;
    if (filters.wallet === "positive" && !(toInt(record.wallet_balance) > 0)) return false;
    if (filters.requireNoHub && toKey(record.hub) !== "no hub assigned") return false;
    if (paymentSet.size && !Array.from(paymentSet).some((mode) => haystack.includes(mode))) return false;
    if (filters.minRevenue != null && !(toInt(record.revenue) >= toInt(filters.minRevenue))) return false;
    if (filters.maxRevenue != null && !(toInt(record.revenue) <= toInt(filters.maxRevenue))) return false;
    if (filters.currentConsumptionPositive && !(toNumber(record.current_consumption) > 0)) return false;
    if (filters.minDaysSinceLastDelivery != null) {
      const lastDate = Date.parse(toText(record.last_delivery));
      if (Number.isFinite(lastDate)) {
        const days = Math.max(0, Math.floor((Date.now() - lastDate) / 86400000));
        if (!(days >= toInt(filters.minDaysSinceLastDelivery))) return false;
      } else {
        return false;
      }
    }
    if (filters.maxDaysSinceLastDelivery != null) {
      const lastDate = Date.parse(toText(record.last_delivery));
      if (Number.isFinite(lastDate)) {
        const days = Math.max(0, Math.floor((Date.now() - lastDate) / 86400000));
        if (!(days <= toInt(filters.maxDaysSinceLastDelivery))) return false;
      } else {
        return false;
      }
    }
    if (filters.requireOrdersZero && toInt(record.orders) !== 0) return false;
    if (filters.requireOrdersPositive && !(toInt(record.orders) > 0)) return false;
    if (filters.requireNote && !toText(record.note)) return false;
    if (asArray(filters.noteTerms).length && !asArray(filters.noteTerms).some((token) => token && toKey(record.note).includes(toKey(token)))) return false;
    if (searchText && !haystack.includes(searchText)) return false;
    return true;
  });
}

function describeCustomerFilters(filters = {}) {
  return [
    ...asArray(filters.areas).map((area) => `area:${area}`),
    ...asArray(filters.hubs).map((hub) => `hub:${hub}`),
    ...(filters.requireActive ? ["status:active"] : []),
    ...(filters.statusType ? [`status:${filters.statusType}`] : []),
    ...asArray(filters.statusText).map((value) => `status:${value}`),
    ...(filters.wallet ? [`wallet:${filters.wallet}`] : []),
    ...(filters.requireBlocked ? ["status:blocked"] : []),
    ...(filters.requireDnd ? ["status:dnd"] : []),
    ...(filters.requireNoHub ? ["hub:no hub assigned"] : []),
    ...asArray(filters.paymentModes).map((value) => `payment:${value}`),
    ...asArray(filters.sources).map((value) => `source:${value}`),
    ...asArray(filters.deliveryBoys).map((value) => `delivery:${value}`),
    ...(filters.mobile ? [`mobile:${filters.mobile}`] : []),
    ...(filters.minRevenue != null ? [`min_revenue:${toInt(filters.minRevenue)}`] : []),
    ...(filters.maxRevenue != null ? [`max_revenue:${toInt(filters.maxRevenue)}`] : []),
    ...(filters.currentConsumptionPositive ? ["consumption:positive"] : []),
    ...(filters.minDaysSinceLastDelivery != null ? [`days_since_last_delivery>=${toInt(filters.minDaysSinceLastDelivery)}`] : []),
    ...(filters.maxDaysSinceLastDelivery != null ? [`days_since_last_delivery<=${toInt(filters.maxDaysSinceLastDelivery)}`] : []),
    ...(filters.requireOrdersZero ? ["orders:0"] : []),
    ...(filters.requireOrdersPositive ? ["orders:positive"] : []),
    ...(filters.requireNote ? ["note:present"] : []),
    ...asArray(filters.noteTerms).map((value) => `note:${value}`),
    ...asArray(filters.names).slice(0, 3).map((name) => `name:${name}`)
  ];
}

function inferResponseMode(query = "", controls = {}) {
  const q = toKey(query);
  if (isDeterministicCustomerQuery(query)) return "customer_preview";
  const primaryOutcome = inferPrimaryOutcome(controls);
  if (primaryOutcome === "customer_list") return "customer_preview";
  if (primaryOutcome === "scripts") return "script_brief";
  if (/(whatsapp|script|message template|call script|sms copy|reply copy)/.test(q) || toText(controls?.output_mode) === "Scripts") return "script_brief";
  if (/(calendar|festival|date|timeline|schedule|month plan|campaign calendar)/.test(q)) return "calendar_action";
  return "strategy_brief";
}

function buildProofStats(customers = []) {
  const rows = asArray(customers);
  return {
    count: rows.length,
    revenue: rows.reduce((sum, row) => sum + toInt(row.revenue), 0),
    active: rows.filter((row) => matchesCustomerStatus(row, "active")).length,
    inactive: rows.filter((row) => matchesCustomerStatus(row, "inactive")).length,
    suspended: rows.filter((row) => matchesCustomerStatus(row, "suspended")).length,
    trial: rows.filter((row) => matchesCustomerStatus(row, "trial")).length,
    negativeWallet: rows.filter((row) => toInt(row.wallet_balance) < 0).length,
    notesCaptured: rows.filter((row) => toText(row.note)).length
  };
}

const summarizeCustomerNote = (value, maxLength = 120) => {
  const note = toText(value).replace(/\s+/g, " ");
  if (!note) return "";
  if (note.length <= maxLength) return note;
  return `${note.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
};

function buildCustomerWhyItMatters(record, activeFilters = {}) {
  const reasons = [];
  if (activeFilters.mobile && toText(record.mobile).includes(activeFilters.mobile)) reasons.push("Matches requested mobile.");
  if (asArray(activeFilters.areas).includes(record.area)) reasons.push("Matches requested area.");
  if (asArray(activeFilters.hubs).includes(record.hub)) reasons.push("Matches requested hub.");
  if (activeFilters.status === "suspended" && /suspend/i.test(record.status)) reasons.push("Suspended service-risk account.");
  if (activeFilters.status === "inactive" && /inactive/i.test(record.status)) reasons.push("Inactive account for win-back.");
  if (activeFilters.status === "trial" && /trial/i.test(record.status)) reasons.push("Trial-stage account.");
  if (activeFilters.wallet === "negative" && record.wallet_balance < 0) reasons.push("Negative wallet balance.");
  if (activeFilters.wallet === "zero" && record.wallet_balance === 0) reasons.push("Zero wallet balance.");
  if (activeFilters.wallet === "positive" && record.wallet_balance > 0) reasons.push("Positive wallet balance.");
  if (activeFilters.minDaysSinceLastDelivery != null && toText(record.last_delivery)) reasons.push(`No delivery in the last ${toInt(activeFilters.minDaysSinceLastDelivery)} days.`);
  if (toText(record.note)) reasons.push(`Sales note captured: ${summarizeCustomerNote(record.note, 88)}`);
  if (!reasons.length && record.revenue > 0) reasons.push("High-value or query-relevant customer from current workbook.");
  return reasons.join(" ");
}

function buildCustomerQueryContext(data, query, limit = 8, previewOnly = false, forceAllMatches = false) {
  const records = getCustomerRecords(data);
  const q = toKey(query);
  const timeWindowDays = extractTimeWindowDays(query);
  const asksNoOrderWindow = /(no order|not placed any order|no successful order|last order|last delivery|inactive since|have not ordered|haven't ordered|not ordered)/.test(q);
  const requestedCount = extractRequestedCustomerCount(query, limit);
  const allAreas = Array.from(new Set(records.map((record) => record.area).filter(Boolean)));
  const allHubs = Array.from(new Set(records.map((record) => record.hub).filter(Boolean)));
  const matchedAreas = allAreas.filter((area) => q.includes(toKey(area)));
  const matchedHubs = allHubs.filter((hub) => q.includes(toKey(hub)));
  const mobileMatch = toText(query).match(/\b\d{7,}\b/)?.[0] || "";
  const namedCustomers = records.filter((record) => {
    const key = toKey(record.name);
    return key && key.length >= 6 && q.includes(key);
  });
  const activeFilters = {
    areas: matchedAreas,
    hubs: matchedHubs,
    mobile: mobileMatch,
    status: /suspend/.test(q) ? "suspended" : /inactive|reactivate|win back|churn/.test(q) ? "inactive" : /trial|new customer/.test(q) ? "trial" : "",
    wallet: /negative wallet|low balance|wallet risk/.test(q) ? "negative" : /\bzero wallet\b/.test(q) ? "zero" : /\bpositive wallet\b|\bwallet balance\b|\bwallet available\b|\bwallet amount\b/.test(q) ? "positive" : "",
    minDaysSinceLastDelivery: asksNoOrderWindow && timeWindowDays != null ? timeWindowDays : null
  };
  const namedCustomerKeys = namedCustomers.map((named) => `${toText(named.mobile)}|${toText(named.name)}|${toText(named.area)}`);
  const filterSpec = {
    areas: matchedAreas,
    hubs: matchedHubs,
    mobile: mobileMatch,
    customerKeys: namedCustomerKeys,
    statusType: activeFilters.status,
    wallet: activeFilters.wallet,
    requireActive: /\bactive\b/.test(q),
    requireBlocked: /\bblocked\b/.test(q),
    requireDnd: /\bdnd\b/.test(q),
    requireNoHub: /no hub|without hub|unassigned hub/.test(q),
    minDaysSinceLastDelivery: activeFilters.minDaysSinceLastDelivery,
    paymentModes: [
      ...(/\bcash\b/.test(q) ? ["cash"] : []),
      ...(/\bonline\b/.test(q) ? ["online"] : [])
    ],
    names: namedCustomers.map((named) => named.name)
  };
  const askedForList = isExplicitCustomerListQuery(query);
  let filtered = filterCustomerRecords(records, filterSpec);
  const usedExactFilters = Boolean(
    mobileMatch
    || matchedAreas.length
    || matchedHubs.length
    || namedCustomers.length
    || activeFilters.status
    || activeFilters.wallet
    || activeFilters.minDaysSinceLastDelivery != null
    || /\bactive\b/.test(q)
    || /\bblocked\b/.test(q)
    || /\bdnd\b/.test(q)
    || /no hub|without hub|unassigned hub/.test(q)
    || /\bcash\b/.test(q)
    || /\bonline\b/.test(q)
  );
  if (!filtered.length) filtered = findRelevantCustomers(data, query, Math.max(requestedCount, 8));
  const sortMode = /lowest wallet|negative wallet|low balance|wallet risk/.test(q)
    ? "wallet_asc"
    : /recent|latest delivery/.test(q)
      ? "last_delivery_desc"
      : "revenue_desc";
  const sorted = sortCustomerRecords(filtered, sortMode);
  const shouldReturnAllMatches = forceAllMatches || (!previewOnly && (askedForList || isExplicitCustomerExportQuery(query) || /\ball matching\b|\ball matched\b|\bentire\b|\bfull\b/.test(q)));
  const returnedCustomers = (shouldReturnAllMatches ? sorted : sorted.slice(0, requestedCount)).map((record) => ({
    ...record,
    why_it_matters: buildCustomerWhyItMatters(record, activeFilters)
  }));
  return {
    askedForList,
    shouldReturnAllMatches,
    usedExactFilters,
    totalMatches: sorted.length,
    returnedCount: returnedCustomers.length,
    sortMode,
    filterSpec,
    activeFilters,
    timeWindowDays,
    filtersApplied: describeCustomerFilters(filterSpec),
    customers: returnedCustomers
  };
}

function buildDatasetCitations(data, dataSource, customerRows = []) {
  const accessedAt = new Date().toISOString();
  const citations = [{
    type: "internal_dataset",
    source: dataSource || "Uploaded workbook",
    reference: `MrMilk customer dataset (${toText(data?.data_date) || "unknown date"})`,
    note: `${getCustomerRecords(data).length || toInt(data?.overview?.total_customers)} records loaded in current session`,
    accessed_at: accessedAt
  }];
  customerRows.slice(0, 4).forEach((customer) => {
    citations.push({
      type: "customer_row",
      source: dataSource || "Uploaded workbook",
      reference: `${customer.name} | ${customer.mobile} | ${customer.area}`,
      note: `status=${customer.status || "Unknown"}, revenue=${customer.revenue}, wallet=${customer.wallet_balance}, orders=${customer.orders}${toText(customer.note) ? `, sales_note=${summarizeCustomerNote(customer.note, 60)}` : ""}`,
      accessed_at: accessedAt
    });
  });
  return citations;
}

function buildExactCustomerListResponse({ data, query, dataSource, todayIso, role }) {
  const queryContext = buildCustomerQueryContext(data, query, 999999);
  const customers = queryContext.customers;
  const proofStats = buildProofStats(customers);
  const matchedRevenue = proofStats.revenue;
  const negativeWallet = proofStats.negativeWallet;
  const zeroWallet = customers.filter((customer) => toInt(customer.wallet_balance) === 0).length;
  const activeCount = proofStats.active;
  const inactiveCount = proofStats.inactive;
  const suspendedCount = proofStats.suspended;
  const uniqueAreas = Array.from(new Set(customers.map((customer) => customer.area).filter(Boolean)));
  const leadAreas = uniqueAreas.slice(0, 5).join(", ") || "No area match";
  const sortLabel = queryContext.sortMode === "wallet_asc"
    ? "wallet risk"
    : queryContext.sortMode === "last_delivery_desc"
      ? "latest delivery"
      : "revenue";
  const isoPlusDays = (days) => {
    const base = parseISODate(todayIso);
    const next = new Date(base);
    next.setDate(next.getDate() + days);
    return toISODateString(next);
  };
  const noMatches = !customers.length;
  const answer = noMatches
    ? `Exact dataset result for "${query}": no customers matched the current workbook filters. Check spelling, area names, status terms, or upload the correct dataset first.`
    : `Exact dataset result for "${query}": ${customers.length.toLocaleString()} matching customers found in the active workbook dated ${toText(data?.data_date) || "unknown date"}. This response returns the actual matched customer list sorted by ${sortLabel}, not a model-generated sample.`;
  return {
    answer,
    customer_data_list: customers,
    citations: buildDatasetCitations(data, dataSource, customers),
    confidence: noMatches ? 0.96 : queryContext.usedExactFilters ? 0.99 : 0.94,
    last_verified_at: new Date().toISOString(),
    model_used: {
      provider: "deterministic-local",
      model: "mrmilk-dataset-filter-v1",
      stage: "dataset_filter"
    },
    data_snapshot: {
      response_mode: "customer_proof",
      query_mode: "exact_customer_list",
      matched_customers: customers.length,
      total_customers_in_dataset: getCustomerRecords(data).length || toInt(data?.overview?.total_customers),
      matched_revenue: matchedRevenue,
      suspended_customers: suspendedCount,
      inactive_customers: inactiveCount,
      active_customers: activeCount,
      negative_wallet_customers: negativeWallet,
      zero_wallet_customers: zeroWallet,
      filters_applied: queryContext.filtersApplied,
      lead_areas: leadAreas,
      sort_mode: queryContext.sortMode,
      offer_policy_status: "clean",
      offer_policy_repairs: 0,
      offer_policy_summary: OFFER_POLICY.summary
    },
    area_intelligence: [{
      area: leadAreas,
      insight: noMatches ? "No matching customer rows found." : `${customers.length.toLocaleString()} customer rows matched the exact request.`,
      evidence: noMatches ? "Current workbook produced zero exact matches." : `Filters: ${queryContext.filtersApplied.join(", ") || "best relevance"} | Revenue: ${matchedRevenue.toLocaleString()}`,
      local_context: noMatches ? "Verify area/status wording or upload the correct workbook." : "This is a direct dataset filter result, not an inferred model list."
    }],
    root_cause: [{
      issue: noMatches ? "No dataset rows matched the exact prompt." : "The result is driven by exact customer rows from the uploaded workbook.",
      evidence: noMatches ? "Matched customers = 0." : `Matched customers = ${customers.length.toLocaleString()}; returned all ${customers.length.toLocaleString()} rows.`,
      impact: noMatches ? "No customer list can be produced until the filter or dataset changes." : "The customer list is legitimate because every row comes from the active workbook."
    }],
    priority_actions: [
      {
        rank: 1,
        owner: ROLES[role]?.title || "CRM Team",
        objective: noMatches ? "Validate input" : "Work the exact matched list",
        action: noMatches ? "Verify query wording, area names, and workbook date before retrying." : `Use this exact list of ${customers.length.toLocaleString()} customers for outreach or review.`,
        target_segment: queryContext.filtersApplied.join(", ") || "matched customers",
        due_date: todayIso,
        expected_outcome: noMatches ? "Correct filter alignment." : "No missing customer rows in action execution."
      },
      {
        rank: 2,
        owner: "CRM / Ops",
        objective: "Export proof list",
        action: noMatches ? "Upload the correct CSV/XLSX and rerun the query." : "Copy or export the full matched customer list and assign owners.",
        target_segment: "customer_data_list",
        due_date: isoPlusDays(1),
        expected_outcome: noMatches ? "Dataset aligned to request." : "Field team works the same verified list."
      },
      {
        rank: 3,
        owner: "Management",
        objective: "Audit legitimacy",
        action: "Cross-check a few sample rows from the workbook against the returned customer_data_list.",
        target_segment: "proof audit",
        due_date: isoPlusDays(2),
        expected_outcome: "Confidence that the result is exact and legitimate."
      }
    ],
    competitive_threat: [{
      competitor: "Not assessed",
      area: leadAreas,
      threat: "This mode is for exact customer retrieval, not competitor inference.",
      counter_move: "Ask a separate competitor-analysis prompt after verifying the customer list."
    }],
    timeline: {
      this_week: [
        { task: noMatches ? "Fix filter wording or dataset." : `Work all ${customers.length.toLocaleString()} matched customers from the current list.` }
      ],
      this_month: [
        { task: "Turn repeated exact-list requests into saved operational playbooks." }
      ],
      next_month: [
        { task: "Review which exact-list filters are used most and add dedicated buttons for them." }
      ]
    },
    whatsapp_scripts: [
      {
        segment: noMatches ? "No-match check" : "Matched customer outreach",
        objective: noMatches ? "Request correct input" : "Start outreach on the exact list",
        message: noMatches ? "Please verify area, status, or upload the correct workbook so I can return the exact customer list." : "Namaskar from Mr. Milk. We are reviewing your account and wanted to help you with your current service status. Please reply or call us so we can resolve it today.",
        cta: noMatches ? "Retry with a corrected query." : "Reply YES or call support now."
      },
      {
        segment: "Internal ops",
        objective: "Proof handling",
        message: noMatches ? "No customer rows matched this query in the active workbook." : `This exact customer list contains ${customers.length.toLocaleString()} matched rows from the active workbook. Use it as the source of truth.`,
        cta: "Copy customer list and assign next action."
      }
    ],
    deterministic: true
  };
}

function buildCustomerPreviewResponse({ data, query, dataSource, todayIso, role, queryContext = {}, groundedResult = {}, disclosureIntent = "preview" }) {
  const customers = asArray(groundedResult.customers).length ? asArray(groundedResult.customers) : asArray(queryContext.customers);
  const previewRows = asArray(groundedResult.preview).length ? asArray(groundedResult.preview) : customers.slice(0, PROOF_TABLE_PREVIEW_ROWS);
  const summary = asObject(groundedResult.summary);
  const matchedCount = toInt(summary.matched_customers || customers.length);
  const matchedRevenue = toInt(summary.matched_revenue || buildProofStats(customers).revenue);
  const leadAreas = asArray(groundedResult.topAreas).slice(0, 3).map((row) => toText(row.area)).filter(Boolean);
  const leadStatuses = asArray(groundedResult.topStatuses).slice(0, 3).map((row) => `${toText(row.status)} (${toInt(row.customers)})`).filter(Boolean);
  const rulesUsed = [];
  if (queryContext.activeFilters?.wallet === "positive") rulesUsed.push("positive wallet balance");
  if (queryContext.activeFilters?.wallet === "negative") rulesUsed.push("negative wallet balance");
  if (queryContext.activeFilters?.wallet === "zero") rulesUsed.push("zero wallet balance");
  if (queryContext.activeFilters?.status === "inactive") rulesUsed.push("inactive status");
  if (queryContext.activeFilters?.status === "suspended") rulesUsed.push("suspended status");
  if (queryContext.activeFilters?.status === "trial") rulesUsed.push("trial/new customer status");
  if (queryContext.activeFilters?.minDaysSinceLastDelivery != null) rulesUsed.push(`no successful delivery in the last ${toInt(queryContext.activeFilters.minDaysSinceLastDelivery)} days`);
  if (asArray(queryContext.filtersApplied).some((item) => /^area:/.test(item))) rulesUsed.push(`area filtered to ${leadAreas.join(", ") || "requested area"}`);
  const ruleExplanation = rulesUsed.join(" + ") || "direct workbook relevance from the active filters";
  const noMatches = matchedCount === 0;
  const answer = noMatches
    ? `No customers matched this condition in the active workbook dated ${toText(data?.data_date) || "unknown date"}. Refine the timeframe, area, status, or wallet rule and try again.`
    : `Yes. ${matchedCount.toLocaleString()} customers match this condition in the active workbook dated ${toText(data?.data_date) || "unknown date"}. Main condition: ${ruleExplanation}.`;
  return {
    answer,
    customer_data_list: customers.map((row) => ({
      ...normalizeCustomerRecord(row),
      why_it_matters: toText(row.why_it_matters) || buildCustomerWhyItMatters(normalizeCustomerRecord(row), queryContext.activeFilters || {})
    })),
    citations: buildDatasetCitations(data, dataSource, previewRows),
    confidence: noMatches ? 0.98 : queryContext.usedExactFilters ? 0.99 : 0.92,
    last_verified_at: new Date().toISOString(),
    model_used: {
      provider: "deterministic-local",
      model: "mrmilk-duckdb-preview-v1",
      stage: "preview_summary"
    },
    data_snapshot: {
      response_mode: "customer_preview",
      query_mode: "preview_summary",
      matched_customers: matchedCount,
      preview_rows: previewRows.length,
      total_customers_in_dataset: getCustomerRecords(data).length || toInt(data?.overview?.total_customers),
      matched_revenue: matchedRevenue,
      positive_wallet_customers: toInt(summary.positive_wallet_customers),
      zero_wallet_customers: toInt(summary.zero_wallet_customers),
      negative_wallet_customers: toInt(summary.negative_wallet_customers),
      active_customers: toInt(summary.active_customers),
      inactive_customers: toInt(summary.inactive_customers),
      suspended_customers: toInt(summary.suspended_customers),
      notes_captured: toInt(summary.notes_captured),
      min_days_since_last_delivery: summary.min_days_since_last_delivery,
      max_days_since_last_delivery: summary.max_days_since_last_delivery,
      filters_applied: asArray(queryContext.filtersApplied),
      lead_areas: leadAreas.join(", ") || "No area match",
      lead_statuses: leadStatuses.join(", ") || "No status concentration",
      sort_mode: toText(queryContext.sortMode) || "revenue_desc",
      disclosure_mode: "two_step",
      explicit_customer_action: disclosureIntent,
      data_source: dataSource || "Current workbook",
      data_timestamp: toText(data?.data_date),
      offer_policy_status: "clean",
      offer_policy_repairs: 0,
      offer_policy_summary: OFFER_POLICY.summary,
      business_definitions: BUSINESS_DEFINITIONS
    },
    area_intelligence: [{
      area: leadAreas.join(", ") || "Current workbook",
      insight: noMatches ? "No rows matched the requested customer condition." : `${matchedCount.toLocaleString()} customers matched. Top areas: ${leadAreas.join(", ") || "mixed"}.`,
      evidence: noMatches ? "Matched customers = 0." : `Filters used: ${asArray(queryContext.filtersApplied).join(", ") || "best workbook relevance"} | Matched revenue: ${matchedRevenue.toLocaleString()}`,
      local_context: queryContext.activeFilters?.minDaysSinceLastDelivery != null ? BUSINESS_DEFINITIONS.last_order_proxy : BUSINESS_DEFINITIONS.data_grounding
    }],
    root_cause: [{
      issue: noMatches ? "The current workbook does not contain rows that satisfy the requested condition." : "Matched customers were grounded directly from the active workbook using deterministic filters.",
      evidence: `Main rule: ${ruleExplanation}. Source date: ${toText(data?.data_date) || "unknown date"}.`,
      impact: noMatches ? "No list is shown until the query is refined." : "The full list is available on demand, but it is intentionally hidden until you click View Customer Details."
    }],
    priority_actions: [
      {
        rank: 1,
        owner: ROLES[role]?.title || "CRM Team",
        objective: "Review the preview summary",
        action: noMatches ? "Refine the timeframe, area, or wallet condition before opening proof." : `Review the ${matchedCount.toLocaleString()} matched customers summary before opening the full list.`,
        target_segment: ruleExplanation,
        due_date: todayIso,
        expected_outcome: noMatches ? "Cleaner filters." : "A controlled preview-first workflow."
      },
      {
        rank: 2,
        owner: "CRM / Ops",
        objective: "Open the full list only when needed",
        action: noMatches ? "Do not open proof until the query returns matches." : "Use View Customer Details to open the paginated proof workspace with search and export.",
        target_segment: "customer preview",
        due_date: todayIso,
        expected_outcome: "No raw customer dump inside chat."
      },
      {
        rank: 3,
        owner: "Management",
        objective: "Audit the logic",
        action: "Check the filters, source, and generated timestamp before acting on the result.",
        target_segment: "audit trail",
        due_date: todayIso,
        expected_outcome: "Traceable, legitimate analytics."
      }
    ],
    competitive_threat: [],
    timeline: {
      this_week: [],
      this_month: [],
      next_month: []
    },
    whatsapp_scripts: [],
    deterministic: true
  };
}

function buildOfferPolicyFallbackResponse({ data, query, dataSource, todayIso, role, controls = {} }) {
  const lifecycle = classifyOfferLifecycle({ query, controls });
  const proofContext = buildCustomerQueryContext(data, query, 6, true, false);
  const customers = proofContext.customers;
  const nextDay = (() => {
    const base = parseISODate(todayIso);
    const next = new Date(base);
    next.setDate(next.getDate() + 1);
    return toISODateString(next);
  })();
  return {
    answer: `The original draft was blocked because it conflicted with MrMilk's premium-value policy. This replacement keeps the plan service-led and grounded in the current workbook.`,
    customer_data_list: customers,
    citations: buildDatasetCitations(data, dataSource, customers),
    confidence: customers.length ? 0.82 : 0.74,
    last_verified_at: new Date().toISOString(),
    model_used: {
      provider: "policy-guardrail",
      model: "mrmilk-offer-policy-v1",
      stage: "guardrail_replacement"
    },
    data_snapshot: {
      response_mode: inferResponseMode(query, controls),
      matched_customers: customers.length,
      filters_applied: proofContext.filtersApplied,
      offer_policy_status: "blocked",
      offer_policy_repairs: 0,
      offer_policy_summary: OFFER_POLICY.summary
    },
    area_intelligence: customers.length ? [{
      area: customers[0]?.area || "Current workbook",
      insight: "The visible evidence pack still supports a premium-safe next step.",
      evidence: `${customers.length.toLocaleString()} customer rows attached from the current workbook.`,
      local_context: "Use these rows for proof while keeping all customer communication service-led."
    }] : [],
    root_cause: [{
      issue: "Price-led or promotional wording was detected.",
      evidence: OFFER_POLICY.summary,
      impact: "The app replaced the unsafe plan before it reached the user."
    }],
    priority_actions: [
      {
        rank: 1,
        owner: ROLES[role]?.title || "CRM Team",
        objective: "Stay premium-safe",
        action: getPolicySafeCopy({ stage: lifecycle, field: "action" }),
        target_segment: lifecycle,
        due_date: todayIso,
        expected_outcome: getPolicySafeCopy({ stage: lifecycle, field: "expected_outcome" })
      },
      {
        rank: 2,
        owner: "CRM / Support",
        objective: "Use approved messaging",
        action: "Use only brand-safe scripts and escalation paths that avoid price-led or volume-push language.",
        target_segment: "customer communication",
        due_date: nextDay,
        expected_outcome: "Every outreach stays aligned to MrMilk ethics."
      }
    ],
    competitive_threat: [],
    timeline: {
      this_week: [{ task: "Review the blocked response, keep the safe replacement, and execute the approved premium-value path." }],
      this_month: [],
      next_month: []
    },
    whatsapp_scripts: [{
      segment: lifecycle.replace(/_/g, " "),
      objective: "Approved customer communication",
      message: getPolicySafeCopy({ stage: lifecycle, field: "message" }),
      cta: getPolicySafeCopy({ stage: lifecycle, field: "cta" })
    }]
  };
}

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
    answer: toText(p.answer),
    customer_data_list: asArray(p.customer_data_list).map((item) => asObject(item)),
    citations: asArray(p.citations).map((item) => asObject(item)),
    confidence: clampConfidence(p.confidence),
    last_verified_at: toText(p.last_verified_at),
    model_used: asObject(p.model_used),
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

const inferResearchAnswer = (parsed, customerRows = []) => {
  if (parsed.answer) return parsed.answer;
  const leadAction = asArray(parsed.priority_actions)[0];
  const leadIssue = asArray(parsed.root_cause)[0];
  const leadCustomer = customerRows[0];
  const issueText = toText(leadIssue?.issue || leadIssue?.impact || "The dataset shows an immediate retention and revenue leak.");
  const customerText = leadCustomer?.name ? `Priority proof customer: ${leadCustomer.name} (${leadCustomer.mobile}) in ${leadCustomer.area}.` : "";
  const actionText = toText(leadAction?.action || leadAction?.expected_outcome || "Act on the top flagged customers first.");
  return [issueText, customerText, actionText].filter(Boolean).join(" ");
};

const enrichStructuredResponse = (payload, meta = {}) => {
  const parsed = normalizeStructuredResponse(payload);
  const sourceCustomerRows = (meta.useFullCustomerRows && asArray(meta.fullCustomerRows).length)
    ? asArray(meta.fullCustomerRows)
    : asArray(meta.customerRows);
  const customerRows = sourceCustomerRows.length
    ? sourceCustomerRows.map((customer) => ({
        name: customer.name,
        mobile: customer.mobile,
        area: customer.area,
        hub: customer.hub,
        status: customer.status,
        revenue: customer.revenue,
        wallet_balance: customer.wallet_balance,
        orders: customer.orders,
        last_delivery: customer.last_delivery || "",
        source: customer.source || "",
        payment_mode: customer.payment_mode || "",
        note: customer.note || "",
        why_it_matters: customer.wallet_balance < 0
          ? "Negative wallet or service-risk customer."
          : toText(customer.note)
            ? `Sales note captured: ${summarizeCustomerNote(customer.note, 88)}`
          : /inactive|suspend/i.test(toText(customer.status))
            ? "Recovery-risk customer."
            : "High-value proof point from current dataset."
      }))
    : asArray(parsed.customer_data_list);
  const citations = asArray(parsed.citations).length ? parsed.citations : buildDatasetCitations(meta.data, meta.dataSource, customerRows);
  const modelName = meta.model || PROVIDER_META[meta.provider]?.defaultModel || "";
  const responseMode = toText(parsed?.data_snapshot?.response_mode || meta.responseMode || inferResponseMode(meta.query, meta.controls));
  const dataSnapshot = {
    ...asObject(parsed.data_snapshot),
    response_mode: responseMode || "strategy_brief"
  };
  if (meta.useFullCustomerRows) {
    dataSnapshot.matched_customers = customerRows.length;
    dataSnapshot.returned_proof_rows = customerRows.length;
    dataSnapshot.full_proof_attached = true;
    if (!asArray(dataSnapshot.filters_applied).length && asArray(meta.fullCustomerFilters).length) dataSnapshot.filters_applied = asArray(meta.fullCustomerFilters);
  }
  return {
    ...parsed,
    answer: inferResearchAnswer(parsed, customerRows),
    customer_data_list: customerRows,
    citations,
    confidence: parsed.confidence ?? (customerRows.length >= 3 ? 0.86 : 0.72),
    last_verified_at: parsed.last_verified_at || meta.generatedAt || new Date().toISOString(),
    data_snapshot: dataSnapshot,
    model_used: Object.keys(parsed.model_used).length ? parsed.model_used : {
      provider: meta.provider || "unknown",
      model: modelName,
      stage: meta.usedSearch ? "search_plus_dataset_grounded" : "dataset_grounded_synthesis"
    }
  };
};

const validateStructuredResponse = (payload) => {
  const errors = [];
  const parsed = normalizeStructuredResponse(payload);
  const responseMode = toText(parsed?.data_snapshot?.response_mode || parsed?.data_snapshot?.query_mode || "strategy_brief");
  const timelineTaskCount = asArray(parsed?.timeline?.this_week).length + asArray(parsed?.timeline?.this_month).length + asArray(parsed?.timeline?.next_month).length;
  const supportSectionCount = parsed.area_intelligence.length + parsed.root_cause.length + parsed.priority_actions.length + parsed.competitive_threat.length + parsed.whatsapp_scripts.length + timelineTaskCount;
  const policyStatus = toText(parsed?.data_snapshot?.offer_policy_status || "clean");
  REQUIRED_RESPONSE_KEYS.forEach((k) => {
    if (!(k in parsed)) errors.push(`Missing top-level key: ${k}`);
  });
  if (!parsed.answer) errors.push("answer must be a non-empty string.");
  if (!parsed.customer_data_list.length && toInt(parsed?.data_snapshot?.matched_customers) !== 0) errors.push("customer_data_list must contain at least one real customer record.");
  if (!parsed.citations.length) errors.push("citations must contain at least one citation.");
  if (parsed.confidence == null) errors.push("confidence must be a number between 0 and 1.");
  if (!parsed.last_verified_at) errors.push("last_verified_at must be an ISO timestamp.");
  if (!toText(parsed.model_used?.provider) || !toText(parsed.model_used?.model)) errors.push("model_used must contain provider and model.");
  if (!Object.keys(parsed.data_snapshot).length) errors.push("data_snapshot must be an object with metrics.");
  if (!supportSectionCount) errors.push("At least one supporting section must be populated.");
  if ((responseMode === "strategy_brief" || responseMode === "calendar_action") && !parsed.area_intelligence.length) errors.push("area_intelligence must contain at least one item for strategy/calendar answers.");
  if (responseMode === "strategy_brief" && !parsed.root_cause.length) errors.push("root_cause must contain at least one item for strategy answers.");
  if ((responseMode === "strategy_brief" || responseMode === "customer_proof" || responseMode === "customer_preview" || responseMode === "calendar_action" || responseMode === "script_brief") && !parsed.priority_actions.length) {
    errors.push("priority_actions must contain at least one item.");
  }
  if (responseMode === "calendar_action" && !timelineTaskCount) errors.push("timeline must include at least one task for calendar answers.");
  if (responseMode === "script_brief" && !parsed.whatsapp_scripts.length) errors.push("whatsapp_scripts must contain at least one script for script answers.");
  if (policyStatus === "blocked") errors.push("brand policy violation remains after guardrail repair.");
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
  const responseMode = toText(structured?.data_snapshot?.response_mode || analysisPacket?.response_mode || "strategy_brief");
  const timelineTaskCount = asArray(structured?.timeline?.this_week).length + asArray(structured?.timeline?.this_month).length + asArray(structured?.timeline?.next_month).length;
  const policyStatus = toText(structured?.data_snapshot?.offer_policy_status || "clean");
  const policyRepairs = toInt(structured?.data_snapshot?.offer_policy_repairs);
  let score = 0;
  const issues = [];
  if (structured.answer) score += 8; else issues.push("Grounded answer missing.");
  if (structured.customer_data_list.length >= 3 || toInt(structured?.data_snapshot?.matched_customers) === 0) score += 10; else issues.push("Need at least 3 customer evidence rows.");
  if (structured.citations.length >= 1) score += 8; else issues.push("Citation layer missing.");
  if (structured.confidence != null && structured.last_verified_at && toText(structured.model_used?.model)) score += 6; else issues.push("Research metadata incomplete.");
  if (Object.keys(structured.data_snapshot).length) score += 12; else issues.push("Data snapshot empty.");
  if (responseMode === "customer_proof" || responseMode === "customer_preview") {
    if (structured.priority_actions.length >= 1) score += 16; else issues.push("Need at least one next step for proof rows.");
    if (structured.area_intelligence.length >= 1) score += 10; else issues.push("Need one clear proof summary.");
    if (responseMode === "customer_proof") {
      if (toInt(structured?.data_snapshot?.matched_customers) === structured.customer_data_list.length) score += 20; else issues.push("Matched-customer count should equal returned proof rows in customer proof mode.");
    } else if (toInt(structured?.data_snapshot?.matched_customers) >= structured.customer_data_list.length) {
      score += 20;
    } else {
      issues.push("Matched-customer count should not be lower than attached preview rows.");
    }
    if (structured.root_cause.length >= 1) score += 10; else issues.push("Need one legitimacy statement for the returned list.");
  } else if (responseMode === "script_brief") {
    if (structured.priority_actions.length >= 2) score += 14; else issues.push("Need at least 2 priority actions.");
    if (structured.whatsapp_scripts.length >= 2) score += 18; else issues.push("Need at least 2 WhatsApp scripts.");
    if (structured.root_cause.length >= 1) score += 8; else issues.push("Need one clear reason for the script plan.");
    if (structured.area_intelligence.length >= 1) score += 8; else issues.push("Need one local-data note.");
    if (timelineTaskCount) score += 6;
  } else if (responseMode === "calendar_action") {
    if (structured.area_intelligence.length >= 1) score += 10; else issues.push("Need one market note for the calendar plan.");
    if (structured.priority_actions.length >= 2) score += 14; else issues.push("Need at least 2 priority actions.");
    if (timelineTaskCount >= 2) score += 16; else issues.push("Need a working timeline for the calendar plan.");
    if (structured.whatsapp_scripts.length >= 1) score += 6;
  } else {
    if (structured.area_intelligence.length >= 2) score += 12; else issues.push("Area intelligence too shallow.");
    if (structured.root_cause.length >= 2) score += 12; else issues.push("Root cause too shallow.");
    if (structured.priority_actions.length >= 3) score += 15; else issues.push("Need at least 3 priority actions.");
    if (structured.competitive_threat.length >= 1) score += 7;
    if (timelineTaskCount >= 2) score += 5; else issues.push("Timeline needs more coverage.");
    if (structured.whatsapp_scripts.length >= 1) score += 4;
  }

  const packetTotal = toInt(analysisPacket?.overview?.total_customers);
  const snapTotal = toInt(structured?.data_snapshot?.total_customers || structured?.data_snapshot?.total_customers_in_dataset);
  if (packetTotal && snapTotal && packetTotal === snapTotal) score += 10;
  else issues.push("data_snapshot total_customers mismatch with analysis packet.");
  if (policyStatus === "blocked") issues.push("Brand policy blocked promotional language.");
  else if (policyRepairs > 0) issues.push("Brand policy auto-repaired promotional language.");
  else score += 4;

  return { score: Math.min(score, 100), issues };
};

const toRupee = (n) => `Rs ${toInt(n).toLocaleString()}`;

const buildAnalysisEnginePacket = (data, controls, todayIso, query = "", dataSource = "") => {
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
  const responseMode = inferResponseMode(query, controls);
  const customerQueryContext = buildCustomerQueryContext(data, query, responseMode === "customer_proof" || responseMode === "customer_preview" ? 24 : 12);
  const relevantCustomers = customerQueryContext.customers;

  const inactiveRate = overview.total_customers ? Number(((toNumber(overview.inactive_customers) / toNumber(overview.total_customers)) * 100).toFixed(2)) : 0;
  return {
    generated_at: new Date().toISOString(),
    today_iso: todayIso,
    query,
    response_mode: responseMode,
    controls,
    offer_policy: {
      principle: OFFER_POLICY.principle,
      summary: OFFER_POLICY.summary,
      allowed_acquisition_offer: OFFER_POLICY.allowedAcquisitionOffer,
      allowed_frames: OFFER_POLICY.allowedFrames
    },
    dataset_meta: {
      data_date: toText(data?.data_date),
      data_source: dataSource || "Current workbook",
      total_customer_records: getCustomerRecords(data).length || toInt(overview.total_customers)
    },
    customer_match_summary: {
      asked_for_list: customerQueryContext.askedForList,
      used_exact_filters: customerQueryContext.usedExactFilters,
      total_matches: customerQueryContext.totalMatches,
      returned_count: customerQueryContext.returnedCount,
      filters_applied: customerQueryContext.filtersApplied
    },
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
    customer_evidence_pack: relevantCustomers,
    citation_hints: buildDatasetCitations(data, dataSource, relevantCustomers),
    payment_mode: asObject(data?.payment_mode),
    top_sources: asObject(data?.sources)
  };
};

const buildStructuredSystemInstructions = ({ role, controls, personaPlaybook, todayIso, responseMode }) => {
  const resolvedResponseMode = responseMode || inferResponseMode("", controls);
  const primaryOutcome = inferPrimaryOutcome(controls);
  return [
    `You are MrMilk AI, a senior Pune marketing specialist.`,
    `Today (Asia/Kolkata): ${todayIso}.`,
    `Role context: ${ROLES[role]?.title || "Team"} | Focus: ${ROLES[role]?.focus || ""}`,
    `Persona playbook: ${personaPlaybook.label}. Style: ${personaPlaybook.style}.`,
    `Objection handling: ${personaPlaybook.objection_handling.join(", ")}.`,
    `Call flow: ${personaPlaybook.call_flow.join(" -> ")}.`,
    `Controls: primary_outcome=${primaryOutcome}, objective=${controls.objective}, depth=${controls.depth}, tone=${controls.tone}, output_mode=${controls.output_mode}.`,
    `Default response mode from controls: ${resolvedResponseMode}. Actual query-specific response_mode may differ in the analysis packet.`,
    `BRAND POLICY - NON-NEGOTIABLE: ${OFFER_POLICY.summary}`,
    `Allowed premium value frames only: ${OFFER_POLICY.allowedFrames.join(", ")}.`,
    `If the lifecycle is first-time acquisition, the only allowed offer is: ${OFFER_POLICY.allowedAcquisitionOffer}`,
    `If the lifecycle is retention or reactivation, do not use any price-led offer. Use service-value moves such as preferred restart date, personalized quantity planning, wallet guidance, delivery continuity support, premium reassurance, or founder/team callback.`,
    `Never use words or ideas such as discount, off, save more, cashback, coupon, free, bundle, combo, bonus, wallet credit, or bulk deal.`,
    `Make the response feel premium and trust-led, not promotional.`,
    `NON-NEGOTIABLE: Return ONLY strict JSON. No markdown. No prose outside JSON.`,
    `Required top-level keys exactly: ${REQUIRED_RESPONSE_KEYS.join(", ")}.`,
    `Field expectations:`,
    `- answer: 2-5 sentences, directly grounded in the dataset and customer evidence pack.`,
    `- customer_data_list: array of real customers from customer_evidence_pack only. Never invent or rename customers. Include name, mobile, area, hub, status, revenue, wallet_balance, orders, last_delivery, source, payment_mode, note, why_it_matters.`,
    `- citations: array with type, source, reference, note, accessed_at. Use citation_hints and never invent external sources.`,
    `- confidence: numeric score from 0 to 1.`,
    `- last_verified_at: ISO timestamp from analysis packet generated_at.`,
    `- model_used: object with provider, model, stage.`,
    `- data_snapshot: object with exact numbers from analysis packet (no made-up figures).`,
    `- area_intelligence: array of objects with area, insight, evidence, local_context.`,
    `- root_cause: array of objects with issue, evidence, impact.`,
    `- priority_actions: ranked array with rank, owner, objective, action, target_segment, due_date, expected_outcome.`,
    `- competitive_threat: array with competitor, area, threat, counter_move.`,
    `- timeline: object with arrays this_week, this_month, next_month (date-bound tasks).`,
    `- whatsapp_scripts: array with segment, objective, message, cta.`,
    `- data_snapshot.response_mode: must be one of customer_preview, customer_proof, script_brief, calendar_action, strategy_brief and must match the analysis packet intent.`,
    `- data_snapshot.offer_policy_status: set to clean, repaired, or blocked.`,
    `- data_snapshot.offer_policy_repairs: integer count.`,
    `If customer_match_summary.total_matches is higher than returned_count, say so in the answer.`,
    `Do NOT force every section to be populated. Keep all top-level keys, but for sections that are not relevant to the response_mode, return an empty array or empty timeline buckets.`,
    `If response_mode is customer_preview: summarize the matched customers first, keep customer_data_list grounded but do not narrate the raw list inline, and focus on answer, citations, data_snapshot, area_intelligence, root_cause, and priority_actions.`,
    `If response_mode is customer_proof: focus on answer, customer_data_list, citations, confidence, data_snapshot, and priority_actions. Leave competitive_threat/timeline/whatsapp_scripts empty unless explicitly asked.`,
    `If response_mode is script_brief: prioritize priority_actions and whatsapp_scripts, with only light diagnostic sections.`,
    `If response_mode is calendar_action: prioritize area_intelligence, priority_actions, and timeline.`,
    `If response_mode is strategy_brief: use root_cause, priority_actions, and area_intelligence first; only include competitive_threat if directly supported.`,
    `Never claim training. You are grounded on the current uploaded dataset and evidence pack.`,
    `If data is insufficient, keep keys and return conservative placeholders, but never break schema.`
  ].join("\n");
};

const structuredToMarkdown = (s) => {
  const responseMode = toText(s?.data_snapshot?.response_mode || s?.data_snapshot?.query_mode || "strategy_brief");
  const snap = asObject(s?.data_snapshot);
  const timeline = asObject(s?.timeline);
  const proofRows = asArray(s?.customer_data_list);
  const showInlineProofTable = proofRows.length > 0 && proofRows.length <= PROOF_TABLE_PREVIEW_ROWS;
  const previewRows = proofRows.slice(0, PROOF_TABLE_PREVIEW_ROWS);
  const policyStatus = toText(snap.offer_policy_status || "clean");
  const md = [];
  const addSection = (title, lines = []) => {
    const clean = lines.map((line) => toText(line)).filter(Boolean);
    if (!clean.length) return;
    md.push(`## ${title}`);
    md.push(...clean);
  };
  const proofSection = (title = "Supporting Customers") => {
    if (!previewRows.length) {
      addSection(title, ["- No customer evidence returned."]);
      return;
    }
    md.push(`## ${title}`);
    if (showInlineProofTable) {
      md.push("| **Name** | **Mobile** | **Area** | **Status** | **Revenue** | **Wallet** | **Orders** | **Note** | **Why It Matters** |");
      md.push("|---|---|---|---|---|---|---|---|---|");
      previewRows.forEach((customer) => {
        md.push(`| ${toText(customer?.name)} | ${toText(customer?.mobile)} | ${toText(customer?.area)} | ${toText(customer?.status)} | ${toInt(customer?.revenue).toLocaleString()} | ${toInt(customer?.wallet_balance).toLocaleString()} | ${toInt(customer?.orders).toLocaleString()} | ${summarizeCustomerNote(customer?.note, 70) || "-"} | ${toText(customer?.why_it_matters)} |`);
      });
    } else {
      previewRows.forEach((customer, index) => {
        md.push(`${index + 1}. ${toText(customer?.name)} | ${toText(customer?.mobile)} | ${toText(customer?.area)} | ${toText(customer?.status)} | revenue ${toInt(customer?.revenue).toLocaleString()} | wallet ${toInt(customer?.wallet_balance).toLocaleString()} | note ${summarizeCustomerNote(customer?.note, 70) || "-"} | ${toText(customer?.why_it_matters)}`);
      });
      md.push(`- Open the full proof list to inspect all ${proofRows.length.toLocaleString()} matched customers.`);
    }
  };
  const verificationLines = [
    `- Response type: ${responseMode.replace(/_/g, " ")}`,
    `- Proof rows attached: ${proofRows.length.toLocaleString()}`,
    `- Confidence: ${typeof s?.confidence === "number" ? s.confidence.toFixed(2) : toText(s?.confidence)}`,
    `- Last verified: ${toText(s?.last_verified_at)}`,
    `- Source: ${toText(s?.model_used?.provider)} / ${toText(s?.model_used?.model)} / ${toText(s?.model_used?.stage)}`,
    `- Brand policy: ${policyStatus}${toInt(snap.offer_policy_repairs) ? ` (${toInt(snap.offer_policy_repairs)} auto-repair)` : ""}`
  ];
  if (toText(snap.data_source)) verificationLines.push(`- Data source: ${toText(snap.data_source)}`);
  if (toText(snap.data_timestamp)) verificationLines.push(`- Data timestamp: ${toText(snap.data_timestamp)}`);
  if (toText(snap.explicit_customer_action)) verificationLines.push(`- Disclosure flow: ${toText(snap.explicit_customer_action)} -> view customer details on click`);
  if (asArray(snap.filters_applied).length) verificationLines.push(`- Filters used: ${asArray(snap.filters_applied).join(", ")}`);
  asArray(s?.citations).slice(0, 3).forEach((citation, index) => {
    verificationLines.push(`- Citation ${index + 1}: ${toText(citation?.reference)} | ${toText(citation?.note)}`);
  });

  if (responseMode === "customer_preview") {
    addSection("Match Summary", [toText(s?.answer) || "No grounded answer returned."]);
    addSection("What Matched", [
      `- Matched customers: ${toInt(snap.matched_customers).toLocaleString()}`,
      `- Main filters: ${asArray(snap.filters_applied).join(", ") || "best workbook relevance"}`,
      `- Lead areas: ${toText(snap.lead_areas) || "Mixed"}`,
      `- Lead statuses: ${toText(snap.lead_statuses) || "Mixed"}`,
      `- Notes captured: ${toInt(snap.notes_captured).toLocaleString()}`
    ]);
    addSection("Why They Matched", [
      ...asArray(s?.root_cause).map((x, i) => `${i + 1}. ${toText(x?.issue)} | evidence: ${toText(x?.evidence)}`),
      ...asArray(s?.area_intelligence).map((x, i) => `${i + 1}. ${toText(x?.area)}: ${toText(x?.insight)} | ${toText(x?.local_context)}`)
    ]);
    addSection("Next Step", asArray(s?.priority_actions).map((x, i) => `${i + 1}. [${toText(x?.owner)}] ${toText(x?.action)} | expected ${toText(x?.expected_outcome)}`));
    addSection("Verification", verificationLines);
    return md.join("\n");
  }

  if (responseMode === "customer_proof") {
    addSection("What This Means", [toText(s?.answer) || "No grounded answer returned."]);
    proofSection("Verified Customers");
    addSection("How To Use This List", asArray(s?.priority_actions).map((x, i) => `${i + 1}. [${toText(x?.owner)}] ${toText(x?.action)} | due ${toText(x?.due_date)} | expected ${toText(x?.expected_outcome)}`));
    addSection("Why These Customers Matter", [
      ...asArray(s?.area_intelligence).map((x, i) => `${i + 1}. ${toText(x?.area)}: ${toText(x?.insight)} | evidence: ${toText(x?.evidence)}`),
      ...asArray(s?.root_cause).map((x, i) => `${i + 1}. ${toText(x?.issue)} | ${toText(x?.impact)}`)
    ]);
    addSection("Verification", verificationLines);
    return md.join("\n");
  }

  if (responseMode === "script_brief") {
    addSection("Recommended Approach", [toText(s?.answer) || "No grounded answer returned."]);
    addSection("Immediate Actions", asArray(s?.priority_actions).map((x, i) => `${i + 1}. [${toText(x?.owner)}] ${toText(x?.action)} | due ${toText(x?.due_date)} | expected ${toText(x?.expected_outcome)}`));
    if (asArray(s?.whatsapp_scripts).length) {
      md.push("## Ready-To-Send Scripts");
      asArray(s?.whatsapp_scripts).forEach((x, i) => {
        md.push(`### Script ${i + 1}: ${toText(x?.segment)} (${toText(x?.objective)})`);
        md.push(`- Message: ${toText(x?.message)}`);
        md.push(`- CTA: ${toText(x?.cta)}`);
      });
    }
    proofSection("Supporting Customers");
    addSection("Context", [
      ...asArray(s?.root_cause).map((x, i) => `${i + 1}. ${toText(x?.issue)} | evidence: ${toText(x?.evidence)}`),
      ...asArray(s?.area_intelligence).map((x, i) => `${i + 1}. ${toText(x?.area)}: ${toText(x?.insight)}`)
    ]);
    addSection("Verification", verificationLines);
    return md.join("\n");
  }

  if (responseMode === "calendar_action") {
    addSection("Campaign View", [toText(s?.answer) || "No grounded answer returned."]);
    addSection("Area Signals", asArray(s?.area_intelligence).map((x, i) => `${i + 1}. ${toText(x?.area)}: ${toText(x?.insight)} | evidence: ${toText(x?.evidence)} | local context: ${toText(x?.local_context)}`));
    addSection("Action Plan", asArray(s?.priority_actions).map((x, i) => `${i + 1}. [${toText(x?.owner)}] ${toText(x?.action)} | due ${toText(x?.due_date)} | expected ${toText(x?.expected_outcome)}`));
    if (asArray(timeline.this_week).length || asArray(timeline.this_month).length || asArray(timeline.next_month).length) {
      md.push("## Timeline");
      if (asArray(timeline.this_week).length) {
        md.push("### This Week");
        asArray(timeline.this_week).forEach((x) => md.push(`- ${toText(typeof x === "string" ? x : x?.task || JSON.stringify(x))}`));
      }
      if (asArray(timeline.this_month).length) {
        md.push("### This Month");
        asArray(timeline.this_month).forEach((x) => md.push(`- ${toText(typeof x === "string" ? x : x?.task || JSON.stringify(x))}`));
      }
      if (asArray(timeline.next_month).length) {
        md.push("### Next Month");
        asArray(timeline.next_month).forEach((x) => md.push(`- ${toText(typeof x === "string" ? x : x?.task || JSON.stringify(x))}`));
      }
    }
    if (asArray(s?.whatsapp_scripts).length) {
      md.push("## Scripts");
      asArray(s?.whatsapp_scripts).forEach((x, i) => {
        md.push(`${i + 1}. ${toText(x?.segment)}: ${toText(x?.message)} | CTA: ${toText(x?.cta)}`);
      });
    }
    addSection("Verification", verificationLines);
    return md.join("\n");
  }

  addSection("Diagnosis", [toText(s?.answer) || "No grounded answer returned."]);
  addSection("Why It Is Happening", asArray(s?.root_cause).map((x, i) => `${i + 1}. ${toText(x?.issue)} | evidence: ${toText(x?.evidence)} | impact: ${toText(x?.impact)}`));
  addSection("Market Context", asArray(s?.area_intelligence).map((x, i) => `${i + 1}. ${toText(x?.area)}: ${toText(x?.insight)} | evidence: ${toText(x?.evidence)} | local context: ${toText(x?.local_context)}`));
  addSection("Recommended Moves", asArray(s?.priority_actions).map((x, i) => `${i + 1}. [${toText(x?.owner)}] ${toText(x?.action)} | due ${toText(x?.due_date)} | expected ${toText(x?.expected_outcome)}`));
  addSection("Competitive Pressure", asArray(s?.competitive_threat).map((x, i) => `${i + 1}. ${toText(x?.competitor)} in ${toText(x?.area)}: ${toText(x?.threat)} | counter: ${toText(x?.counter_move)}`));
  if (asArray(timeline.this_week).length || asArray(timeline.this_month).length || asArray(timeline.next_month).length) {
    md.push("## Timeline");
    if (asArray(timeline.this_week).length) {
      md.push("### This Week");
      asArray(timeline.this_week).forEach((x) => md.push(`- ${toText(typeof x === "string" ? x : x?.task || JSON.stringify(x))}`));
    }
    if (asArray(timeline.this_month).length) {
      md.push("### This Month");
      asArray(timeline.this_month).forEach((x) => md.push(`- ${toText(typeof x === "string" ? x : x?.task || JSON.stringify(x))}`));
    }
    if (asArray(timeline.next_month).length) {
      md.push("### Next Month");
      asArray(timeline.next_month).forEach((x) => md.push(`- ${toText(typeof x === "string" ? x : x?.task || JSON.stringify(x))}`));
    }
  }
  if (asArray(s?.whatsapp_scripts).length) {
    md.push("## Scripts");
    asArray(s?.whatsapp_scripts).forEach((x, i) => md.push(`${i + 1}. ${toText(x?.segment)}: ${toText(x?.message)} | CTA: ${toText(x?.cta)}`));
  }
  proofSection("Supporting Customers");
  addSection("Verification", verificationLines);
  return md.join("\n");
};

const customerListToPlainText = (rows = []) => {
  const sanitizePlainField = (value) => toText(value).replace(/\s+/g, " ");
  const header = ["Name", "Mobile", "Area", "Hub", "Status", "Revenue", "Wallet", "Orders", "Last Delivery", "Source", "Payment Mode", "Note", "Why It Matters"];
  const lines = asArray(rows).map((customer) => [
    sanitizePlainField(customer?.name),
    sanitizePlainField(customer?.mobile),
    sanitizePlainField(customer?.area),
    sanitizePlainField(customer?.hub),
    sanitizePlainField(customer?.status),
    toInt(customer?.revenue).toLocaleString(),
    toInt(customer?.wallet_balance).toLocaleString(),
    toInt(customer?.orders).toLocaleString(),
    sanitizePlainField(customer?.last_delivery),
    sanitizePlainField(customer?.source),
    sanitizePlainField(customer?.payment_mode),
    sanitizePlainField(customer?.note),
    sanitizePlainField(customer?.why_it_matters)
  ].join("\t"));
  return [header.join("\t"), ...lines].join("\n");
};

const isVagueQuery = (query, knownAreas = []) => {
  const q = toKey(query);
  const words = q.split(" ").filter(Boolean);
  const hasArea = knownAreas.some((a) => q.includes(toKey(a)));
  const hasExactListIntent = isExplicitCustomerListQuery(query) || /(suspended customers|inactive customers|active customers|negative wallet customers|zero wallet customers|no hub customers|cash customers|online customers)/.test(q);
  const hasSpecificIntent = /(retention|acquisition|wallet|upsell|campaign|churn|reactivate|trial|competitor|script|timeline|hub|area|suspended|inactive|kharadi|hadapsar|aundh|kothrud|waked|wakad|hinjewadi)/.test(q);
  if (hasExactListIntent) return false;
  if (words.length <= 3) return true;
  if (!hasArea && !hasSpecificIntent && /(what|how|help|improve|best|do next)/.test(q)) return true;
  return false;
};

const buildClarifyingQuestion = (role) => {
  return `Before I run the strategy for ${ROLES[role]?.title || "your team"}: choose one goal (Retention, Acquisition, Wallet, Premium Upsell) and add area + timeframe (example: "Retention in Kharadi this week").`;
};

const FESTIVAL_EVENTS_2026 = [
  { id: "holika-dahan", date: "2026-03-03", name: "Holika Dahan", type: "festival", confidence: "confirmed", focus: "Milk + dahi stock-up", areas: ["Bibwewadi", "Kothrud", "Sinhgad Road"], offer: "Advance order reminder with preferred morning slot confirmation" },
  { id: "holi", date: "2026-03-04", name: "Holi", type: "festival", confidence: "confirmed", focus: "Party households and hydration demand", areas: ["Aundh", "Baner Road", "Wakad"], offer: "Hydration planning with assured delivery continuity" },
  { id: "gudi-padwa", date: "2026-03-19", name: "Gudi Padwa", type: "festival", confidence: "confirmed", focus: "Marathi family celebration planning", areas: ["Kothrud", "Sinhgad Road", "Nanded City"], offer: "Festival household planning with premium pantry guidance" },
  { id: "ram-navami", date: "2026-03-26", name: "Ram Navami", type: "festival", confidence: "tentative", focus: "Fasting and puja dairy demand", areas: ["Kharadi", "Hadapsar"], offer: "Puja milk pre-booking with preferred delivery setup" },
  { id: "makar-sankranti", date: "2026-01-14", name: "Makar Sankranti", type: "festival", confidence: "confirmed", focus: "Morning-delivery planning", areas: ["Kothrud", "Bibwewadi"], offer: "Early morning slot assurance for festive households" },
  { id: "raksha-bandhan", date: "2026-08-28", name: "Raksha Bandhan", type: "festival", confidence: "confirmed", focus: "Family coordination and gifting support", areas: ["Hadapsar", "Chinchwad"], offer: "Family delivery coordination with premium reassurance" },
  { id: "janmashtami", date: "2026-09-04", name: "Janmashtami", type: "festival", confidence: "confirmed", focus: "Makhan/dahi demand spike", areas: ["Aundh", "Koregaon Park"], offer: "Prasad planning with fresh dairy scheduling" },
  { id: "ganesh-chaturthi", date: "2026-09-14", name: "Ganesh Chaturthi", type: "festival", confidence: "tentative", focus: "Milk/dahi/ghee spike for prasad", areas: ["Pune City Hub", "Chinchwad Hub"], offer: "10-day festival planning with daily service continuity" },
  { id: "dussehra", date: "2026-10-20", name: "Dussehra", type: "festival", confidence: "tentative", focus: "Festive cooking demand", areas: ["Kalyani Nagar", "Aundh"], offer: "Premium kitchen-planning outreach for festive week" },
  { id: "dhanteras", date: "2026-11-06", name: "Dhanteras", type: "festival", confidence: "tentative", focus: "Premium gifting", areas: ["Koregaon Park", "Aundh"], offer: "Premium gifting consultation with pre-book support" },
  { id: "diwali", date: "2026-11-08", name: "Diwali", type: "festival", confidence: "tentative", focus: "Festive demand and gifting", areas: ["Hadapsar", "Koregaon Park", "Kalyani Nagar"], offer: "Diwali service-planning window with early confirmation" }
];
const PUNE_EVENT_WINDOWS_2026 = [
  { id: "it-transfer-window", date: "2026-04-18", name: "IT Transfer Season Watch", type: "retention", confidence: "system", areas: ["Kharadi", "Wakad", "Hinjewadi"], focus: "Rental-family churn spike and reactivation pressure", offer: "Transfer-season continuity check-in with preferred restart planning" },
  { id: "dahi-handi", date: "2026-09-05", name: "Dahi Handi", type: "festival", confidence: "tentative", areas: ["Hadapsar", "Wakad", "Kothrud"], focus: "Curd-heavy celebration demand and fast local spike", offer: "Celebration planning with uninterrupted fresh dahi supply" },
  { id: "navratri-opening", date: "2026-10-12", name: "Navratri Opening", type: "festival", confidence: "tentative", areas: ["Aundh", "Kalyani Nagar", "Koregaon Park"], focus: "Fasting pantry planning with ghee, paneer, and milk routines", offer: "Navratri pantry planning with assured delivery setup" },
  { id: "kojagiri-pournima", date: "2026-10-26", name: "Kojagiri Pournima", type: "festival", confidence: "tentative", areas: ["Kothrud", "Aundh", "Koregaon Park"], focus: "Flavoured milk storytelling and moonlight dairy occasion", offer: "Moonlight milk ritual planning with premium household reminders" }
];
const CALENDAR_EVENT_META = {
  "holika-dahan": {
    priority: "high",
    target_profile: "festive_active_households",
    products: ["Milk", "Dahi"],
    objective: "Festival stock-up capture",
    campaign_theme: "Pure A2 preparation for family rituals",
    content_hook: "Start the household planning before the rush begins."
  },
  "holi": {
    priority: "high",
    target_profile: "festive_active_households",
    products: ["Milk", "Dahi", "Buttermilk"],
    objective: "Hydration and household planning",
    campaign_theme: "Fresh celebration without delivery gaps",
    content_hook: "Own the celebration week with dependable fresh supply."
  },
  "gudi-padwa": {
    priority: "critical",
    target_profile: "premium_loyal_households",
    products: ["Milk", "Ghee"],
    objective: "Premium family celebration capture",
    campaign_theme: "New-year ritual purity for Marathi households",
    content_hook: "Lead with family ritual quality, not price."
  },
  "ram-navami": {
    priority: "high",
    target_profile: "festive_active_households",
    products: ["Milk", "Dahi"],
    objective: "Puja pantry planning",
    campaign_theme: "Puja-ready dairy without last-minute stress",
    content_hook: "Give households confidence that their puja essentials are covered."
  },
  "makar-sankranti": {
    priority: "high",
    target_profile: "loyalty_core_households",
    products: ["Milk", "Dahi"],
    objective: "Early-morning continuity for festive homes",
    campaign_theme: "Morning ritual planning with trust-led service",
    content_hook: "Use punctuality and purity as the entire message."
  },
  "raksha-bandhan": {
    priority: "medium",
    target_profile: "premium_loyal_households",
    products: ["Milk", "Ghee"],
    objective: "Family coordination and gifting support",
    campaign_theme: "Premium family care from the farm",
    content_hook: "Frame the brand as the reliable household partner."
  },
  "janmashtami": {
    priority: "critical",
    target_profile: "prasad_households",
    products: ["Milk", "Dahi", "Ghee"],
    objective: "Prasad-led demand capture",
    campaign_theme: "Fresh makhan and prasad readiness",
    content_hook: "Anchor the story around Krishna bhog preparation."
  },
  "dahi-handi": {
    priority: "critical",
    target_profile: "prasad_households",
    products: ["Dahi", "Milk"],
    objective: "Curd surge capture",
    campaign_theme: "Celebration-grade curd with daily freshness",
    content_hook: "This is a dahi-first campaign, not a generic festival post."
  },
  "ganesh-chaturthi": {
    priority: "critical",
    target_profile: "prasad_households",
    products: ["Milk", "Dahi", "Ghee"],
    objective: "10-day festival demand capture",
    campaign_theme: "Prasad, seva, and uninterrupted 10-day planning",
    content_hook: "Ganesh season should feel like a managed household plan."
  },
  "it-transfer-window": {
    priority: "critical",
    target_profile: "it_reactivation_watch",
    products: ["Milk"],
    objective: "Save IT-family churn before it becomes inactive loss",
    campaign_theme: "Continuity during relocation and restart friction",
    content_hook: "Treat this as a churn-prevention campaign, not a festival."
  },
  "navratri-opening": {
    priority: "high",
    target_profile: "premium_loyal_households",
    products: ["Milk", "Paneer", "Ghee"],
    objective: "Fasting pantry planning",
    campaign_theme: "Premium pantry confidence for nine days",
    content_hook: "Show how Mr. Milk helps families stay prepared for the full window."
  },
  "dussehra": {
    priority: "high",
    target_profile: "premium_loyal_households",
    products: ["Milk", "Ghee"],
    objective: "Festive cooking and gifting support",
    campaign_theme: "Kitchen confidence for family hosting",
    content_hook: "Use hosting confidence and own-farm trust as the lead."
  },
  "kojagiri-pournima": {
    priority: "critical",
    target_profile: "milk_moment_households",
    products: ["Milk"],
    objective: "Own the biggest Maharashtra milk storytelling moment",
    campaign_theme: "Moonlight milk ritual with pure A2 positioning",
    content_hook: "This should feel uniquely built for Mr. Milk."
  },
  "dhanteras": {
    priority: "high",
    target_profile: "premium_gifting_households",
    products: ["Ghee"],
    objective: "Premium gifting and pantry planning",
    campaign_theme: "Own-farm ghee as a premium festive essential",
    content_hook: "Keep the message elegant and premium-safe."
  },
  "diwali": {
    priority: "critical",
    target_profile: "premium_gifting_households",
    products: ["Milk", "Ghee"],
    objective: "Peak festive demand and gifting planning",
    campaign_theme: "Festive purity for cooking, hosting, and gifting",
    content_hook: "Diwali should combine kitchen demand and gifting confidence."
  }
};
const CALENDAR_SEGMENT_COPY = {
  festive_active_households: {
    label: "Active households with live consumption",
    reason: "Matched active households with current consumption in the target localities so campaign reach stays close to real weekly demand."
  },
  premium_loyal_households: {
    label: "Premium loyal households",
    reason: "Matched active customers with meaningful spend and live usage so the campaign stays premium and value-dense."
  },
  prasad_households: {
    label: "Prasad and celebration households",
    reason: "Matched active homes likely to need milk, dahi, or ghee during ritual-heavy celebration days."
  },
  premium_gifting_households: {
    label: "Premium gifting-ready households",
    reason: "Matched higher-value, active households where premium gifting and pantry support can land credibly."
  },
  milk_moment_households: {
    label: "Milk-first celebration households",
    reason: "Matched active milk-using homes where the event naturally maps to a premium milk moment."
  },
  it_reactivation_watch: {
    label: "IT-corridor reactivation watchlist",
    reason: "Matched valuable customers in churn-prone IT areas so CRM can intervene before relocation turns into loss."
  },
  wallet_watchlist: {
    label: "Wallet pressure watchlist",
    reason: "Matched households where wallet stress or low-balance behavior can interrupt service continuity."
  },
  local_referral_champions: {
    label: "Referral-friendly loyalists",
    reason: "Matched active, stable households that can become on-ground society proof for acquisition days."
  }
};

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
      { id: `salary-day-${m+1}`, date: toISODateString(new Date(year, m, 1)), name: "Salary Credit Window", type: "cashflow", confidence: "system", focus: "Wallet top-up nudges", areas: ["Kharadi", "Wakad", "Hinjewadi"], offer: "Wallet readiness reminder with service continuity note" },
      { id: `mid-month-${m+1}`, date: toISODateString(new Date(year, m, 15)), name: "Mid-Month Retention Push", type: "retention", confidence: "system", focus: "Prevent low-balance suspensions", areas: ["Hadapsar", "Chinchwad"], offer: "Restart support and personalized quantity check-in" },
      { id: `month-end-${m+1}`, date: toISODateString(new Date(year, m, 28)), name: "Month-End Recovery Sprint", type: "recovery", confidence: "system", focus: "Win-back inactive high-value users", areas: ["Kharadi", "Aundh"], offer: "Preferred restart scheduling and premium reassurance" }
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
      offer: "First-time 7L trial pack with guided onboarding"
    });
  }
  return recurring;
};

const enrichCalendarEvent = (event) => {
  const meta = CALENDAR_EVENT_META[event.id]
    || (event.id.startsWith("salary-day-")
      ? {
          priority: "high",
          target_profile: "wallet_watchlist",
          products: ["Milk"],
          objective: "Wallet continuity before billing friction",
          campaign_theme: "Top-up readiness with zero discount language",
          content_hook: "Salary day is a retention moment, not a promo moment."
        }
      : event.id.startsWith("mid-month-")
        ? {
            priority: "high",
            target_profile: "wallet_watchlist",
            products: ["Milk"],
            objective: "Prevent mid-month churn",
            campaign_theme: "Service continuity before balance drops",
            content_hook: "Use support-led messaging before the customer goes silent."
          }
        : event.id.startsWith("month-end-")
          ? {
              priority: "critical",
              target_profile: "it_reactivation_watch",
              products: ["Milk"],
              objective: "Recover high-value users before month close",
              campaign_theme: "Restart planning without discounting",
              content_hook: "Turn inactive value back into next-month continuity."
            }
          : event.id.startsWith("society-sampling-")
            ? {
                priority: "high",
                target_profile: "local_referral_champions",
                products: ["Milk"],
                objective: "Referral-led acquisition support",
                campaign_theme: "Use existing trust to open new society conversations",
                content_hook: "Lead with trust, not cheap sampling language."
              }
            : {
                priority: "medium",
                target_profile: "festive_active_households",
                products: ["Milk"],
                objective: event.focus,
                campaign_theme: event.focus,
                content_hook: "Keep the execution premium-safe and locality specific."
              });
  return {
    ...event,
    ...meta
  };
};

const buildCalendarEvents = (year) => {
  const recurring = generateRecurringCalendarEvents(year).map((event) => ({
    ...enrichCalendarEvent(event),
    source_label: "System recurring playbook",
    legitimacy_note: "Generated from MrMilk operating rhythm. Treat as system scheduling, not a public holiday source."
  }));
  const festivals = FESTIVAL_EVENTS_2026
    .filter((e) => e.date.startsWith(`${year}-`))
    .map((event) => ({
      ...enrichCalendarEvent(event),
      source_label: "Festival calendar seed",
      legitimacy_note: event.confidence === "tentative"
        ? "Needs local confirmation before final campaign launch."
        : "Seeded as a business calendar anchor for this app."
    }));
  const puneMoments = PUNE_EVENT_WINDOWS_2026
    .filter((e) => e.date.startsWith(`${year}-`))
    .map((event) => ({
      ...enrichCalendarEvent(event),
      source_label: "Pune demand moment",
      legitimacy_note: event.confidence === "tentative"
        ? "High-value local moment. Confirm final date before launch."
        : "Curated business moment from MrMilk seasonal playbooks."
    }));
  return [...festivals, ...puneMoments, ...recurring].sort((a, b) => a.date.localeCompare(b.date));
};

const shiftIsoByDays = (iso, dayOffset) => {
  const next = parseISODate(iso);
  next.setDate(next.getDate() + dayOffset);
  return toISODateString(next);
};

const buildCalendarEventTargeting = (event, customerRecords, topAreaNames = []) => {
  const areas = asArray(event.areas).length ? asArray(event.areas) : asArray(topAreaNames);
  const hubs = asArray(event.hubs);
  const profileKey = toText(event.target_profile) || "festive_active_households";
  const profileCopy = CALENDAR_SEGMENT_COPY[profileKey] || CALENDAR_SEGMENT_COPY.festive_active_households;
  const baseFilters = {
    ...(areas.length ? { areas } : {}),
    ...(hubs.length ? { hubs } : {})
  };

  let strictFilters = { ...baseFilters };
  let relaxedFilters = { ...baseFilters };
  let postFilter = null;
  let relaxedPostFilter = null;

  if (profileKey === "premium_loyal_households") {
    strictFilters = { ...strictFilters, requireActive: true, currentConsumptionPositive: true, minRevenue: 12000, requireOrdersPositive: true };
    relaxedFilters = { ...relaxedFilters, requireActive: true, minRevenue: 8000 };
  } else if (profileKey === "prasad_households") {
    strictFilters = { ...strictFilters, requireActive: true, currentConsumptionPositive: true, minRevenue: 7000 };
    relaxedFilters = { ...relaxedFilters, requireActive: true, requireOrdersPositive: true };
  } else if (profileKey === "premium_gifting_households") {
    strictFilters = { ...strictFilters, requireActive: true, minRevenue: 18000, wallet: "positive", requireOrdersPositive: true };
    relaxedFilters = { ...relaxedFilters, requireActive: true, minRevenue: 12000 };
  } else if (profileKey === "milk_moment_households") {
    strictFilters = { ...strictFilters, requireActive: true, currentConsumptionPositive: true, minRevenue: 10000 };
    relaxedFilters = { ...relaxedFilters, requireActive: true, minRevenue: 7000 };
  } else if (profileKey === "it_reactivation_watch") {
    strictFilters = { ...strictFilters, minRevenue: 12000, minDaysSinceLastDelivery: 14 };
    relaxedFilters = { ...relaxedFilters, minRevenue: 8000, minDaysSinceLastDelivery: 7 };
    postFilter = (row) => matchesCustomerStatus(row, "inactive") || matchesCustomerStatus(row, "suspended") || toInt(row.wallet_balance) <= 0;
    relaxedPostFilter = (row) => matchesCustomerStatus(row, "inactive") || matchesCustomerStatus(row, "suspended") || toInt(row.wallet_balance) <= 0;
  } else if (profileKey === "wallet_watchlist") {
    strictFilters = { ...strictFilters, requireOrdersPositive: true };
    relaxedFilters = { ...relaxedFilters };
    postFilter = (row) => toInt(row.wallet_balance) <= 0 || matchesCustomerStatus(row, "inactive");
    relaxedPostFilter = postFilter;
  } else if (profileKey === "local_referral_champions") {
    strictFilters = { ...strictFilters, requireActive: true, wallet: "positive", minRevenue: 15000, currentConsumptionPositive: true };
    relaxedFilters = { ...relaxedFilters, requireActive: true, minRevenue: 10000 };
  } else {
    strictFilters = { ...strictFilters, requireActive: true, currentConsumptionPositive: true, minRevenue: 6000 };
    relaxedFilters = { ...relaxedFilters, requireActive: true, requireOrdersPositive: true };
  }

  const applyPostFilter = (rows, predicate) => typeof predicate === "function" ? rows.filter(predicate) : rows;
  let matchedCustomers = applyPostFilter(filterCustomerRecords(customerRecords, strictFilters), postFilter);
  let filtersUsed = describeCustomerFilters(strictFilters);
  let matchMode = "strict";

  if (!matchedCustomers.length) {
    matchedCustomers = applyPostFilter(filterCustomerRecords(customerRecords, relaxedFilters), relaxedPostFilter);
    filtersUsed = [...describeCustomerFilters(relaxedFilters), "targeting:relaxed"];
    matchMode = "relaxed";
  }

  matchedCustomers = sortDesc(matchedCustomers);
  const stats = buildProofStats(matchedCustomers);
  return {
    profileKey,
    profileLabel: profileCopy.label,
    reason: profileCopy.reason,
    customers: matchedCustomers,
    stats,
    filters: matchMode === "strict" ? strictFilters : relaxedFilters,
    filtersUsed,
    matchMode,
    scopeSummary: [...areas, ...hubs].filter(Boolean).join(", ") || "Top revenue areas",
    topCustomers: matchedCustomers.slice(0, 3)
  };
};

const buildCalendarCampaignArc = (event, targeting) => {
  const products = asArray(event.products).length ? event.products.join(", ") : "milk";
  const areasText = targeting?.scopeSummary || "your target areas";
  const segmentText = toText(targeting?.profileLabel || "priority households").toLowerCase();
  const templates = event.type === "retention" || event.type === "recovery"
    ? [
        {
          key: "signal",
          label: "Watchlist warm-up",
          offsetDays: -5,
          channel: "CRM + WhatsApp",
          objective: "Flag risk before the event window hits",
          copy: `Check in with ${segmentText} in ${areasText}. Lead with continuity, preferred restart timing, and premium reassurance around ${event.name}.`
        },
        {
          key: "intervention",
          label: "Priority intervention",
          offsetDays: -2,
          channel: "Call block",
          objective: "Move high-value risk accounts back into active planning",
          copy: `Call the top-value watchlist and confirm requirement, restart date, or wallet action. Keep the message service-led and anchored on ${event.campaign_theme}.`
        },
        {
          key: "day_of",
          label: "Day-of continuity",
          offsetDays: 0,
          channel: "Ops + CRM",
          objective: "Keep service uninterrupted on the exact day",
          copy: `Use the event day to confirm continuity for the most valuable rows. Focus on calm service assurance and clear next-step ownership.`
        }
      ]
    : [
        {
          key: "teaser",
          label: "Teaser",
          offsetDays: -7,
          channel: "Instagram + status",
          objective: "Open the demand window early",
          copy: `${event.name} is coming. Start premium-safe storytelling around ${products} for ${segmentText} in ${areasText}. Lead with ${event.content_hook}`
        },
        {
          key: "push",
          label: "Planning push",
          offsetDays: -3,
          channel: "WhatsApp + CRM",
          objective: "Convert intent into planned household demand",
          copy: `Reach matched households with a direct planning message: confirm their ${products} requirement for ${event.name}, highlight ${event.offer}, and keep the tone service-led.`
        },
        {
          key: "day_of",
          label: "Day-of celebration",
          offsetDays: 0,
          channel: "WhatsApp + social",
          objective: "Own the moment with brand trust and continuity",
          copy: `Wish customers for ${event.name} and reinforce that Mr. Milk is delivering pure A2 ${products} with no compromise on freshness or reliability.`
        }
      ];
  return templates.map((step) => ({
    ...step,
    date: shiftIsoByDays(event.date, step.offsetDays)
  }));
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
    ...upcoming.map((e) => `- ${e.date} | ${e.name} | ${e.focus} | Areas: ${(e.areas || []).join(", ")} | Value path: ${e.offer}`)
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
const stripDatasetForCache = (data) => {
  const next = { ...asObject(data) };
  delete next.customer_records;
  return next;
};
const loadStoredApiKey = () => {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(LLM_KEY_STORE)
      || window.localStorage.getItem(LLM_KEY_STORE)
      || window.localStorage.getItem("mrmilk_openai_key")
      || "";
  } catch {
    return "";
  }
};
const persistApiKey = (value) => {
  if (typeof window === "undefined") return;
  try {
    if (value) window.sessionStorage.setItem(LLM_KEY_STORE, value);
    else window.sessionStorage.removeItem(LLM_KEY_STORE);
    window.localStorage.removeItem(LLM_KEY_STORE);
  } catch {
    // ignore storage failures
  }
};
const normalizeProviderModel = (provider, rawModel) => {
  const explicit = toText(rawModel);
  if (!explicit) return PROVIDER_META[provider]?.defaultModel || PROVIDER_META.gemini.defaultModel;
  if (provider === "nvidia") return NVIDIA_MODEL_ALIASES[toKey(explicit)] || explicit;
  return explicit;
};

const DATA_CACHE_KEY = "mrmilk_dataset_cache_v1";
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
  Product: ["product", "product name", "item", "item name", "sku"],
  Quantity: ["quantity", "qty", "product quantity", "order quantity"],
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
  "Current Consumption": ["current consumption", "consumption", "daily liters", "daily litres", "liters", "litres"],
  Note: ["note", "notes", "remark", "remarks", "comment", "comments", "sales note", "customer note", "reason"]
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
const formatCompactNumber = (value) => new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(toNumber(value));
const formatCompactInr = (value) => `Rs ${formatCompactNumber(value)}`;
const resolveStateUpdater = (updater, current) => (typeof updater === "function" ? updater(current) : updater);
const toDateSortValue = (value) => {
  const iso = toISODate(value);
  return iso || "";
};
const waitForUiPaint = () => new Promise((resolve) => {
  if (typeof window === "undefined") {
    resolve();
    return;
  }
  window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const KPI_PROGRESS_DELAY_MS = 220;
const KPI_TOTAL_PROGRESS_THRESHOLD = 5000;
const KPI_FILTER_CHUNK_SIZE = 1600;
const PROOF_PROGRESS_PROFILES = {
  default: {
    chip: "Proof Sync",
    accent: "#074069",
    notes: [
      { weight: 0.93, text: "Grounding the report against the active workbook before anything opens." },
      { weight: 0.88, text: "Keeping row count, filters, and sort order aligned in one pass." },
      { weight: 0.84, text: "Skipping the normal export-sort-recheck loop from MilkMaster." },
      { weight: 0.78, text: "Opening only after the visible proof set is ready." }
    ]
  },
  dataset: {
    chip: "Workbook Load",
    accent: "#074069",
    notes: [
      { weight: 0.95, text: "Counting every grounded customer row so totals match the workbook." },
      { weight: 0.9, text: "Pre-sorting the proof set so operations can work from the top instantly." },
      { weight: 0.83, text: "Avoiding the usual MilkMaster export-cleanup cycle." },
      { weight: 0.79, text: "Keeping dashboard numbers and proof rows on the same source of truth." }
    ]
  },
  active: {
    chip: "Status Slice",
    accent: "#b24d38",
    notes: [
      { weight: 0.94, text: "Separating active rows from inactive noise before the report opens." },
      { weight: 0.87, text: "Checking latest status and wallet context together." },
      { weight: 0.82, text: "Surfacing proof rows faster than manual status filtering in MilkMaster." },
      { weight: 0.77, text: "Keeping exact row counts ready for CRM action." }
    ]
  },
  revenue: {
    chip: "Revenue Rank",
    accent: "#2f7a4a",
    notes: [
      { weight: 0.96, text: "Ranking high-LTV rows first so the most valuable proof opens on top." },
      { weight: 0.88, text: "Keeping revenue order exact to the workbook before the view is shown." },
      { weight: 0.81, text: "Saving the manual revenue sort and cross-check step from MilkMaster." },
      { weight: 0.76, text: "Opening only after the topline-critical customers are ready." }
    ]
  },
  wallet: {
    chip: "Wallet Risk",
    accent: "#c9771c",
    notes: [
      { weight: 0.95, text: "Pulling wallet balances with exact positive, zero, or negative state." },
      { weight: 0.89, text: "Keeping customer notes visible when a status update was missed." },
      { weight: 0.83, text: "Sorting the most urgent balance cases before the proof opens." },
      { weight: 0.78, text: "Faster than filtering low-balance accounts manually after export." }
    ]
  },
  trial: {
    chip: "Trial Review",
    accent: "#8f52b6",
    notes: [
      { weight: 0.93, text: "Separating trial ended, trial running, and non-converted rows cleanly." },
      { weight: 0.87, text: "Checking notes that may explain missed conversion handoff." },
      { weight: 0.82, text: "Keeping trial proof aligned to the active workbook, not stale exports." },
      { weight: 0.75, text: "Opening the proof only after trial-state counts are stable." }
    ]
  },
  area: {
    chip: "Area Slice",
    accent: "#3179b6",
    notes: [
      { weight: 0.95, text: "Loading the full area slice before the proof report opens." },
      { weight: 0.88, text: "Keeping area, hub, wallet, and notes connected in one report." },
      { weight: 0.83, text: "Skipping the manual area filter pass normally done in MilkMaster." },
      { weight: 0.78, text: "Opening only after the area-level customer set is complete." }
    ]
  },
  status: {
    chip: "Status Proof",
    accent: "#b24d38",
    notes: [
      { weight: 0.94, text: "Grouping exact status buckets before the customer report opens." },
      { weight: 0.89, text: "Surfacing sales notes where status looks stale." },
      { weight: 0.82, text: "Ranking rows by action priority so teams know who to work first." },
      { weight: 0.77, text: "Faster than running repeated status filters in MilkMaster." }
    ]
  },
  hub: {
    chip: "Hub Proof",
    accent: "#356d9f",
    notes: [
      { weight: 0.94, text: "Preparing the hub-owned customer base before the report opens." },
      { weight: 0.87, text: "Keeping ops ownership, wallet pressure, and notes visible together." },
      { weight: 0.81, text: "Reducing the route-level filter work usually done after export." },
      { weight: 0.76, text: "Opening only when the hub slice is stable and ranked." }
    ]
  },
  source: {
    chip: "Source Proof",
    accent: "#4a78b3",
    notes: [
      { weight: 0.93, text: "Matching acquisition rows back to the active workbook only." },
      { weight: 0.86, text: "Keeping source labels, revenue, and proof rows aligned in one view." },
      { weight: 0.81, text: "Saving the usual source cleanup and spreadsheet sorting step." },
      { weight: 0.75, text: "Opening only when the source-backed customer list is ready." }
    ]
  },
  customer: {
    chip: "Customer Row",
    accent: "#6a4c93",
    notes: [
      { weight: 0.91, text: "Preparing one grounded customer record with wallet, status, and note." },
      { weight: 0.84, text: "Keeping the single-customer proof clean enough for immediate action." },
      { weight: 0.79, text: "Showing the row only after note and status context are synced." },
      { weight: 0.73, text: "Faster than searching and opening the same customer in MilkMaster." }
    ]
  }
};
const pickWeightedProgressNotes = (profileId = "default", seed = Date.now()) => {
  const pool = asArray(PROOF_PROGRESS_PROFILES[profileId]?.notes).length
    ? asArray(PROOF_PROGRESS_PROFILES[profileId]?.notes)
    : asArray(PROOF_PROGRESS_PROFILES.default.notes);
  if (pool.length <= 3) return pool;
  const selected = [];
  const working = pool.map((note, index) => ({ ...note, id: `${profileId}-${index}` }));
  let cursor = Math.abs(Math.floor(seed)) || 1;
  while (selected.length < 3 && working.length) {
    const total = working.reduce((sum, note) => sum + toNumber(note.weight), 0);
    let threshold = ((cursor % 997) / 997) * total;
    let pickedIndex = 0;
    for (let index = 0; index < working.length; index += 1) {
      threshold -= toNumber(working[index].weight);
      if (threshold <= 0) {
        pickedIndex = index;
        break;
      }
    }
    selected.push(working.splice(pickedIndex, 1)[0]);
    cursor = Math.floor(cursor / 7) + 53;
  }
  return selected;
};
const buildProofProgressCopy = ({ title = "", rowCount = 0, mode = "load", profileId = "default" } = {}) => {
  const profile = PROOF_PROGRESS_PROFILES[profileId] || PROOF_PROGRESS_PROFILES.default;
  return {
    profileId,
    chip: profile.chip,
    accent: profile.accent,
    title: mode === "filter"
      ? `Preparing ${toText(title) || "customer proof"}`
      : `Opening ${toText(title) || "customer proof"}`,
    detail: rowCount
      ? `${mode === "filter" ? "Filtering" : "Loading"} ${rowCount.toLocaleString()} workbook rows now.`
      : "Preparing exact workbook rows now.",
    benefit: "About 2x faster than sorting and filtering the same data manually in MilkMaster. Usually saves 20-22 minutes after export.",
    notes: pickWeightedProgressNotes(profileId, Date.now()),
    minimumVisibleMs: 0,
    showImmediately: false
  };
};
const sortModeToTableSorting = (sortMode = "revenue_desc") => SORT_MODE_TO_TABLE_SORTING[sortMode] || SORT_MODE_TO_TABLE_SORTING.revenue_desc;
const tableSortingToSortMode = (sortingState = []) => {
  const primary = asArray(sortingState)[0];
  if (!primary) return "revenue_desc";
  if (primary.id === "wallet_balance") return primary.desc ? "revenue_desc" : "wallet_asc";
  if (primary.id === "last_delivery") return "last_delivery_desc";
  if (primary.id === "current_consumption") return "consumption_desc";
  return "revenue_desc";
};
const getOutcomeMeta = (outcomeId) => CHAT_OUTCOME_META[outcomeId] || CHAT_OUTCOME_META.customer_list;
const applyOutcomeToControls = (controls = {}, outcomeId = "customer_list") => {
  const outcome = getOutcomeMeta(outcomeId);
  return {
    ...controls,
    primary_outcome: outcome.id,
    output_mode: outcome.defaultOutputMode
  };
};
const inferPrimaryOutcome = (controls = {}) => {
  const explicit = toText(controls?.primary_outcome);
  if (explicit && CHAT_OUTCOME_META[explicit]) return explicit;
  if (toText(controls?.output_mode) === "Scripts") return "scripts";
  if (toText(controls?.output_mode) === "Table") return "customer_list";
  return "action_plan";
};
const classifyOfferLifecycle = ({ text = "", query = "", controls = {} } = {}) => {
  const haystack = toKey(`${text} ${query} ${controls.objective} ${controls.primary_outcome}`);
  if (/(first time|new lead|new customer|acquisition|society sampling|trial pack|guided onboarding)/.test(haystack)) return "new_lead";
  if (/(trial lead|trial ended|trial running|trial conversion|trial not converted)/.test(haystack)) return "trial_lead";
  if (/(suspend|wallet|restart|top up|low balance)/.test(haystack)) return "suspended";
  if (/(inactive|win back|reactivate|churn)/.test(haystack)) return "inactive";
  if (/(high value|premium|vip|loyal|koregaon park|upsell)/.test(haystack)) return "high_value_loyal";
  return "generic";
};
const getPolicySafeCopy = ({ stage = "generic", field = "body" } = {}) => {
  const copyBank = {
    new_lead: {
      answer: "Keep acquisition premium and experience-led. The only allowed starter path is the first-time 7L trial pack where the customer pays for 6L and receives 1L extra, followed by guided onboarding and preferred delivery setup.",
      action: "Offer the first-time 7L trial pack, confirm preferred delivery timing, and guide the household on the right starting quantity.",
      expected_outcome: "New customer starts with a premium trial experience instead of a price-led promotion.",
      message: "Namaskar from Mr. Milk. If this is your first time trying us, we can start you with our 7L trial pack. You pay for 6L and we add 1L extra so your family can experience the consistency before choosing a regular plan.",
      cta: "Reply TRIAL and we will set your preferred delivery start date.",
      offer: "First-time 7L trial pack with guided onboarding."
    },
    trial_lead: {
      answer: "Convert trial-stage customers through trust, consistency, and onboarding clarity. Use the first-time 7L trial pack only if the customer is still at first-order stage; otherwise move to service guidance and premium reassurance.",
      action: "Review trial usage, confirm fit, and guide the customer toward a steady subscription quantity through clarity and service confidence.",
      expected_outcome: "Customer converts because the service feels reliable and premium.",
      message: "Namaskar from Mr. Milk. We wanted to check how your trial experience felt and help you choose the right regular quantity for your home. We can also help you set the most comfortable delivery schedule.",
      cta: "Reply START and we will help you move to the right regular plan.",
      offer: "Trial follow-up with personalized onboarding."
    },
    suspended: {
      answer: "Reactivation should stay service-led. Use preferred restart date, wallet guidance, quantity planning, and delivery continuity support instead of any price-led trigger.",
      action: "Offer a preferred restart date, help the customer clear wallet friction, and reset quantity so service resumes smoothly.",
      expected_outcome: "Customer restarts because the service path feels easy and premium.",
      message: "Namaskar from Mr. Milk. We noticed your service needs attention. We can help you choose the right restart date, review quantity, and make the wallet and delivery setup smooth from our side.",
      cta: "Reply RESTART and we will line up the next best service step for you.",
      offer: "Priority restart with wallet and delivery support."
    },
    inactive: {
      answer: "Win-back plans must feel premium, not promotional. Use personalized quantity planning, preferred restart timing, delivery continuity support, and reassurance around consistency from your own farm.",
      action: "Offer a personalized restart plan, review household quantity needs, and reopen the service with a clear preferred delivery date.",
      expected_outcome: "Customer reactivates because the experience feels tailored and trustworthy.",
      message: "Namaskar from Mr. Milk. We saw that your deliveries are inactive and wanted to help you restart in a way that suits your household better. We can suggest the right quantity and a comfortable restart date from our side.",
      cta: "Reply RESTART if you want us to set up the best restart plan for you.",
      offer: "Personalized restart plan with premium service support."
    },
    high_value_loyal: {
      answer: "For premium loyal customers, the right value path is service refinement and reassurance. Lead with consistency, priority handling, and a tailored consumption review rather than any promotional hook.",
      action: "Offer a premium service review, personalized consumption planning, and a founder or senior-team callback if reassurance is needed.",
      expected_outcome: "High-value households feel protected and stay locked into the brand.",
      message: "Namaskar from Mr. Milk. We wanted to check that your current plan and delivery rhythm still fit your household well. If useful, our team can review quantity and service preferences with you directly.",
      cta: "Reply REVIEW and our team will connect with you personally.",
      offer: "Premium service review with senior support."
    },
    generic: {
      answer: "Keep the recommendation value-led through guided onboarding, personalized planning, premium service support, and farm-trust reassurance. Avoid any price-led or volume-push framing.",
      action: "Use a premium service path: personalized planning, preferred delivery setup, and clear next-step ownership.",
      expected_outcome: "Customer sees value through trust, clarity, and convenience instead of price cuts.",
      message: "Namaskar from Mr. Milk. We can help you with the right plan, the right quantity, and the smoothest delivery setup for your household from the start.",
      cta: "Reply YES and our team will guide the next step.",
      offer: "Premium value path with guided onboarding."
    }
  };
  const resolved = copyBank[stage] || copyBank.generic;
  return resolved[field] || resolved.answer;
};
const detectOfferPolicyViolationsInText = (text = "", stage = "generic") => {
  const source = toText(text);
  if (!source) return [];
  const normalized = toKey(source);
  const violations = [];
  const blockedPatterns = [
    { label: "discount language", test: /\bdiscount\b|\bdiscounted\b/ },
    { label: "price-cut language", test: /\bflat\s+off\b|\boff\b|\bprice\s*cut\b|\bcheaper\b|\bcheap\b|\bmarkdown\b/ },
    { label: "cashback or coupon language", test: /\bcashback\b|\bcoupon\b|\bvoucher\b|\bpromo\b/ },
    { label: "bulk-order incentive", test: /\bbulk\b|\bbundle\b|\bcombo\b|\bbuy more\b|\bsave more\b|\bmore for less\b/ },
    { label: "reward-credit framing", test: /\bbonus\b|\bwallet credit\b|\bloyalty bonus\b/ },
    { label: "free wording", test: /\bfree\b/ },
    { label: "percentage offer", test: /\b\d+\s*%\b/ }
  ];
  blockedPatterns.forEach((pattern) => {
    if (pattern.test(normalized)) violations.push(pattern.label);
  });
  const mentionsTrialPack = /(7l trial pack|6l|6 litre|6 litres|6 liter|6 liters|1l extra|1 litre extra|1 liter extra)/.test(normalized);
  if (mentionsTrialPack && !["new_lead", "trial_lead"].includes(stage)) {
    violations.push("trial pack used outside first-time acquisition context");
  }
  return Array.from(new Set(violations));
};
const sanitizeOfferPolicyText = (text = "", options = {}) => {
  const source = toText(text);
  if (!source) return { text: "", repaired: false, violations: [], original: source };
  const stage = options.stage || classifyOfferLifecycle({ text: source, query: options.query, controls: options.controls });
  const violations = detectOfferPolicyViolationsInText(source, stage);
  if (!violations.length) return { text: source, repaired: false, violations: [], original: source };
  const repairedText = getPolicySafeCopy({ stage, field: options.field });
  const remaining = detectOfferPolicyViolationsInText(repairedText, stage);
  return {
    text: remaining.length ? "" : repairedText,
    repaired: !remaining.length,
    violations: remaining.length ? remaining : violations,
    original: source
  };
};
const enforceOfferPolicyOnStructuredResponse = (payload, meta = {}) => {
  const structured = normalizeStructuredResponse(payload);
  const repairs = [];
  const sanitizeField = (value, field, stageHint, contextText = "") => {
    const result = sanitizeOfferPolicyText(value, {
      field,
      stage: stageHint || classifyOfferLifecycle({ text: `${value} ${contextText}`, query: meta.query, controls: meta.controls }),
      query: meta.query,
      controls: meta.controls
    });
    if (result.repaired && result.text !== result.original) {
      repairs.push({ field, from: result.original, to: result.text });
      return result.text;
    }
    return result.text || value;
  };

  structured.answer = sanitizeField(structured.answer, "answer", classifyOfferLifecycle({ text: structured.answer, query: meta.query, controls: meta.controls }), meta.query);
  structured.area_intelligence = structured.area_intelligence.map((item) => ({
    ...asObject(item),
    insight: sanitizeField(item?.insight, "answer", "", `${item?.area} ${item?.local_context}`),
    local_context: sanitizeField(item?.local_context, "answer", "", `${item?.area} ${item?.insight}`)
  }));
  structured.root_cause = structured.root_cause.map((item) => ({
    ...asObject(item),
    impact: sanitizeField(item?.impact, "expected_outcome", "", `${item?.issue} ${item?.evidence}`)
  }));
  structured.priority_actions = structured.priority_actions.map((item) => {
    const stage = classifyOfferLifecycle({
      text: `${item?.objective} ${item?.action} ${item?.target_segment}`,
      query: meta.query,
      controls: meta.controls
    });
    return {
      ...asObject(item),
      action: sanitizeField(item?.action, "action", stage, `${item?.objective} ${item?.target_segment}`),
      expected_outcome: sanitizeField(item?.expected_outcome, "expected_outcome", stage, `${item?.objective} ${item?.action}`)
    };
  });
  structured.competitive_threat = structured.competitive_threat.map((item) => ({
    ...asObject(item),
    counter_move: sanitizeField(item?.counter_move, "action", "", `${item?.competitor} ${item?.area} ${item?.threat}`)
  }));
  structured.timeline = {
    this_week: asArray(structured.timeline?.this_week).map((item) => {
      const text = typeof item === "string" ? item : item?.task;
      const sanitized = sanitizeField(text, "action", "", meta.query);
      return typeof item === "string" ? sanitized : { ...asObject(item), task: sanitized };
    }),
    this_month: asArray(structured.timeline?.this_month).map((item) => {
      const text = typeof item === "string" ? item : item?.task;
      const sanitized = sanitizeField(text, "action", "", meta.query);
      return typeof item === "string" ? sanitized : { ...asObject(item), task: sanitized };
    }),
    next_month: asArray(structured.timeline?.next_month).map((item) => {
      const text = typeof item === "string" ? item : item?.task;
      const sanitized = sanitizeField(text, "action", "", meta.query);
      return typeof item === "string" ? sanitized : { ...asObject(item), task: sanitized };
    })
  };
  structured.whatsapp_scripts = structured.whatsapp_scripts.map((item) => {
    const stage = classifyOfferLifecycle({
      text: `${item?.segment} ${item?.objective} ${item?.message} ${item?.cta}`,
      query: meta.query,
      controls: meta.controls
    });
    return {
      ...asObject(item),
      message: sanitizeField(item?.message, "message", stage, `${item?.segment} ${item?.objective}`),
      cta: sanitizeField(item?.cta, "cta", stage, `${item?.segment} ${item?.message}`)
    };
  });

  const finalViolations = [];
  const auditFields = [
    structured.answer,
    ...structured.area_intelligence.flatMap((item) => [item?.insight, item?.local_context]),
    ...structured.root_cause.map((item) => item?.impact),
    ...structured.priority_actions.flatMap((item) => [item?.action, item?.expected_outcome]),
    ...structured.competitive_threat.map((item) => item?.counter_move),
    ...structured.whatsapp_scripts.flatMap((item) => [item?.message, item?.cta]),
    ...asArray(structured.timeline?.this_week).map((item) => typeof item === "string" ? item : item?.task),
    ...asArray(structured.timeline?.this_month).map((item) => typeof item === "string" ? item : item?.task),
    ...asArray(structured.timeline?.next_month).map((item) => typeof item === "string" ? item : item?.task)
  ];
  auditFields.forEach((fieldText) => {
    const stage = classifyOfferLifecycle({ text: fieldText, query: meta.query, controls: meta.controls });
    detectOfferPolicyViolationsInText(fieldText, stage).forEach((violation) => finalViolations.push(violation));
  });

  structured.data_snapshot = {
    ...asObject(structured.data_snapshot),
    offer_policy_status: finalViolations.length ? "blocked" : repairs.length ? "repaired" : "clean",
    offer_policy_repairs: repairs.length,
    offer_policy_summary: OFFER_POLICY.summary
  };

  return {
    data: structured,
    repairs,
    blocked: finalViolations.length > 0,
    violations: Array.from(new Set(finalViolations))
  };
};
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
  if (!result.Product) result.Product = toText(row?.Product || row?.["Product Name"] || row?.Item || "");
  if (!result.Quantity) result.Quantity = row?.Quantity ?? row?.Qty ?? row?.["Product Quantity"] ?? "";
  if (!result["Sub. Status"]) result["Sub. Status"] = toText(row?.["Sub. Status"] || row?.Status || "Unknown");
  if (!result.Note) result.Note = toText(row?.Note || row?.Notes || row?.Remark || row?.Remarks || row?.Comment || row?.["Sales Note"] || "");
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

const CASH_PICKUP_PRODUCT_PATTERNS = [
  /\bcash\s*pick\s*up\s*request\b/i,
  /\bcash\s*pickup\s*request\b/i,
  /\bcash\s*pick\s*up\b/i,
  /\bcash\s*pickup\b/i
];

const isCashPickupRequestValue = (value) => {
  const text = toText(value);
  if (!text) return false;
  return CASH_PICKUP_PRODUCT_PATTERNS.some((pattern) => pattern.test(text));
};

const isExcludedWorkbookRow = (row = {}) => {
  const productText = toText(
    row?.Product
    || row?.product
    || row?.["Product Name"]
    || row?.["product name"]
    || row?.Item
    || row?.item
    || row?.["Item Name"]
    || row?.["item name"]
  );
  return isCashPickupRequestValue(productText);
};

const buildEmptyDataset = (sourceDate, excludedCashPickupRows = 0) => ({
  data_date: fmtDateLong(sourceDate || Date.now()),
  overview: {
    total_customers: 0,
    total_revenue: 0,
    total_orders: 0,
    avg_revenue_per_customer: 0,
    total_wallet_balance: 0,
    active_customers: 0,
    inactive_customers: 0,
    suspended_customers: 0,
    trial_customers: 0,
    new_customers: 0,
    dnd_customers: 0,
    blocked_customers: 0
  },
  subscription_status: {},
  hub_performance: {},
  top_areas_by_revenue: {},
  wallet_stats: {
    customers_with_positive_wallet: 0,
    customers_with_zero_wallet: 0,
    customers_with_negative_wallet: 0,
    avg_wallet_balance: 0,
    max_wallet_balance: 0,
    total_wallet: 0
  },
  payment_mode: {},
  sources: {},
  top_delivery_boys: {},
  consumption: { avg_daily_liters: 0, total_daily_liters: 0 },
  top_20_customers: [],
  high_value_inactive: [],
  customer_records: [],
  ingestion_notes: excludedCashPickupRows
    ? [`Excluded ${excludedCashPickupRows.toLocaleString()} Cash Pick Up request rows from the uploaded workbook.`]
    : []
});

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
const DATA_DB_NAME = "mrmilk_ai_storage";
const DATA_DB_VERSION = 1;
const DATA_STORE_NAME = "datasets";
const ACTIVE_DATASET_KEY = "active_full_dataset";
const openDatasetDb = () => {
  if (typeof window === "undefined" || !window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATA_DB_NAME, DATA_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DATA_STORE_NAME)) db.createObjectStore(DATA_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open IndexedDB dataset store."));
  });
};
const loadFullDatasetFromDb = async () => {
  const db = await openDatasetDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_STORE_NAME, "readonly");
    const request = tx.objectStore(DATA_STORE_NAME).get(ACTIVE_DATASET_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("Could not load full dataset cache."));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
    tx.onabort = () => db.close();
  });
};
const saveFullDatasetToDb = async (data) => {
  const db = await openDatasetDb();
  if (!db) return false;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_STORE_NAME, "readwrite");
    tx.objectStore(DATA_STORE_NAME).put(data, ACTIVE_DATASET_KEY);
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error("Could not save full dataset cache.")); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error("Full dataset cache write aborted.")); };
  });
};
const clearFullDatasetFromDb = async () => {
  const db = await openDatasetDb();
  if (!db) return false;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_STORE_NAME, "readwrite");
    tx.objectStore(DATA_STORE_NAME).delete(ACTIVE_DATASET_KEY);
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error("Could not clear full dataset cache.")); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error("Full dataset cache clear aborted.")); };
  });
};

const parseCsvBuffer = async (arrayBuffer) => {
  const csvText = new TextDecoder("utf-8").decode(arrayBuffer);
  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: "greedy",
      worker: typeof window !== "undefined" && typeof window.Worker !== "undefined",
      transformHeader: (header) => toText(header),
      complete: (results) => {
        if (results.errors?.length) {
          const fatal = results.errors.find((error) => error.code !== "UndetectableDelimiter");
          if (fatal) {
            reject(new Error(fatal.message || "Could not parse CSV file."));
            return;
          }
        }
        resolve(asArray(results.data));
      },
      error: (error) => reject(error || new Error("Could not parse CSV file."))
    });
  });
};

const deriveDataFromRows = (rows, sourceDate) => {
  if (!Array.isArray(rows) || rows.length === 0) return DATA;
  const excludedCashPickupRows = rows.filter(isExcludedWorkbookRow).length;
  const usableRows = rows.filter((row) => !isExcludedWorkbookRow(row));
  if (!usableRows.length) return buildEmptyDataset(sourceDate, excludedCashPickupRows);

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

  for (const row of usableRows) {
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
    const note = toText(row.Note);
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
      "Wallet Balance": wallet,
      "Last Delivery": lastDeliveryIso || "",
      Source: source,
      "Payment Mode": payMode,
      "Delivery Boy": deliveryBoy,
      "Current Consumption": consumptionRaw ?? "",
      Note: note
    };

    customerRows.push(customer);
    if (/inactive/i.test(subStatus)) {
      inactiveRows.push({
        Name: name,
        Mobile: mobile,
        Area: area,
        "Total Revenue": revenue,
        "Total Orders": orders,
        "Last Delivery": lastDeliveryIso || "N/A",
        Note: note
      });
    }
  }

  const dataDate = latestIsoDate ? fmtDateLong(latestIsoDate) : fmtDateLong(sourceDate || Date.now());
  const totalCustomers = usableRows.length;
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
    ingestion_notes: excludedCashPickupRows
      ? [`Excluded ${excludedCashPickupRows.toLocaleString()} Cash Pick Up request rows from the uploaded workbook.`]
      : [],
    customer_records: customerRows.map((row) => ({
      name: toText(row.Name),
      mobile: toText(row.Mobile),
      area: toText(row.Area),
      hub: toText(row.Hub),
      status: toText(row["Sub. Status"]),
      revenue: toInt(row["Total Revenue"]),
      orders: toInt(row["Total Orders"]),
      wallet_balance: toInt(row["Wallet Balance"]),
      last_delivery: toText(row["Last Delivery"]),
      source: toText(row.Source),
      payment_mode: toText(row["Payment Mode"]),
      delivery_boy: toText(row["Delivery Boy"]),
      current_consumption: toNumber(row["Current Consumption"]),
      note: toText(row.Note)
    })),
    top_20_customers: customerRows.sort((a, b) => b["Total Revenue"] - a["Total Revenue"]).slice(0, 20),
    high_value_inactive: inactiveRows.sort((a, b) => b["Total Revenue"] - a["Total Revenue"]).slice(0, 5)
  };
};

const parseDatasetBuffer = async (arrayBuffer, sourceDate, fileName = "") => {
  const lowerName = toText(fileName).toLowerCase();
  const isCsv = lowerName.endsWith(".csv");
  const scoredSheets = isCsv
    ? [{
        name: fileName || "CSV dataset",
        rows: await parseCsvBuffer(arrayBuffer),
        score: 999
      }]
    : (() => {
        const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
        return workbook.SheetNames.map((name) => {
          const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: "", raw: true });
          const keys = rows[0] ? Object.keys(rows[0]).map(toKey) : [];
          let score = rows.length;
          if (/customer|client|master|subscriber/i.test(name)) score += 60;
          if (keys.some((k) => k.includes("mobile"))) score += 20;
          if (keys.some((k) => k.includes("revenue") || k.includes("amount"))) score += 20;
          if (keys.some((k) => k.includes("status"))) score += 20;
          return { name, rows, score };
        }).sort((a, b) => b.score - a.score);
      })();

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
const sanitizeModelText = (value) => {
  const raw = toText(value);
  if (!raw) return "";
  const withoutClosedThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (withoutClosedThink) return withoutClosedThink;
  if (/^<think>/i.test(raw)) {
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) return raw.slice(jsonStart, jsonEnd + 1).trim();
  }
  return raw;
};
const extractChatCompletionText = (data) => {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return sanitizeModelText(content);
  if (Array.isArray(content)) {
    return sanitizeModelText(content.map((part) => typeof part === "string" ? part : part?.text || "").join(""));
  }
  return "";
};
const getDefaultModel = (provider) => PROVIDER_META[provider]?.defaultModel || PROVIDER_META.gemini.defaultModel;

const requestModelText = async ({ provider, model, apiKey, instructions, inputText, history = [] }) => {
  const selectedModel = normalizeProviderModel(provider, model || getDefaultModel(provider));
  const result = await proxyChat({
    provider,
    model: selectedModel,
    instructions,
    inputText,
    history: history.map((m) => ({ role: m.role, content: toText(m.content) })),
    apiKeyOverride: apiKey || "",
  });
  if (!result?.text) throw new Error("No response text was returned by the model.");
  return { text: result.text, usedSearch: result.used_search || false };
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
  const [datasetBootReady, setDatasetBootReady] = useState(false);
  const [uploadMode, setUploadMode] = useState("override");
  const [stagedData, setStagedData] = useState(null);
  const [stagedSource, setStagedSource] = useState("");
  const [provider, setProvider] = useState(() => {
    if (typeof window === "undefined") return "nvidia";
    const stored = window.localStorage.getItem(LLM_PROVIDER_KEY) || "nvidia";
    return FREE_PROVIDER_OPTIONS.includes(stored) ? stored : "nvidia";
  });
  const [apiKey, setApiKey] = useState(() => {
    return loadStoredApiKey();
  });
  const [model, setModel] = useState(() => {
    if (typeof window === "undefined") return getDefaultModel("nvidia");
    return window.localStorage.getItem(LLM_MODEL_STORE) || window.localStorage.getItem("mrmilk_openai_model") || getDefaultModel("nvidia");
  });
  const [loading, setLoading] = useState(false);
  const [calendarView, setCalendarView] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedDateIso, setSelectedDateIso] = useState(() => toISODateString(new Date()));
  const [selectedCalendarEventId, setSelectedCalendarEventId] = useState("");
  const [calendarTypeFilter, setCalendarTypeFilter] = useState("all");
  const [calendarAreaFilter, setCalendarAreaFilter] = useState("all");
  const [calendarConfidenceFilter, setCalendarConfidenceFilter] = useState("all");
  const [calendarHideTentative, setCalendarHideTentative] = useState(false);
  const [calendarQuery, setCalendarQuery] = useState("");
  const [proofPanel, setProofPanel] = useState({
    open: false,
    title: "",
    subtitle: "",
    source: "",
    filters: [],
    customers: [],
    query: "",
    openedFrom: "",
    sortMode: "revenue_desc"
  });
  const [proofSearch, setProofSearch] = useState("");
  const [proofPage, setProofPage] = useState(1);
  const [proofPageSize, setProofPageSize] = useState("all");
  const [proofView, setProofView] = useState({
    status: "all",
    wallet: "all",
    area: "all",
    hub: "all",
    sortMode: "revenue_desc"
  });
  const [proofSorting, setProofSorting] = useState(() => sortModeToTableSorting("revenue_desc"));
  const [proofActionState, setProofActionState] = useState({
    active: false,
    anchorId: "",
    profileId: "default",
    chip: "",
    accent: "#074069",
    title: "",
    detail: "",
    benefit: "",
    progress: 0,
    notes: [],
    noteCursor: 0,
    startedAt: 0
  });
  const chatScrollRef = useRef(null);
  const chatInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const proofActionRef = useRef(false);
  const [autoPinChat, setAutoPinChat] = useState(true);
  const deferredInput = useDeferredValue(inp);
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
    if (!FREE_PROVIDER_OPTIONS.includes(provider)) setProvider("nvidia");
  }, [provider]);
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
    persistApiKey(apiKey);
  }, [apiKey]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LLM_MODEL_STORE, model);
  }, [model]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const hydrateFullDataset = async () => {
      try {
        const fullDataset = await loadFullDatasetFromDb();
        if (cancelled || !fullDataset?.overview?.total_customers || !asArray(fullDataset?.customer_records).length) return;
        setAppData((current) => {
          const currentFullRows = asArray(current?.customer_records).length;
          return currentFullRows >= asArray(fullDataset.customer_records).length ? current : fullDataset;
        });
        setDataSource((current) => (/Built-in sample data|Cached Excel snapshot/.test(current) ? "IndexedDB full dataset cache" : current));
      } catch {
        // ignore IndexedDB cache issues
      } finally {
        if (!cancelled) setDatasetBootReady(true);
      }
    };
    hydrateFullDataset();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!asArray(appData?.customer_records).length) return;
    if (dataSource === "IndexedDB full dataset cache") return;
    saveFullDatasetToDb(appData).catch(() => false);
  }, [appData, dataSource]);
  useEffect(() => {
    setModel((prev) => {
      if (!prev) return getDefaultModel(provider);
      if (provider === "gemini" && /gpt|o\d|claude|qwen|nemotron|llama/i.test(prev)) return getDefaultModel("gemini");
      if (provider === "openai" && /gemini|qwen|nemotron|llama/i.test(prev)) return getDefaultModel("openai");
      if (provider === "nvidia" && /gemini|gpt|o\d|claude/i.test(prev)) return getDefaultModel("nvidia");
      return normalizeProviderModel(provider, prev);
    });
  }, [provider]);

  // ------------------------------------------------------------------
  // Live data: fetch aggregated summary from backend on mount.
  // This replaces the hardcoded DATA constant with the actual live
  // snapshot stored in Supabase after an Import Center upload.
  // Falls back gracefully — if no snapshot exists or the backend is
  // offline, the existing localStorage/IndexedDB/built-in data is kept.
  // ------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const loadLiveSummary = async () => {
      try {
        const summary = await fetchCustomerSummary();
        if (cancelled || !summary?.overview?.total_customers) return;
        setAppData((current) => {
          // Don't replace if the user already manually loaded a workbook this session
          if (/Dataset override|Auto-loaded/.test(dataSource)) return current;
          return summary;
        });
        setDataSource("Live database snapshot");
        window.localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(summary));
      } catch {
        // Backend offline or no snapshot yet — keep existing data source
      }
    };
    loadLiveSummary();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------
  // Live data: lazily fetch full customer records for DuckDB queries
  // after the summary has loaded. Only runs when live data is active
  // and no full records are in memory yet.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (dataSource !== "Live database snapshot") return;
    if (asArray(appData?.customer_records).length > 0) return;
    let cancelled = false;
    const loadLiveRecords = async () => {
      try {
        const payload = await fetchCustomerRecords();
        if (cancelled || !payload?.records?.length) return;
        setAppData((current) => ({ ...current, customer_records: payload.records }));
        setDataSource("Live database snapshot (full)");
        await saveFullDatasetToDb({ ...appData, customer_records: payload.records }).catch(() => false);
      } catch {
        // Non-fatal — charts still work, customer match falls back to top_20
      }
    };
    loadLiveRecords();
    return () => { cancelled = true; };
  }, [appData, dataSource]);

  useEffect(() => {
    if (typeof window === "undefined" || !datasetBootReady) return;
    if (asArray(appData?.customer_records).length) return;
    // Skip XLSX auto-load if live DB data is already loaded
    if (dataSource === "Live database snapshot" || dataSource === "Live database snapshot (full)") return;
    let cancelled = false;
    const tryAutoLoadWorkbook = async () => {
      setDataLoading(true);
      setDataError("");
      for (const path of AUTO_EXCEL_PATHS) {
        try {
          const res = await fetch(path);
          if (!res.ok) continue;
          const buffer = await res.arrayBuffer();
          const derived = await parseDatasetBuffer(buffer, Date.now(), path);
          if (cancelled) return;
          setAppData(derived);
          setDataSource(`Auto-loaded: ${path}`);
          window.localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(stripDatasetForCache(derived)));
          await saveFullDatasetToDb(derived).catch(() => false);
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
  }, [appData, datasetBootReady, dataSource]);

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
        if (typeof window !== "undefined") window.localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(stripDatasetForCache(derived)));
        await saveFullDatasetToDb(derived).catch(() => false);
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
    clearFullDatasetFromDb().catch(() => false);
  };

  const applyStagedDataset = async () => {
    if (!stagedData) return;
    setAppData(stagedData);
    setDataSource(`Dataset override: ${stagedSource}`);
    setStagedData(null);
    setStagedSource("");
    setDataError("");
    if (typeof window !== "undefined") window.localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(stripDatasetForCache(stagedData)));
    await saveFullDatasetToDb(stagedData).catch(() => false);
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
  const customerRecords = useMemo(() => getCustomerRecords(appData), [appData]);
  const topAreaNames = useMemo(() => Object.keys(appData.top_areas_by_revenue || {}).slice(0, 3), [appData]);
  const isCalendarTab = tab === "calendar";
  const calendarEvents = useMemo(() => {
    if (!isCalendarTab) return [];
    const y = new Date().getFullYear();
    return [...buildCalendarEvents(y - 1), ...buildCalendarEvents(y), ...buildCalendarEvents(y + 1)]
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [isCalendarTab]);
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
  const calendarEventTargeting = useMemo(() => {
    if (!isCalendarTab || !selectedMonthEvents.length || !customerRecords.length) return {};
    return Object.fromEntries(selectedMonthEvents.map((event) => {
      return [event.id, buildCalendarEventTargeting(event, customerRecords, topAreaNames)];
    }));
  }, [customerRecords, isCalendarTab, selectedMonthEvents, topAreaNames]);
  const calendarEventProofStats = useMemo(() =>
    Object.fromEntries(Object.entries(calendarEventTargeting).map(([eventId, intelligence]) => [eventId, intelligence?.stats || buildProofStats([])])),
    [calendarEventTargeting]
  );
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
  const selectedCalendarEvent = useMemo(() => {
    const byId = filteredCalendarEvents.find((event) => event.id === selectedCalendarEventId);
    return byId || selectedDateEvents[0] || selectedMonthLeadEvent || upcomingCalendarEvents[0] || null;
  }, [filteredCalendarEvents, selectedCalendarEventId, selectedDateEvents, selectedMonthLeadEvent, upcomingCalendarEvents]);
  const selectedCalendarEventIntelligence = useMemo(() => {
    if (!selectedCalendarEvent) return null;
    return calendarEventTargeting[selectedCalendarEvent.id]
      || buildCalendarEventTargeting(selectedCalendarEvent, customerRecords, topAreaNames);
  }, [calendarEventTargeting, customerRecords, selectedCalendarEvent, topAreaNames]);
  const selectedCalendarEventArc = useMemo(() => {
    if (!selectedCalendarEvent || !selectedCalendarEventIntelligence) return [];
    return buildCalendarCampaignArc(selectedCalendarEvent, selectedCalendarEventIntelligence);
  }, [selectedCalendarEvent, selectedCalendarEventIntelligence]);
  const selectedDateEventIds = useMemo(() => new Set(selectedDateEvents.map((event) => event.id)), [selectedDateEvents]);
  useEffect(() => {
    if (!isCalendarTab) return;
    if (selectedDateEvents.some((event) => event.id === selectedCalendarEventId)) return;
    if (selectedDateEvents[0]?.id) {
      setSelectedCalendarEventId(selectedDateEvents[0].id);
      return;
    }
    if (selectedMonthLeadEvent?.id) {
      setSelectedCalendarEventId(selectedMonthLeadEvent.id);
    }
  }, [isCalendarTab, selectedCalendarEventId, selectedDateEvents, selectedMonthLeadEvent]);
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
  const hasFullWorkbookRows = asArray(appData?.customer_records).length > 0;
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
    .map(([name, d]) => ({ name: name.length > 12 ? name.slice(0, 12) : name, rev: Math.round(toNumber(d?.revenue) / 100000), cust: toInt(d?.customers), full: name }))
    .sort((a, b) => b.rev - a.rev), [appData]);

  const walletData = useMemo(() => [
    { name: "Positive", v: toInt(appData.wallet_stats?.customers_with_positive_wallet), c: "#44cc88" },
    { name: "Zero", v: toInt(appData.wallet_stats?.customers_with_zero_wallet), c: "#222240" },
    { name: "Negative", v: toInt(appData.wallet_stats?.customers_with_negative_wallet), c: "#ff4444" }
  ], [appData]);

  const srcData = useMemo(() => sortDesc(Object.entries(appData.sources || {}))
    .map(([name, value]) => ({ name: name.length > 9 ? name.slice(0, 9) + "..." : name, value: toInt(value), full: name })), [appData]);

  const areaPerformanceData = useMemo(() => {
    const buckets = {};
    customerRecords.forEach((record) => {
      const area = toText(record.area) || "Unknown Area";
      if (!buckets[area]) {
        buckets[area] = {
          area,
          customers: 0,
          revenue: 0,
          orders: 0,
          negativeWallet: 0,
          inactive: 0,
          suspended: 0
        };
      }
      buckets[area].customers += 1;
      buckets[area].revenue += toInt(record.revenue);
      buckets[area].orders += toInt(record.orders);
      if (toInt(record.wallet_balance) < 0) buckets[area].negativeWallet += 1;
      if (matchesCustomerStatus(record, "inactive")) buckets[area].inactive += 1;
      if (matchesCustomerStatus(record, "suspended")) buckets[area].suspended += 1;
    });
    Object.entries(appData.top_areas_by_revenue || {}).forEach(([area, stats]) => {
      if (!buckets[area]) {
        buckets[area] = {
          area,
          customers: toInt(stats?.customers),
          revenue: toInt(stats?.revenue),
          orders: 0,
          negativeWallet: 0,
          inactive: 0,
          suspended: 0
        };
      }
    });
    return Object.values(buckets)
      .map((bucket) => ({
        ...bucket,
        avgRevenue: bucket.customers ? Math.round(bucket.revenue / bucket.customers) : 0,
        riskRate: bucket.customers ? Number((((bucket.inactive + bucket.suspended) / bucket.customers) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [appData, customerRecords]);

  const areaTreemapOption = useMemo(() => ({
    backgroundColor: "transparent",
    tooltip: {
      backgroundColor: "#ffffff",
      borderColor: "#d7e3f0",
      textStyle: { color: "#20476d", fontFamily: "Montserrat, sans-serif" },
      formatter: (params) => {
        const node = params?.data || {};
        return [
          `<strong>${toText(node.fullArea || params?.name)}</strong>`,
          `Revenue: ${inr(node.value)}`,
          `Customers: ${toInt(node.customers).toLocaleString()}`,
          `Avg revenue/customer: ${inr(node.avgRevenue)}`,
          `Negative wallet: ${toInt(node.negativeWallet).toLocaleString()}`,
          `At-risk share: ${toNumber(node.riskRate).toFixed(1)}%`
        ].join("<br/>");
      }
    },
    series: [{
      type: "treemap",
      roam: false,
      nodeClick: false,
      breadcrumb: { show: false },
      label: {
        show: true,
        color: "#ffffff",
        fontFamily: "Montserrat, sans-serif",
        formatter: ({ data }) => `${toText(data?.fullArea || data?.name)}\n${formatCompactInr(data?.value)}`
      },
      upperLabel: { show: false },
      itemStyle: { borderColor: "#ffffff", borderWidth: 4, gapWidth: 4 },
      levels: [{ colorSaturation: [0.25, 0.8], itemStyle: { gapWidth: 4, borderWidth: 4 } }],
      data: areaPerformanceData.slice(0, 18).map((area) => ({
        name: area.area,
        fullArea: area.area,
        value: area.revenue,
        customers: area.customers,
        avgRevenue: area.avgRevenue,
        negativeWallet: area.negativeWallet,
        riskRate: area.riskRate
      }))
    }]
  }), [areaPerformanceData]);

  const areaHealthMatrixOption = useMemo(() => ({
    backgroundColor: "transparent",
    tooltip: {
      backgroundColor: "#ffffff",
      borderColor: "#d7e3f0",
      textStyle: { color: "#20476d", fontFamily: "Montserrat, sans-serif" },
      formatter: (params) => {
        const [customers, avgRevenue, negativeWallet, revenue, riskRate] = asArray(params?.value);
        return [
          `<strong>${params?.name}</strong>`,
          `Customers: ${toInt(customers).toLocaleString()}`,
          `Avg revenue/customer: ${inr(avgRevenue)}`,
          `Revenue: ${inr(revenue)}`,
          `Negative wallet: ${toInt(negativeWallet).toLocaleString()}`,
          `At-risk share: ${toNumber(riskRate).toFixed(1)}%`
        ].join("<br/>");
      }
    },
    grid: { left: 56, right: 24, top: 20, bottom: 46 },
    xAxis: {
      type: "value",
      name: "Customers",
      nameTextStyle: { color: "#587493", fontFamily: "Montserrat, sans-serif" },
      axisLabel: { color: "#587493" },
      splitLine: { lineStyle: { color: "#edf3fa" } }
    },
    yAxis: {
      type: "value",
      name: "Avg revenue/customer",
      nameTextStyle: { color: "#587493", fontFamily: "Montserrat, sans-serif" },
      axisLabel: { color: "#587493", formatter: (value) => formatCompactInr(value) },
      splitLine: { lineStyle: { color: "#edf3fa" } }
    },
    visualMap: {
      show: false,
      min: 0,
      max: Math.max(5, ...areaPerformanceData.map((area) => toNumber(area.riskRate))),
      dimension: 4,
      inRange: { color: ["#44cc88", "#d2ab67", "#ff6b57"] }
    },
    series: [{
      type: "scatter",
      data: areaPerformanceData.slice(0, 24).map((area) => ({
        name: area.area,
        value: [area.customers, area.avgRevenue, area.negativeWallet, area.revenue, area.riskRate],
        symbolSize: Math.max(16, Math.min(52, 14 + (area.negativeWallet * 2))),
        itemStyle: { opacity: 0.9, shadowBlur: 12, shadowColor: "rgba(7,64,105,0.16)" }
      }))
    }]
  }), [areaPerformanceData]);

  const statusMixOption = useMemo(() => ({
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: "#ffffff",
      borderColor: "#d7e3f0",
      textStyle: { color: "#20476d", fontFamily: "Montserrat, sans-serif" }
    },
    graphic: [
      {
        type: "text",
        left: "center",
        top: "41%",
        style: { text: "Status mix", fill: "#587493", font: "600 11px Montserrat" }
      },
      {
        type: "text",
        left: "center",
        top: "50%",
        style: { text: toInt(D.total_customers).toLocaleString(), fill: "#1f3550", font: "700 18px Montserrat" }
      }
    ],
    series: [{
      type: "pie",
      radius: ["52%", "76%"],
      center: ["50%", "52%"],
      avoidLabelOverlap: true,
      label: { color: "#365a7f", formatter: "{b}\n{d}%" },
      labelLine: { length: 10, length2: 6 },
      data: statusData.map((status) => ({ name: status.name, value: status.v, itemStyle: { color: status.c } }))
    }]
  }), [D.total_customers, statusData]);

  const walletHealthOption = useMemo(() => ({
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: "#ffffff",
      borderColor: "#d7e3f0",
      textStyle: { color: "#20476d", fontFamily: "Montserrat, sans-serif" }
    },
    graphic: [
      {
        type: "text",
        left: "center",
        top: "42%",
        style: { text: "Wallet", fill: "#587493", font: "600 11px Montserrat" }
      },
      {
        type: "text",
        left: "center",
        top: "51%",
        style: { text: inr(toInt(appData.wallet_stats?.total_wallet)), fill: "#1f3550", font: "700 15px Montserrat" }
      }
    ],
    series: [{
      type: "pie",
      radius: ["50%", "74%"],
      center: ["50%", "52%"],
      label: { color: "#365a7f", formatter: "{b}\n{d}%" },
      labelLine: { length: 10, length2: 6 },
      data: walletData.map((wallet) => ({ name: wallet.name, value: wallet.v, itemStyle: { color: wallet.c } }))
    }]
  }), [appData.wallet_stats?.total_wallet, walletData]);

  const hubPerformanceOption = useMemo(() => ({
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: "#ffffff",
      borderColor: "#d7e3f0",
      textStyle: { color: "#20476d", fontFamily: "Montserrat, sans-serif" }
    },
    legend: {
      bottom: 0,
      textStyle: { color: "#587493", fontFamily: "Montserrat, sans-serif", fontSize: 10 }
    },
    grid: { left: 40, right: 42, top: 18, bottom: 48 },
    xAxis: {
      type: "category",
      data: hubData.map((hub) => hub.full),
      axisLabel: { color: "#587493", interval: 0, rotate: 20 }
    },
    yAxis: [
      {
        type: "value",
        name: "Revenue (Rs L)",
        nameTextStyle: { color: "#587493", fontFamily: "Montserrat, sans-serif" },
        axisLabel: { color: "#587493" },
        splitLine: { lineStyle: { color: "#edf3fa" } }
      },
      {
        type: "value",
        name: "Customers",
        nameTextStyle: { color: "#587493", fontFamily: "Montserrat, sans-serif" },
        axisLabel: { color: "#587493" }
      }
    ],
    series: [
      {
        name: "Revenue (Rs L)",
        type: "bar",
        barMaxWidth: 34,
        itemStyle: { color: "#44cc88", borderRadius: [8, 8, 0, 0] },
        data: hubData.map((hub) => hub.rev)
      },
      {
        name: "Customers",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 8,
        lineStyle: { color: "#074069", width: 3 },
        itemStyle: { color: "#074069" },
        data: hubData.map((hub) => hub.cust)
      }
    ]
  }), [hubData]);

  const sourceMixOption = useMemo(() => ({
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: "#ffffff",
      borderColor: "#d7e3f0",
      textStyle: { color: "#20476d", fontFamily: "Montserrat, sans-serif" }
    },
    grid: { left: 90, right: 20, top: 18, bottom: 12 },
    xAxis: {
      type: "value",
      axisLabel: { color: "#587493" },
      splitLine: { lineStyle: { color: "#edf3fa" } }
    },
    yAxis: {
      type: "category",
      data: srcData.map((source) => source.full),
      axisLabel: { color: "#587493" }
    },
    series: [{
      type: "bar",
      barMaxWidth: 22,
      itemStyle: { color: "#4499ff", borderRadius: [0, 8, 8, 0] },
      data: srcData.map((source) => source.value)
    }]
  }), [srcData]);

  const topSuspended = useMemo(() => (appData.top_20_customers || []).find(c => /suspend/i.test(toText(c["Sub. Status"]))) || (appData.top_20_customers || [])[0], [appData]);
  const inactiveHighlights = useMemo(() => (appData.high_value_inactive || []).slice(0, 4), [appData]);
  const primaryOutcome = inferPrimaryOutcome(chatControls);
  const activeOutcome = getOutcomeMeta(primaryOutcome);
  const calendarCampaignCards = useMemo(() => selectedMonthEvents.slice(0, 31).map((event) => {
    const intelligence = calendarEventTargeting[event.id] || buildCalendarEventTargeting(event, customerRecords, topAreaNames);
    const areaList = event.areas?.length ? event.areas.join(", ") : (topAreaNames.join(", ") || "Top revenue areas");
    const dateTag = formatDateLongIso(event.date);
    return {
      ...event,
      areaList,
      dateTag,
      targetCount: intelligence.stats.count,
      targetRevenue: intelligence.stats.revenue,
      targetLabel: intelligence.profileLabel,
      filtersUsed: intelligence.filtersUsed,
      whatsapp: `Namaskar from Mr. Milk. ${event.name} (${dateTag}) planning note: ${event.offer}. Reply YES if you want us to line up your premium A2 delivery schedule.`
    };
  }), [calendarEventTargeting, customerRecords, selectedMonthEvents, topAreaNames]);
  const liveCustomerPreview = useMemo(() => {
    if (!toText(deferredInput)) return null;
    if (!(activeOutcome.id === "customer_list" || isDeterministicCustomerQuery(deferredInput, true))) return null;
    return buildCustomerQueryContext(appData, deferredInput, 5, true);
  }, [activeOutcome.id, appData, deferredInput]);
  const chatShortcutPrompts = useMemo(() => {
    const proofArea = topAreaNames[0] || "Hadapsar";
    const growthArea = topAreaNames[1] || topAreaNames[0] || "Kharadi";
    if (activeOutcome.id === "root_cause") {
      return [
        `Why are premium customers churning in ${growthArea}?`,
        `What is causing negative wallet growth in ${proofArea}?`,
        "Why is trial conversion weak right now?",
        "What is the main reason high-value inactive customers are not returning?"
      ];
    }
    if (activeOutcome.id === "action_plan") {
      return [
        `Build a premium-safe reactivation plan for suspended customers in ${proofArea} this week`,
        `Give me a premium growth plan for ${growthArea} this month`,
        "What should CRM do this week for high-value inactive customers?",
        "Create a premium-safe wallet recovery plan for at-risk customers"
      ];
    }
    if (activeOutcome.id === "scripts") {
      return [
        `Write a premium WhatsApp restart script for inactive customers in ${proofArea}`,
        "Give me a wallet top-up call script without discount language",
        `Create a first-time trial pack script for new leads in ${growthArea}`,
        "Write a premium reassurance script for high-value loyal customers"
      ];
    }
    return [
      "Which customers have wallet balance but no order in the last 60 days?",
      "How many high-value inactive customers should CRM review today?",
      `Give me a preview of negative wallet customers in ${proofArea}`,
      `Which customers prove the issue in ${proofArea}?`
    ];
  }, [activeOutcome.id, topAreaNames]);
  const applyContextPreset = (preset) => {
    if (!preset?.controls) return;
    const presetOutcome = preset.controls.primary_outcome || inferPrimaryOutcome(preset.controls);
    setChatControls((prev) => applyOutcomeToControls({ ...prev, ...preset.controls }, presetOutcome));
    setChatNotice(`Preset applied: ${preset.label}. The main view is now tuned for ${getOutcomeMeta(presetOutcome).label}.`);
  };
  const syncProofActionState = (startedAt, patch) => {
    setProofActionState((prev) => (prev.startedAt === startedAt ? { ...prev, ...patch } : prev));
  };
  const renderProofCardLoader = (anchorId) => {
    if (!proofActionState.active || proofActionState.anchorId !== anchorId) return null;
    const accent = toText(proofActionState.accent) || "#074069";
    const noteIndex = Math.min(asArray(proofActionState.notes).length - 1, Math.max(0, toInt(proofActionState.noteCursor)));
    const activeNote = asArray(proofActionState.notes)[noteIndex];
    return (
      <div style={{position:"absolute",inset:0,pointerEvents:"none",borderRadius:"inherit",overflow:"hidden",zIndex:3}}>
        <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg, rgba(248,251,255,0.2), rgba(248,251,255,0.72))",backdropFilter:"blur(5px)"}} />
        <div style={{position:"absolute",left:10,right:10,bottom:10,background:"rgba(255,255,255,0.98)",border:`1px solid ${accent}24`,borderRadius:14,boxShadow:"0 16px 32px rgba(7,64,105,0.13)",padding:"10px 11px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
            <span style={{background:`${accent}12`,border:`1px solid ${accent}28`,borderRadius:999,padding:"3px 8px",fontSize:9,fontWeight:700,color:accent,letterSpacing:0.4,textTransform:"uppercase"}}>
              {proofActionState.chip || "Proof Sync"}
            </span>
            <span style={{fontSize:10,fontWeight:700,color:accent}}>{Math.min(100, Math.max(0, toInt(proofActionState.progress)))}%</span>
          </div>
          <div style={{color:"#12395a",fontSize:10.5,fontWeight:700,lineHeight:1.35,marginTop:7,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
            {proofActionState.title}
          </div>
          <div style={{color:"#5f7f9f",fontSize:9,marginTop:3,lineHeight:1.35}}>
            {proofActionState.detail}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8}}>
            <div style={{flex:1,height:6,background:"#edf4fb",borderRadius:999,overflow:"hidden",border:"1px solid #d9e7f4"}}>
              <div style={{height:"100%",width:`${Math.min(100, Math.max(0, toNumber(proofActionState.progress)))}%`,background:`linear-gradient(90deg, ${accent}, #d2ab67)`,borderRadius:999,transition:"width 180ms ease"}} />
            </div>
            <span style={{fontSize:9,color:"#8aa2bb",fontWeight:600,whiteSpace:"nowrap"}}>open at 100%</span>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"flex-start",marginTop:8,minHeight:24}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:accent,marginTop:4,flexShrink:0,boxShadow:`0 0 0 3px ${accent}14`}} />
            <div style={{fontSize:9,color:"#6d87a8",lineHeight:1.4}}>
              {toText(activeNote?.text || proofActionState.benefit)}
            </div>
          </div>
        </div>
      </div>
    );
  };
  const runProofAction = async (config = {}, preparePanel) => {
    if (proofActionRef.current) return null;
    proofActionRef.current = true;
    let progress = {
      ...buildProofProgressCopy(config),
      active: false,
      anchorId: toText(config.anchorId),
      startedAt: Date.now(),
      progress: 0,
      noteCursor: 0
    };
    let overlayVisible = Boolean(config.showImmediately);
    if (overlayVisible) {
      setProofActionState({ ...progress, active: true });
      await waitForUiPaint();
    }
    const pushStage = (patch = {}) => {
      progress = { ...progress, ...patch };
      if (!overlayVisible && (Date.now() - progress.startedAt) >= KPI_PROGRESS_DELAY_MS) {
        overlayVisible = true;
        setProofActionState({ ...progress, active: true });
        return;
      }
      if (overlayVisible) syncProofActionState(progress.startedAt, patch);
    };
    try {
      const panelPayload = await preparePanel({
        setStage: pushStage
      });
      pushStage({
        progress: 100,
        noteCursor: Math.min(asArray(progress.notes).length - 1, 2),
        detail: "Exact report is ready. Opening proof now."
      });
      if (overlayVisible) {
        const elapsed = Date.now() - progress.startedAt;
        const holdFor = Math.max(0, toInt(config.minimumVisibleMs) - elapsed);
        if (holdFor) await sleep(holdFor);
        await waitForUiPaint();
        await sleep(90);
      }
      commitProofPanel(panelPayload);
      return panelPayload;
    } catch (error) {
      setChatNotice(toText(error?.message) || "Could not prepare proof rows.");
      return null;
    } finally {
      proofActionRef.current = false;
      if (overlayVisible) {
        setProofActionState((prev) => (
          prev.startedAt === progress.startedAt
            ? { active: false, anchorId: "", profileId: "default", chip: "", accent: "#074069", title: "", detail: "", benefit: "", progress: 0, notes: [], noteCursor: 0, startedAt: 0 }
            : prev
        ));
      }
    }
  };
  const commitProofPanel = ({ title, subtitle = "", customers = [], filters = [], source = "", query = "", openedFrom = "", sortMode = "revenue_desc" }) => {
    const sortedCustomers = sortCustomerRecords(customers, sortMode);
    setProofSearch("");
    setProofPage(1);
    setProofPageSize("all");
    startTransition(() => {
      setProofSorting(sortModeToTableSorting(sortMode));
      setProofView({
        status: "all",
        wallet: "all",
        area: "all",
        hub: "all",
        sortMode
      });
      setProofPanel({
        open: true,
        title,
        subtitle,
        source: source || dataSource,
        filters: asArray(filters),
        customers: sortedCustomers,
        query,
        openedFrom,
        sortMode
      });
    });
  };
  const openProofPanel = async ({ title, subtitle = "", customers = [], filters = [], source = "", query = "", openedFrom = "", sortMode = "revenue_desc", anchorId = "", profileId = "default" }) => {
    if (!anchorId) {
      commitProofPanel({ title, subtitle, customers, filters, source, query, openedFrom, sortMode });
      return;
    }
    return runProofAction(
      { title: title || query || "customer proof", rowCount: asArray(customers).length || customerRecords.length, mode: "load", anchorId, profileId },
      async ({ setStage }) => {
        setStage({
          progress: 62,
          noteCursor: 1,
          detail: `${asArray(customers).length.toLocaleString()} rows are being ranked and packaged for proof view.`
        });
        await waitForUiPaint();
        return { title, subtitle, customers, filters, source, query, openedFrom, sortMode };
      }
    );
  };
  const closeProofPanel = () => setProofPanel((prev) => ({ ...prev, open: false }));
  const openProofFromFilters = async ({ title, subtitle = "", filters = {}, source = "", query = "", openedFrom = "", sortMode = "revenue_desc", anchorId = "", profileId = "default" }) => {
    if (!anchorId) {
      const customers = filterCustomerRecords(customerRecords, filters);
      const stats = buildProofStats(customers);
      const completenessNote = hasFullWorkbookRows ? "" : " Full workbook rows are not loaded yet, so this proof panel is limited to cached sample rows.";
      commitProofPanel({
        title,
        subtitle: `${subtitle || `${stats.count.toLocaleString()} matched customers from ${dataSource}.`}${completenessNote}`,
        customers,
        filters: describeCustomerFilters(filters),
        source: source || dataSource,
        query,
        openedFrom,
        sortMode
      });
      return;
    }
    return runProofAction(
      { title: title || query || "customer proof", rowCount: customerRecords.length, mode: "filter", anchorId, profileId },
      async ({ setStage }) => {
        setStage({
          progress: 44,
          noteCursor: 1,
          detail: `Applying the exact area, status, wallet, and note filters now.`
        });
        await waitForUiPaint();
        const customers = filterCustomerRecords(customerRecords, filters);
        const stats = buildProofStats(customers);
        setStage({
          progress: 76,
          noteCursor: 2,
          detail: `${stats.count.toLocaleString()} matched rows ready. Finalizing proof sort and summaries.`
        });
        const completenessNote = hasFullWorkbookRows ? "" : " Full workbook rows are not loaded yet, so this proof panel is limited to cached sample rows.";
        return {
          title,
          subtitle: `${subtitle || `${stats.count.toLocaleString()} matched customers from ${dataSource}.`}${completenessNote}`,
          customers,
          filters: describeCustomerFilters(filters),
          source: source || dataSource,
          query,
          openedFrom,
          sortMode
        };
      }
    );
  };
  const openProofFromQuery = async ({ title, query, source = "", openedFrom = "", subtitle = "", anchorId = "", profileId = "default" }) => {
    if (!anchorId) {
      const queryContext = buildCustomerQueryContext(appData, query, 999999, false, true);
      commitProofPanel({
        title,
        subtitle: subtitle || `${queryContext.totalMatches.toLocaleString()} matched customers from exact dataset filtering.`,
        customers: queryContext.customers,
        filters: queryContext.filtersApplied,
        source: source || dataSource,
        query,
        openedFrom,
        sortMode: queryContext.sortMode
      });
      return;
    }
    return runProofAction(
      { title: title || query || "customer proof", rowCount: customerRecords.length, mode: "filter", anchorId, profileId },
      async ({ setStage }) => {
        setStage({
          progress: 46,
          noteCursor: 1,
          detail: "Running exact dataset matching from the current workbook."
        });
        await waitForUiPaint();
        const queryContext = buildCustomerQueryContext(appData, query, 999999, false, true);
        setStage({
          progress: 78,
          noteCursor: 2,
          detail: `${queryContext.totalMatches.toLocaleString()} exact matches found. Preparing the final report view.`
        });
        return {
          title,
          subtitle: subtitle || `${queryContext.totalMatches.toLocaleString()} matched customers from exact dataset filtering.`,
          customers: queryContext.customers,
          filters: queryContext.filtersApplied,
          source: source || dataSource,
          query,
          openedFrom,
          sortMode: queryContext.sortMode
        };
      }
    );
  };
  const exportProofCsv = (rows, label = "customer-proof") => {
    if (typeof window === "undefined") return;
    const header = ["Name", "Mobile", "Area", "Hub", "Status", "Revenue", "Wallet", "Orders", "Last Delivery", "Source", "Payment Mode", "Note", "Why It Matters"];
    const escapeCsv = (value) => `"${toText(value).replace(/"/g, "\"\"")}"`;
    const csv = [
      header.join(","),
      ...asArray(rows).map((customer) => [
        customer?.name,
        customer?.mobile,
        customer?.area,
        customer?.hub,
        customer?.status,
        toInt(customer?.revenue),
        toInt(customer?.wallet_balance),
        toInt(customer?.orders),
        customer?.last_delivery,
        customer?.source,
        customer?.payment_mode,
        customer?.note,
        customer?.why_it_matters
      ].map(escapeCsv).join(","))
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const safeName = (toText(label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "customer-proof");
    anchor.href = url;
    anchor.download = `${safeName}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  };
  const openAreaProof = (area, meta = {}) => openProofFromFilters({
    title: `${area} customer proof`,
    subtitle: `All customer rows from ${area} in the current workbook.`,
    filters: { areas: [area] },
    source: `Dashboard | ${dataSource}`,
    query: `customers in ${area}`,
    openedFrom: "dashboard",
    anchorId: meta.anchorId,
    profileId: meta.profileId || "area"
  });
  const openHubProof = (hub, meta = {}) => openProofFromFilters({
    title: `${hub} customer proof`,
    subtitle: `All customer rows assigned to ${hub}.`,
    filters: { hubs: [hub] },
    source: `Dashboard | ${dataSource}`,
    query: `customers in ${hub}`,
    openedFrom: "dashboard",
    anchorId: meta.anchorId,
    profileId: meta.profileId || "hub"
  });
  const openWalletProof = (walletName, meta = {}) => openProofFromFilters({
    title: `${walletName} wallet customer proof`,
    subtitle: `All ${walletName.toLowerCase()} wallet customers from the current workbook.`,
    filters: { wallet: walletName.toLowerCase() },
    source: `Dashboard | ${dataSource}`,
    query: `${walletName.toLowerCase()} wallet customers`,
    openedFrom: "dashboard",
    sortMode: walletName.toLowerCase() === "negative" ? "wallet_asc" : "revenue_desc",
    anchorId: meta.anchorId,
    profileId: meta.profileId || "wallet"
  });
  const openSourceProof = (sourceName, meta = {}) => openProofFromFilters({
    title: `${sourceName} source proof`,
    subtitle: `Customers acquired from ${sourceName}.`,
    filters: { sources: [sourceName] },
    source: `Dashboard | ${dataSource}`,
    query: `${sourceName} customers`,
    openedFrom: "dashboard",
    anchorId: meta.anchorId,
    profileId: meta.profileId || "source"
  });
  const openStatusProof = (statusLabel, meta = {}) => {
    if (statusLabel === "Others") {
      const namedStatuses = statusData.filter((item) => item.name !== "Others").map((item) => item.name);
      const customers = customerRecords.filter((record) => !namedStatuses.some((name) => toKey(record.status) === toKey(name)));
      openProofPanel({
        title: "Other status customer proof",
        subtitle: "Customers whose status does not fall in the top visible status buckets.",
        customers,
        filters: ["status:others"],
        source: `Dashboard | ${dataSource}`,
        query: "other status customers",
        openedFrom: "dashboard",
        anchorId: meta.anchorId,
        profileId: meta.profileId || "status"
      });
      return;
    }
    openProofFromFilters({
      title: `${statusLabel} customer proof`,
      subtitle: `Customers matching status bucket: ${statusLabel}.`,
      filters: { statusText: [statusLabel] },
      source: `Dashboard | ${dataSource}`,
      query: `${statusLabel} customers`,
      openedFrom: "dashboard",
      anchorId: meta.anchorId,
      profileId: meta.profileId || "status"
    });
  };
  const shouldUseKpiProofLoader = (metric = "", anchorId = "") => metric === "total" && Boolean(toText(anchorId)) && customerRecords.length >= KPI_TOTAL_PROGRESS_THRESHOLD;
  const buildKpiProofPayload = async (metric, setStage = () => {}) => {
    const rows = customerRecords;
    const totalRows = Math.max(1, rows.length);
    const matched = [];
    let predicate = () => true;
    let sortMode = "revenue_desc";
    let title = "All customers in current workbook";
    let subtitle = `${customerRecords.length.toLocaleString()} grounded rows available for proof.`;
    let filters = ["dataset:all_customers"];
    let query = "all customers";
    let profileId = "dataset";

    if (metric === "active") {
      predicate = (row) => matchesCustomerStatus(row, "active");
      title = "Active customer proof";
      subtitle = "All active customer rows from the current workbook.";
      filters = describeCustomerFilters({ requireActive: true });
      query = "active customers";
      profileId = "active";
    } else if (metric === "revenue") {
      title = "Revenue-ranked customer proof";
      subtitle = "Full customer list sorted by lifetime revenue.";
      filters = ["sort:revenue_desc"];
      query = "customers sorted by revenue";
      profileId = "revenue";
    } else if (metric === "consumption") {
      predicate = (row) => toNumber(row.current_consumption) > 0;
      title = "Daily consumption proof";
      subtitle = "Customers with measurable current consumption in the workbook.";
      filters = describeCustomerFilters({ currentConsumptionPositive: true });
      query = "customers by consumption";
      sortMode = "consumption_desc";
      profileId = "default";
    } else if (metric === "wallet") {
      predicate = (row) => toInt(row.wallet_balance) > 0;
      title = "Positive wallet proof";
      subtitle = "Customers currently carrying wallet balance.";
      filters = describeCustomerFilters({ wallet: "positive" });
      query = "positive wallet customers";
      profileId = "wallet";
    } else if (metric === "trial") {
      predicate = (row) => matchesCustomerStatus(row, "trial");
      title = "Trial and new-customer proof";
      subtitle = "Customers in trial or new-customer states from the current workbook.";
      filters = describeCustomerFilters({ statusType: "trial" });
      query = "trial customers";
      profileId = "trial";
    }

    setStage({
      progress: 8,
      noteCursor: 0,
      detail: `Scanning ${totalRows.toLocaleString()} workbook rows now.`
    });
    for (let index = 0; index < rows.length; index += KPI_FILTER_CHUNK_SIZE) {
      const chunk = rows.slice(index, index + KPI_FILTER_CHUNK_SIZE);
      chunk.forEach((row) => {
        if (predicate(row)) matched.push(row);
      });
      const processed = Math.min(rows.length, index + chunk.length);
      const completion = processed / totalRows;
      setStage({
        progress: Math.min(84, Math.max(10, Math.round(completion * 84))),
        noteCursor: completion < 0.45 ? 0 : completion < 0.82 ? 1 : 2,
        detail: `${processed.toLocaleString()} of ${totalRows.toLocaleString()} rows checked. ${matched.length.toLocaleString()} currently match.`
      });
      await waitForUiPaint();
    }
    setStage({
      progress: 92,
      noteCursor: 2,
      detail: `${matched.length.toLocaleString()} rows matched. Ranking proof rows now.`
    });
    await waitForUiPaint();
    const sortedCustomers = sortCustomerRecords(matched, sortMode);
    setStage({
      progress: 99,
      noteCursor: 2,
      detail: `${sortedCustomers.length.toLocaleString()} rows ready. Finalizing report view.`
    });
    return {
      title,
      subtitle,
      customers: sortedCustomers,
      filters,
      source: `Dashboard | ${dataSource}`,
      query,
      openedFrom: "dashboard",
      sortMode,
      profileId
    };
  };
  const openKpiProof = (metric, meta = {}) => {
    const profileId = meta.profileId || (metric === "total"
      ? "dataset"
      : metric === "active"
        ? "active"
        : metric === "revenue"
          ? "revenue"
          : metric === "wallet"
            ? "wallet"
            : metric === "trial"
              ? "trial"
              : "default");
    if (shouldUseKpiProofLoader(metric, meta.anchorId)) {
      return runProofAction(
        {
          title: metric === "total" ? "All customers in current workbook" : metric === "revenue" ? "Revenue-ranked customer proof" : metric === "active" ? "Active customer proof" : metric === "wallet" ? "Positive wallet proof" : metric === "trial" ? "Trial and new-customer proof" : "Daily consumption proof",
          rowCount: customerRecords.length,
          mode: "filter",
          anchorId: meta.anchorId,
          profileId,
          showImmediately: true,
          minimumVisibleMs: 650
        },
        async ({ setStage }) => buildKpiProofPayload(metric, setStage)
      );
    }
    if (metric === "total") {
      openProofPanel({
        title: "All customers in current workbook",
        subtitle: `${customerRecords.length.toLocaleString()} grounded rows available for proof.`,
        customers: customerRecords,
        filters: ["dataset:all_customers"],
        source: `Dashboard | ${dataSource}`,
        query: "all customers",
        openedFrom: "dashboard"
      });
      return;
    }
    if (metric === "active") return openProofFromFilters({
      title: "Active customer proof",
      subtitle: "All active customer rows from the current workbook.",
      filters: { requireActive: true },
      source: `Dashboard | ${dataSource}`,
      query: "active customers",
      openedFrom: "dashboard"
    });
    if (metric === "revenue") {
      return openProofPanel({
        title: "Revenue-ranked customer proof",
        subtitle: "Full customer list sorted by lifetime revenue.",
        customers: customerRecords,
        filters: ["sort:revenue_desc"],
        source: `Dashboard | ${dataSource}`,
        query: "customers sorted by revenue",
        openedFrom: "dashboard",
        sortMode: "revenue_desc"
      });
    }
    if (metric === "consumption") return openProofFromFilters({
      title: "Daily consumption proof",
      subtitle: "Customers with measurable current consumption in the workbook.",
      filters: { currentConsumptionPositive: true },
      source: `Dashboard | ${dataSource}`,
      query: "customers by consumption",
      openedFrom: "dashboard",
      sortMode: "consumption_desc"
    });
    if (metric === "wallet") return openProofFromFilters({
      title: "Positive wallet proof",
      subtitle: "Customers currently carrying wallet balance.",
      filters: { wallet: "positive" },
      source: `Dashboard | ${dataSource}`,
      query: "positive wallet customers",
      openedFrom: "dashboard"
    });
    if (metric === "trial") return openProofFromFilters({
      title: "Trial and new-customer proof",
      subtitle: "Customers in trial or new-customer states from the current workbook.",
      filters: { statusType: "trial" },
      source: `Dashboard | ${dataSource}`,
      query: "trial customers",
      openedFrom: "dashboard"
    });
  };
  const openSingleCustomerProof = (customer, sourceLabel = "Dashboard", meta = {}) => {
    const row = normalizeCustomerRecord(customer);
    openProofPanel({
      title: `${row.name || "Customer"} proof row`,
      subtitle: `${row.area || "Unknown area"} | ${row.mobile || "No mobile"} | ${row.status || "Unknown status"}${toText(row.note) ? " | note captured" : ""}`,
      customers: [row],
      filters: [`customer:${row.name || row.mobile || "selected"}`],
      source: `${sourceLabel} | ${dataSource}`,
      query: row.name || row.mobile,
      openedFrom: sourceLabel.toLowerCase(),
      anchorId: meta.anchorId,
      profileId: meta.profileId || "customer"
    });
  };
  const openCalendarEventProof = (event, intelligence = null) => {
    const target = intelligence || calendarEventTargeting[event.id] || buildCalendarEventTargeting(event, customerRecords, topAreaNames);
    openProofPanel({
      title: `Calendar proof: ${event.name}`,
      subtitle: `${formatDateLongIso(event.date)} | ${event.confidence} | Segment: ${target.profileLabel}`,
      customers: target.customers,
      filters: target.filtersUsed,
      source: `Calendar OS | ${dataSource}`,
      query: `${event.name} target segment`,
      openedFrom: "calendar",
      sortMode: "revenue_desc"
    });
  };
  const proofColumns = useMemo(() => [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <button onClick={column.getToggleSortingHandler()} style={{background:"transparent",border:"none",padding:0,color:"inherit",cursor:"pointer",fontWeight:700}}>
          Name {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
        </button>
      ),
      cell: ({ row }) => <span style={{color:"#20476d",fontWeight:600}}>{toText(row.original.name)}</span>
    },
    {
      accessorKey: "mobile",
      header: "Mobile",
      cell: ({ row }) => <span style={{color:"#8b6914",fontFamily:"monospace"}}>{toText(row.original.mobile)}</span>
    },
    {
      accessorKey: "area",
      header: ({ column }) => (
        <button onClick={column.getToggleSortingHandler()} style={{background:"transparent",border:"none",padding:0,color:"inherit",cursor:"pointer",fontWeight:700}}>
          Area {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
        </button>
      ),
      cell: ({ row }) => <span style={{color:"#4f6f93"}}>{toText(row.original.area)}</span>
    },
    {
      accessorKey: "hub",
      header: "Hub",
      cell: ({ row }) => <span style={{color:"#4f6f93"}}>{toText(row.original.hub)}</span>
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <button onClick={column.getToggleSortingHandler()} style={{background:"transparent",border:"none",padding:0,color:"inherit",cursor:"pointer",fontWeight:700}}>
          Status {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
        </button>
      ),
      cell: ({ row }) => (
        <span style={{color:/suspend/i.test(toText(row.original.status)) ? "#a14b39" : /inactive/i.test(toText(row.original.status)) ? "#8b6914" : "#2f7a4a",fontWeight:600}}>
          {toText(row.original.status)}
        </span>
      )
    },
    {
      id: "revenue",
      accessorFn: (row) => toInt(row.revenue),
      header: ({ column }) => (
        <button onClick={column.getToggleSortingHandler()} style={{background:"transparent",border:"none",padding:0,color:"inherit",cursor:"pointer",fontWeight:700}}>
          Revenue {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
        </button>
      ),
      cell: ({ row }) => <span style={{color:"#2f7a4a",fontWeight:700}}>{inr(row.original.revenue)}</span>
    },
    {
      id: "wallet_balance",
      accessorFn: (row) => toInt(row.wallet_balance),
      header: ({ column }) => (
        <button onClick={column.getToggleSortingHandler()} style={{background:"transparent",border:"none",padding:0,color:"inherit",cursor:"pointer",fontWeight:700}}>
          Wallet {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
        </button>
      ),
      cell: ({ row }) => <span style={{color:toInt(row.original.wallet_balance) < 0 ? "#b24d38" : "#365a7f",fontWeight:600}}>{inr(row.original.wallet_balance)}</span>
    },
    {
      id: "orders",
      accessorFn: (row) => toInt(row.orders),
      header: ({ column }) => (
        <button onClick={column.getToggleSortingHandler()} style={{background:"transparent",border:"none",padding:0,color:"inherit",cursor:"pointer",fontWeight:700}}>
          Orders {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
        </button>
      ),
      cell: ({ row }) => <span style={{color:"#365a7f"}}>{toInt(row.original.orders).toLocaleString()}</span>
    },
    {
      id: "current_consumption",
      accessorFn: (row) => toNumber(row.current_consumption),
      header: ({ column }) => (
        <button onClick={column.getToggleSortingHandler()} style={{background:"transparent",border:"none",padding:0,color:"inherit",cursor:"pointer",fontWeight:700}}>
          Current Use {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
        </button>
      ),
      cell: ({ row }) => <span style={{color:"#365a7f"}}>{toNumber(row.original.current_consumption) ? `${toNumber(row.original.current_consumption).toFixed(1)} L` : "-"}</span>
    },
    {
      id: "last_delivery",
      accessorFn: (row) => toDateSortValue(row.last_delivery),
      sortingFn: (left, right, columnId) => toText(left.getValue(columnId)).localeCompare(toText(right.getValue(columnId))),
      header: ({ column }) => (
        <button onClick={column.getToggleSortingHandler()} style={{background:"transparent",border:"none",padding:0,color:"inherit",cursor:"pointer",fontWeight:700}}>
          Last Delivery {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
        </button>
      ),
      cell: ({ row }) => <span style={{color:"#587493",whiteSpace:"nowrap"}}>{toText(row.original.last_delivery) || "-"}</span>
    },
    {
      accessorKey: "source",
      header: "Source",
      cell: ({ row }) => <span style={{color:"#587493"}}>{toText(row.original.source) || "-"}</span>
    },
    {
      accessorKey: "note",
      header: "Sales Note",
      cell: ({ row }) => {
        const note = toText(row.original.note);
        return <span style={{color:note ? "#4f6881" : "#9fb3c8",lineHeight:1.5}} title={note || ""}>{note || "-"}</span>;
      }
    },
    {
      accessorKey: "why_it_matters",
      header: "Why It Matters",
      cell: ({ row }) => <span style={{color:"#365a7f"}}>{toText(row.original.why_it_matters) || "-"}</span>
    }
  ], []);
  const proofAreaOptions = useMemo(() => Array.from(new Set(asArray(proofPanel.customers).map((customer) => toText(customer.area)).filter(Boolean))).sort(), [proofPanel.customers]);
  const proofHubOptions = useMemo(() => Array.from(new Set(asArray(proofPanel.customers).map((customer) => toText(customer.hub)).filter(Boolean))).sort(), [proofPanel.customers]);
  const proofFilteredCustomers = useMemo(() => {
    return filterCustomerRecords(proofPanel.customers, {
      queryText: proofSearch,
      statusType: proofView.status !== "all" ? proofView.status : "",
      wallet: proofView.wallet !== "all" ? proofView.wallet : "",
      areas: proofView.area !== "all" ? [proofView.area] : [],
      hubs: proofView.hub !== "all" ? [proofView.hub] : []
    });
  }, [proofPanel.customers, proofPanel.sortMode, proofSearch, proofView]);
  useEffect(() => {
    setProofSorting(sortModeToTableSorting(proofView.sortMode || proofPanel.sortMode || "revenue_desc"));
  }, [proofView.sortMode, proofPanel.sortMode]);
  const handleProofSortingChange = (updater) => {
    setProofSorting((current) => {
      const next = resolveStateUpdater(updater, current);
      const nextMode = tableSortingToSortMode(next);
      setProofView((prev) => (prev.sortMode === nextMode ? prev : { ...prev, sortMode: nextMode }));
      setProofPage(1);
      return next;
    });
  };
  const proofTable = useReactTable({
    data: proofFilteredCustomers,
    columns: proofColumns,
    state: { sorting: proofSorting },
    onSortingChange: handleProofSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });
  const proofVisibleCustomers = useMemo(
    () => proofTable.getSortedRowModel().rows.map((row) => row.original),
    [proofFilteredCustomers, proofSorting, proofTable]
  );
  const proofVisibleStats = useMemo(() => buildProofStats(proofVisibleCustomers), [proofVisibleCustomers]);
  const proofInsight = useMemo(() => {
    if (!proofVisibleCustomers.length) return "No customers match the current proof filters.";
    const segments = [];
    if (proofView.status !== "all") segments.push(`${proofVisibleStats[proofView.status] || proofVisibleStats.count} ${proofView.status} customers`);
    if (proofView.wallet === "negative") segments.push(`${proofVisibleStats.negativeWallet.toLocaleString()} negative-wallet accounts`);
    if (proofView.area !== "all") segments.push(`area: ${proofView.area}`);
    if (proofView.hub !== "all") segments.push(`hub: ${proofView.hub}`);
    if (proofVisibleStats.notesCaptured) segments.push(`${proofVisibleStats.notesCaptured.toLocaleString()} agent notes captured`);
    const lead = segments.length ? segments.join(" | ") : `${proofVisibleStats.count.toLocaleString()} customers in this proof set`;
    return `${lead}. Visible revenue ${inr(proofVisibleStats.revenue)}. Use this view to decide who gets worked first.`;
  }, [proofVisibleCustomers.length, proofVisibleStats, proofView]);
  const activeProofPageSize = proofPageSize === "all" ? proofVisibleCustomers.length || PROOF_PAGE_SIZE : toInt(proofPageSize) || PROOF_PAGE_SIZE;
  const proofPageCount = useMemo(() => Math.max(1, Math.ceil(proofVisibleCustomers.length / Math.max(1, activeProofPageSize))), [proofVisibleCustomers.length, activeProofPageSize]);
  const proofPagedCustomers = useMemo(() => {
    const safePage = Math.min(proofPage, proofPageCount);
    const start = (safePage - 1) * Math.max(1, activeProofPageSize);
    return proofTable.getSortedRowModel().rows.slice(start, start + Math.max(1, activeProofPageSize));
  }, [proofTable, proofVisibleCustomers, proofPage, proofPageCount, activeProofPageSize]);
  const safeProofPage = Math.min(proofPage, proofPageCount);
  useEffect(() => {
    if (proofPage > proofPageCount) setProofPage(proofPageCount);
  }, [proofPage, proofPageCount]);

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
    const controlsSnapshot = { ...chatControls, primary_outcome: inferPrimaryOutcome(chatControls) };
    const selectedOutcome = getOutcomeMeta(controlsSnapshot.primary_outcome);
    const currentTodayIso = toISODateString(new Date());
    const { evaluateCustomerQueryRules, runGroundedCustomerQuery } = await import("./mrmilk-chat-runtime.js");
    const queryRules = await evaluateCustomerQueryRules({ query: resolvedQuery, outcomeId: selectedOutcome.id });
    if (queryRules.requiresClarification) {
      const clarifier = queryRules.clarificationMessage || buildClarifyingQuestion(role);
      setMsgs([...next, { role: "assistant", content: clarifier, isClarifier: true }]);
      setPendingClarification({ base_query: resolvedQuery, created_at: new Date().toISOString() });
      return;
    }
    const customerPreviewMode = selectedOutcome.id === "customer_list" || queryRules.customerQuery || isDeterministicCustomerQuery(resolvedQuery, selectedOutcome.id === "customer_list");
    setLoading(true);

    try {
      const personaPlaybook = PERSONA_PLAYBOOKS[controlsSnapshot.persona] || PERSONA_PLAYBOOKS.crm_specialist;
      if (customerPreviewMode) {
        const queryContext = buildCustomerQueryContext(appData, resolvedQuery, PROOF_TABLE_PREVIEW_ROWS, true, true);
        const groundedResult = await runGroundedCustomerQuery({
          records: getCustomerRecords(appData),
          fingerprint: buildCustomerDatasetFingerprint(appData),
          todayIso: currentTodayIso,
          filterSpec: queryContext.filterSpec,
          sortMode: queryContext.sortMode,
          previewLimit: PROOF_TABLE_PREVIEW_ROWS
        });
        const structured = buildCustomerPreviewResponse({
          data: appData,
          query: resolvedQuery,
          dataSource,
          todayIso: currentTodayIso,
          role,
          queryContext,
          groundedResult,
          disclosureIntent: queryRules.intent
        });
        const audit = await captureChatAudit({
          query: resolvedQuery,
          response_mode: structured?.data_snapshot?.response_mode,
          matched_customers: toInt(structured?.data_snapshot?.matched_customers),
          filters_applied: asArray(structured?.data_snapshot?.filters_applied),
          data_source: dataSource,
          data_timestamp: toText(appData?.data_date),
          disclosure_mode: toText(structured?.data_snapshot?.disclosure_mode),
          langfuse_target: toText(import.meta.env.VITE_LANGFUSE_PROXY_URL) ? "proxy" : "local"
        });
        structured.data_snapshot.audit_trace_id = audit.traceId;
        structured.data_snapshot.audit_status = audit.status;
        const deterministicPacket = {
          generated_at: structured.last_verified_at,
          today_iso: currentTodayIso,
          response_mode: structured?.data_snapshot?.response_mode,
          overview: {
            total_customers: getCustomerRecords(appData).length || toInt(appData?.overview?.total_customers)
          },
          customer_match_summary: {
            asked_for_list: Boolean(queryRules.explicitFullList),
            used_exact_filters: Boolean(asArray(structured?.data_snapshot?.filters_applied).length),
            total_matches: toInt(structured?.data_snapshot?.matched_customers),
            returned_count: asArray(structured?.customer_data_list).length,
            filters_applied: asArray(structured?.data_snapshot?.filters_applied)
          }
        };
        const markdown = structuredToMarkdown(structured);
        setMsgs([
          ...next,
          {
            role: "assistant",
            content: markdown,
            html: parseMsg(markdown),
            structured,
            searched: false,
            skill: "core",
            deterministic: true,
            qualityScore: 100,
            qualityIssues: [],
            context: {
              query: resolvedQuery,
              role,
              controls: controlsSnapshot,
              persona_key: controlsSnapshot.persona,
              analysis_packet: deterministicPacket,
              today_iso: currentTodayIso,
              routed_skill: "core",
              audit: audit
            }
          }
        ]);
        setChatNotice(structured.customer_data_list.length
          ? `Preview ready: ${structured.customer_data_list.length.toLocaleString()} matched customers found. Full details stay hidden until you click View Customer Details.`
          : "Preview ready: no matching customer rows were found in the active workbook.");
        setLoading(false);
        return;
      }
      const normalizedModel = normalizeProviderModel(provider, model);
      const analysisPacket = buildAnalysisEnginePacket(appData, controlsSnapshot, currentTodayIso, resolvedQuery, dataSource);
      const fullProofQueryContext = analysisPacket.customer_match_summary.used_exact_filters
        ? buildCustomerQueryContext(appData, resolvedQuery, 999999, false, true)
        : null;
      const routedSkill = routeSkillFromQuery(resolvedQuery);
      const instructions = buildStructuredSystemInstructions({
        role,
        controls: controlsSnapshot,
        personaPlaybook,
        todayIso: currentTodayIso,
        responseMode: analysisPacket.response_mode
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
        required_keys: REQUIRED_RESPONSE_KEYS
      }, null, 2);

      let firstAttempt = await requestModelText({
        provider,
        model: normalizedModel,
        apiKey,
        instructions,
        inputText: writerPayload,
        history: recentHistory
      });
      const responseMeta = {
        provider,
        model: normalizedModel,
        data: appData,
        dataSource,
        generatedAt: analysisPacket.generated_at,
        customerRows: analysisPacket.customer_evidence_pack,
        fullCustomerRows: fullProofQueryContext?.customers || [],
        fullCustomerFilters: fullProofQueryContext?.filtersApplied || [],
        useFullCustomerRows: Boolean(fullProofQueryContext?.usedExactFilters),
        usedSearch: firstAttempt.usedSearch,
        responseMode: analysisPacket.response_mode,
        query: resolvedQuery,
        controls: controlsSnapshot
      };
      let policyAudit = { repairs: [], blocked: false, violations: [] };
      let parsed = enrichStructuredResponse(parseJsonFromText(firstAttempt.text), responseMeta);
      policyAudit = enforceOfferPolicyOnStructuredResponse(parsed, {
        query: resolvedQuery,
        controls: controlsSnapshot
      });
      parsed = policyAudit.data;
      let validated = validateStructuredResponse(parsed);
      let quality = validated.ok ? scoreStructuredResponse(validated.data, analysisPacket) : { score: 0, issues: ["Schema invalid"] };
      let repaired = false;

      if (!validated.ok || quality.score < 72) {
        repaired = true;
        const repairInstructions = `${instructions}\nYou are in REPAIR MODE. Fix the previous output to exact schema, improve weak sections, and strictly obey the MrMilk offer policy.`;
        const repairPayload = JSON.stringify({
          task: "Repair the output to strict schema",
          original_query: resolvedQuery,
          schema_errors: validated.errors,
          quality_issues: quality.issues,
          previous_output: firstAttempt.text,
          analysis_packet: analysisPacket,
          required_keys: REQUIRED_RESPONSE_KEYS
        }, null, 2);
        const repairAttempt = await requestModelText({
          provider,
          model: normalizedModel,
          apiKey,
          instructions: repairInstructions,
          inputText: repairPayload,
          history: recentHistory
        });
        firstAttempt = repairAttempt;
        parsed = enrichStructuredResponse(parseJsonFromText(repairAttempt.text), {
          ...responseMeta,
          usedSearch: repairAttempt.usedSearch
        });
        policyAudit = enforceOfferPolicyOnStructuredResponse(parsed, {
          query: resolvedQuery,
          controls: controlsSnapshot
        });
        parsed = policyAudit.data;
        validated = validateStructuredResponse(parsed);
        quality = validated.ok ? scoreStructuredResponse(validated.data, analysisPacket) : { score: 0, issues: ["Repair schema invalid"] };
      }

      if (!validated.ok && policyAudit.blocked) {
        const safeStructured = enforceOfferPolicyOnStructuredResponse(buildOfferPolicyFallbackResponse({
          data: appData,
          query: resolvedQuery,
          dataSource,
          todayIso: currentTodayIso,
          role,
          controls: controlsSnapshot
        }), {
          query: resolvedQuery,
          controls: controlsSnapshot
        }).data;
        const audit = await captureChatAudit({
          query: resolvedQuery,
          response_mode: safeStructured?.data_snapshot?.response_mode,
          matched_customers: toInt(safeStructured?.data_snapshot?.matched_customers),
          filters_applied: asArray(safeStructured?.data_snapshot?.filters_applied),
          data_source: dataSource,
          data_timestamp: toText(appData?.data_date),
          guardrail_status: "blocked_replaced",
          langfuse_target: toText(import.meta.env.VITE_LANGFUSE_PROXY_URL) ? "proxy" : "local"
        });
        safeStructured.data_snapshot.audit_trace_id = audit.traceId;
        safeStructured.data_snapshot.audit_status = audit.status;
        const markdown = structuredToMarkdown(safeStructured);
        setMsgs([
          ...next,
          {
            role: "assistant",
            content: markdown,
            html: parseMsg(markdown),
            structured: safeStructured,
            searched: false,
            skill: routedSkill,
            qualityScore: 78,
            qualityIssues: ["Unsafe promotional wording was blocked and replaced."],
            context: {
              query: resolvedQuery,
              role,
              controls: controlsSnapshot,
              persona_key: controlsSnapshot.persona,
              analysis_packet: analysisPacket,
              today_iso: currentTodayIso,
              routed_skill: routedSkill,
              audit
            }
          }
        ]);
        setChatNotice("Brand-policy guardrail blocked promotional language and replaced it with a premium-safe plan.");
        setLoading(false);
        return;
      }

      if (!validated.ok) {
        throw new Error(`Structured response validation failed: ${validated.errors.join(" | ")}`);
      }

      const structured = validated.data;
      const audit = await captureChatAudit({
        query: resolvedQuery,
        response_mode: structured?.data_snapshot?.response_mode,
        matched_customers: toInt(fullProofQueryContext?.totalMatches || structured?.data_snapshot?.matched_customers),
        filters_applied: asArray(fullProofQueryContext?.filtersApplied || structured?.data_snapshot?.filters_applied),
        data_source: dataSource,
        data_timestamp: toText(appData?.data_date),
        guardrail_repairs: policyAudit.repairs.length,
        quality_score: quality.score,
        langfuse_target: toText(import.meta.env.VITE_LANGFUSE_PROXY_URL) ? "proxy" : "local"
      });
      structured.data_snapshot.audit_trace_id = audit.traceId;
      structured.data_snapshot.audit_status = audit.status;
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
            routed_skill: routedSkill,
            audit
          }
        }
      ]);
      const fullProofNotice = fullProofQueryContext?.usedExactFilters && fullProofQueryContext.totalMatches
        ? `Preview ready: ${fullProofQueryContext.totalMatches.toLocaleString()} workbook-matched customers are available if you click View Customer Details.`
        : "";
      if (policyAudit.repairs.length && repaired) {
        setChatNotice(fullProofNotice
          ? `${fullProofNotice} Brand-policy guardrail rewrote promotional language and the quality gate repaired the response. Final score: ${quality.score}/100.`
          : `Brand-policy guardrail rewrote promotional language and the quality gate repaired the response. Final score: ${quality.score}/100.`);
      } else if (policyAudit.repairs.length) {
        setChatNotice(fullProofNotice
          ? `${fullProofNotice} Brand-policy guardrail rewrote promotional language to stay premium and compliant.`
          : "Brand-policy guardrail rewrote promotional language to stay premium and compliant.");
      } else if (repaired) {
        setChatNotice(fullProofNotice
          ? `${fullProofNotice} Quality gate auto-repaired output. Final score: ${quality.score}/100.`
          : `Quality gate auto-repaired output. Final score: ${quality.score}/100.`);
      } else if (fullProofNotice) {
        setChatNotice(fullProofNotice);
      }
    } catch (e) {
      const rawMessage = toText(e?.message || "Unknown model error");
      const safeError = /api key|auth|unauthorized|permission/i.test(rawMessage)
        ? `Model authentication failed. Check the ${PROVIDER_META[provider]?.keyLabel || "model"} API key or switch to Customer Match preview.`
        : rawMessage;
      setMsgs([...next, { role: "assistant", content: safeError, error: true }]);
      setChatNotice(safeError);
    }
    setLoading(false);
  };

  const regenerateSection = async (messageIndex, sectionKey) => {
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
        todayIso: context.today_iso || toISODateString(new Date()),
        responseMode: context.analysis_packet?.response_mode
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
        const candidateStructured = {
          ...m.structured,
          [sectionKey]: sectionValidation.normalized
        };
        const updatedStructured = enforceOfferPolicyOnStructuredResponse(candidateStructured, {
          query: m?.context?.query,
          controls: asObject(m?.context?.controls)
        }).data;
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

  const focusChatComposer = (prefill = "") => {
    setTab("chat");
    setInp(prefill);
    window.requestAnimationFrame(() => {
      chatInputRef.current?.focus();
      if (prefill) chatInputRef.current?.setSelectionRange?.(prefill.length, prefill.length);
    });
  };
  const resizeChatComposer = (node) => {
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(Math.max(node.scrollHeight, 56), 144)}px`;
  };
  const handleChatComposerChange = (event) => {
    setInp(event.target.value);
    resizeChatComposer(event.target);
  };
  useEffect(() => {
    resizeChatComposer(chatInputRef.current);
  }, [inp, tab]);

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
        {[{id:"dash",label:"Dashboard"},{id:"imports",label:"Import Ops"},{id:"calendar",label:"Calendar OS"},{id:"studio",label:"Content Studio"},{id:"chat",label:`AI Chat${msgs.length?" ("+msgs.filter(m=>m.role==="assistant").length+")":""}`}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{background:"transparent",border:"none",borderBottom:`3px solid ${tab===t.id?rc:"transparent"}`,color:tab===t.id?rc:"#4d5b78",padding:"11px 18px",cursor:"pointer",fontSize:13,fontFamily:"'Montserrat', sans-serif",fontWeight:700}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* DASHBOARD TAB */}
      {tab==="dash" && (
        <div style={{flex:1,overflowY:"auto",padding:"20px 22px 24px",position:"relative",zIndex:1}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:14,flexWrap:"wrap"}}>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{background:"#ffffff",border:"1px solid #d7e3f0",borderRadius:999,padding:"7px 12px",fontSize:12,color:"#5f7898",boxShadow:"0 8px 18px rgba(7,64,105,0.04)"}}>Data Date: <strong style={{color:"#1f3550",fontWeight:700}}>{appData.data_date || "Unknown"}</strong></span>
              <span style={{background:"#f4f9ff",border:"1px solid #d7e3f0",borderRadius:999,padding:"7px 12px",fontSize:12,color:"#5e7ea1"}}>{dataSource}</span>
              <span style={{background:"#edf5ff",border:"1px solid #c7d9ea",borderRadius:999,padding:"7px 12px",fontSize:12,color:"#4f6f93"}}>
                {hasFullWorkbookRows
                  ? `${toInt(asArray(appData.customer_records).length).toLocaleString()} grounded customer rows live`
                  : `${customerRecords.length.toLocaleString()} cached proof rows loaded | full workbook rows pending`}
              </span>
              {dataLoading && <span style={{fontSize:12,color:"#4499ff",fontWeight:700}}>Loading workbook...</span>}
              {dataError && <span style={{fontSize:12,color:"#ff6666",fontWeight:700}}>{dataError}</span>}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setTab("imports")} style={{background:"#ffffff",border:"1px solid #c7d9ea",borderRadius:12,color:"#2f4f70",padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"'Montserrat', sans-serif",boxShadow:"0 8px 18px rgba(7,64,105,0.04)"}}>
                Open Import Ops
              </button>
            </div>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14,flexWrap:"wrap",background:"linear-gradient(145deg, #f8fbff, #f0f7ff)",border:"1px solid #cfe0f1",padding:"12px 14px",borderRadius:16,boxShadow:"0 10px 26px rgba(7,64,105,0.05)"}}>
            <span style={{fontSize:13,color:"#074069",fontWeight:800}}>Live dataset policy:</span>
            <span style={{fontSize:12,color:"#284a6b"}}>Only one parsed customer dataset stays active at a time.</span>
            <span style={{fontSize:12,color:"#4f6f93"}}>Use Import Ops to validate the next MilkMaster workbook, review warnings, and queue the replacement in the background.</span>
            <span style={{fontSize:12,color:"#6a84a4"}}>This dashboard still reflects the workspace-loaded dataset until backend snapshot hydration is wired into the analytics layer.</span>
          </div>
          {/* KPIs */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12,marginBottom:16}}>
            {[
              {id:"total",l:"Total Customers",v:toInt(D.total_customers).toLocaleString(),c:"#d2ab67",s:dataSource},
              {id:"active",l:"Active",v:`${toInt(D.active_customers).toLocaleString()} (${D.total_customers ? ((D.active_customers/D.total_customers)*100).toFixed(1) : "0.0"}%)`,c:"#ff4444",s:`${inactivePct}% inactive`},
              {id:"revenue",l:"Lifetime Revenue",v:inr(toInt(D.total_revenue)),c:"#44cc88",s:`${toInt(D.total_orders).toLocaleString()} orders`},
              {id:"consumption",l:"Daily Milk",v:`${toInt(appData.consumption?.total_daily_liters).toLocaleString()} L`,c:"#4499ff",s:`Avg ${toNumber(appData.consumption?.avg_daily_liters).toFixed(2)}L/customer`},
              {id:"wallet",l:"Wallet Float",v:inr(toInt(D.total_wallet_balance)),c:"#ffaa44",s:`${toInt(appData.wallet_stats?.customers_with_positive_wallet).toLocaleString()} topped up`},
              {id:"trial",l:"Trial Not Conv.",v:trialLoss ? `${((trialNotConverted/trialLoss)*100).toFixed(1)}%` : "N/A",c:"#cc44ff",s:`${toInt(trialEnded).toLocaleString()} trials ended`},
            ].map(({id,l,v,c,s})=>(
              <button key={l} onClick={() => openKpiProof(id, { anchorId: id === "total" ? "kpi-total" : "" })} style={{background:"linear-gradient(160deg, #ffffff, #f8fbff)",border:"1px solid #d7e3f0",borderRadius:16,padding:"16px 14px 15px",textAlign:"left",cursor:"pointer",position:"relative",overflow:"hidden",isolation:"isolate",boxShadow:"0 14px 28px rgba(7,64,105,0.06)"}}>
                <div style={{color:c,fontSize:17,fontWeight:800,marginBottom:4,lineHeight:1.1}}>{v}</div>
                <div style={{color:"#1f3550",fontSize:13,fontWeight:700,marginBottom:3}}>{l}</div>
                <div style={{color:"#425b77",fontSize:12,marginBottom:8,lineHeight:1.45}}>{s}</div>
                <div style={{color:"#6f86aa",fontSize:10,textTransform:"uppercase",letterSpacing:0.7,fontWeight:700}}>Click for proof rows</div>
                {id === "total" && renderProofCardLoader("kpi-total")}
              </button>
            ))}
          </div>

          {/* Alerts */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:12,marginBottom:16}}>
            <div style={{background:"linear-gradient(160deg, rgba(255,50,50,0.06), rgba(255,255,255,0.96))",border:"1px solid rgba(255,50,50,0.18)",borderRadius:16,padding:"14px 16px",boxShadow:"0 14px 28px rgba(161,75,57,0.07)"}}>
              <div style={{color:"#ff5544",fontSize:14,fontWeight:800,marginBottom:8}}>Urgent: Call today - #1 customer suspended</div>
              {topSuspended ? (
                <div style={{color:"#557394",fontSize:13,lineHeight:1.75}}>
                  <strong style={{color:"#1f3550"}}>{topSuspended.Name}</strong> | {topSuspended.Area}<br/>
                  {inr(topSuspended["Total Revenue"])} lifetime | {toInt(topSuspended["Total Orders"]).toLocaleString()} orders<br/>
                  Wallet: <strong style={{color:"#ff5544"}}>{inr(topSuspended["Wallet Balance"])}</strong><br/>
                  Call <strong style={{color:"#d2ab67"}}>{topSuspended.Mobile || "N/A"}</strong>
                </div>
              ) : (
                <div style={{color:"#777",fontSize:13}}>No suspended customer found in current dataset.</div>
              )}
            </div>
            <div style={{background:"linear-gradient(160deg, rgba(255,150,0,0.06), rgba(255,255,255,0.96))",border:"1px solid rgba(255,150,0,0.18)",borderRadius:16,padding:"14px 16px",boxShadow:"0 14px 28px rgba(139,104,20,0.06)"}}>
              <div style={{color:"#ff9944",fontSize:14,fontWeight:800,marginBottom:8}}>Competitive threats now active</div>
              <div style={{color:"#557394",fontSize:13,lineHeight:1.75}}><strong style={{color:"#1f3550"}}>Country Delight</strong> - Kharadi, Hinjewadi, Wakad<br/><strong style={{color:"#1f3550"}}>Akshayakalpa</strong> - Aundh, Koregaon Park<br/><strong style={{color:"#1f3550"}}>Katraj Dairy</strong> - Kothrud, Deccan<br/><strong style={{color:"#1f3550"}}>Amul Home</strong> - targeting low-wallet segment</div>
            </div>
            <div style={{background:"linear-gradient(160deg, rgba(100,100,255,0.06), rgba(255,255,255,0.96))",border:"1px solid rgba(100,100,255,0.18)",borderRadius:16,padding:"14px 16px",boxShadow:"0 14px 28px rgba(76,94,164,0.06)"}}>
              <div style={{color:"#5f7f9f",fontSize:14,fontWeight:800,marginBottom:8}}>High-value inactive priority list</div>
              <div style={{color:"#557394",fontSize:13,lineHeight:1.75}}>
                {inactiveHighlights.length ? inactiveHighlights.map((c, i) => (
                  <div key={i}>{c.Name} - {inr(c["Total Revenue"])} - {c.Area}</div>
                )) : "No inactive list available in current dataset"}
              </div>
            </div>
          </div>

          {/* Production charts */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(360px,1fr))",gap:12,marginBottom:14}}>
            <div style={{background:"#ffffff",border:"1px solid #d7e3f0",borderRadius:16,padding:"18px",boxShadow:"0 16px 34px rgba(7,64,105,0.05)"}}>
              <div style={{color:"#d2ab67",fontSize:15,fontWeight:800,marginBottom:8}}>Area revenue treemap</div>
              <div style={{color:"#6f86aa",fontSize:12,marginBottom:10,lineHeight:1.55}}>See which Pune areas are carrying the business and where negative-wallet risk is building.</div>
              <ReactEChartsCore echarts={echarts} option={areaTreemapOption} style={{height:280}} notMerge lazyUpdate onEvents={{ click: (params) => params?.data?.fullArea && openAreaProof(params.data.fullArea) }} />
              <div style={{color:"#6f86aa",fontSize:11,marginTop:8,lineHeight:1.5}}>Click any area block to open exact proof customers from that area.</div>
            </div>
            <div style={{background:"#ffffff",border:"1px solid #d7e3f0",borderRadius:16,padding:"18px",boxShadow:"0 16px 34px rgba(7,64,105,0.05)"}}>
              <div style={{color:"#d2ab67",fontSize:15,fontWeight:800,marginBottom:8}}>Area health matrix</div>
              <div style={{color:"#6f86aa",fontSize:12,marginBottom:10,lineHeight:1.55}}>Each point shows area size, value, negative-wallet pressure, and at-risk share from the active workbook.</div>
              <ReactEChartsCore echarts={echarts} option={areaHealthMatrixOption} style={{height:280}} notMerge lazyUpdate onEvents={{ click: (params) => params?.name && openAreaProof(params.name) }} />
              <div style={{color:"#6f86aa",fontSize:11,marginTop:8,lineHeight:1.5}}>
                {hasFullWorkbookRows ? "Larger bubbles mean more wallet risk. Redder bubbles mean more inactive or suspended share." : "Upload the full workbook to make the area risk metrics fully representative."}
              </div>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12,marginBottom:14}}>
            <div style={{background:"#ffffff",border:"1px solid #d7e3f0",borderRadius:16,padding:"18px",boxShadow:"0 16px 34px rgba(7,64,105,0.05)"}}>
              <div style={{color:"#d2ab67",fontSize:15,fontWeight:800,marginBottom:8}}>Customer status mix</div>
              <ReactEChartsCore echarts={echarts} option={statusMixOption} style={{height:250}} notMerge lazyUpdate onEvents={{ click: (params) => params?.name && openStatusProof(params.name) }} />
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:6}}>
                {statusData.map((status) => (
                  <span key={status.name} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#587493"}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:status.c,display:"block"}} />
                    {status.name}
                  </span>
                ))}
              </div>
            </div>
            <div style={{background:"#ffffff",border:"1px solid #d7e3f0",borderRadius:16,padding:"18px",boxShadow:"0 16px 34px rgba(7,64,105,0.05)"}}>
              <div style={{color:"#d2ab67",fontSize:15,fontWeight:800,marginBottom:8}}>Wallet pressure</div>
              <ReactEChartsCore echarts={echarts} option={walletHealthOption} style={{height:250}} notMerge lazyUpdate onEvents={{ click: (params) => params?.name && openWalletProof(params.name) }} />
              <div style={{color:"#6f86aa",fontSize:11,marginTop:8,lineHeight:1.5}}>Click Positive, Zero, or Negative to inspect the exact customer rows behind that wallet bucket.</div>
            </div>
            <div style={{background:"#ffffff",border:"1px solid #d7e3f0",borderRadius:16,padding:"18px",boxShadow:"0 16px 34px rgba(7,64,105,0.05)"}}>
              <div style={{color:"#d2ab67",fontSize:15,fontWeight:800,marginBottom:8}}>Hub performance</div>
              <ReactEChartsCore echarts={echarts} option={hubPerformanceOption} style={{height:250}} notMerge lazyUpdate onEvents={{ click: (params) => hubData[params?.dataIndex]?.full && openHubProof(hubData[params.dataIndex].full) }} />
              <div style={{color:"#6f86aa",fontSize:11,marginTop:8,lineHeight:1.5}}>Revenue is shown as bars, customer base as the line. Click a hub to open its proof list.</div>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"minmax(320px,1fr)",gap:12,marginBottom:14}}>
            <div style={{background:"#ffffff",border:"1px solid #d7e3f0",borderRadius:16,padding:"18px",boxShadow:"0 16px 34px rgba(7,64,105,0.05)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:8}}>
                <div>
                  <div style={{color:"#d2ab67",fontSize:15,fontWeight:800}}>Acquisition source mix</div>
                  <div style={{color:"#6f86aa",fontSize:12,marginTop:4,lineHeight:1.55}}>This shows where customer volume is actually coming from in the active workbook.</div>
                </div>
                <div style={{fontSize:12,color:"#6f86aa"}}>Source of truth: {dataSource}</div>
              </div>
              <ReactEChartsCore echarts={echarts} option={sourceMixOption} style={{height:250}} notMerge lazyUpdate onEvents={{ click: (params) => srcData[params?.dataIndex]?.full && openSourceProof(srcData[params.dataIndex].full) }} />
              <div style={{color:"#6f86aa",fontSize:11,marginTop:8,lineHeight:1.5}}>Click any source bar to open the exact customer proof rows behind it.</div>
            </div>
          </div>

          {/* Top customers table */}
          <div style={{background:"#ffffff",border:"1px solid #d7e3f0",borderRadius:16,padding:"18px",boxShadow:"0 16px 34px rgba(7,64,105,0.05)"}}>
            <div style={{color:"#d2ab67",fontSize:15,fontWeight:800,marginBottom:12}}>Top 10 customers by lifetime revenue</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead><tr>{["Name","Mobile","Area","Revenue","Orders","Status","Wallet"].map(h=><th key={h} style={{background:"#074069",color:"#ffffff",padding:"10px 12px",textAlign:"left",border:"1px solid #c7d9ea",fontSize:12,fontWeight:700}}>{h}</th>)}</tr></thead>
                <tbody>{(appData.top_20_customers || []).slice(0, 10).map((c,i)=>(
                  <tr key={i} onClick={() => openSingleCustomerProof(c)} style={{cursor:"pointer"}}>
                    <td style={{background:"#ffffff",color:"#20476d",padding:"10px 12px",border:"1px solid #d7e3f0"}}>{c.Name}</td>
                    <td style={{background:"#ffffff",color:"#d2ab67",padding:"10px 12px",border:"1px solid #d7e3f0",fontFamily:"monospace",fontSize:12}}>{c.Mobile}</td>
                    <td style={{background:"#ffffff",color:"#5f7f9f",padding:"10px 12px",border:"1px solid #d7e3f0"}}>{c.Area}</td>
                    <td style={{background:"#ffffff",color:"#44cc88",padding:"10px 12px",border:"1px solid #d7e3f0",fontWeight:"bold"}}>{inr(c["Total Revenue"])}</td>
                    <td style={{background:"#ffffff",color:"#5f7f9f",padding:"10px 12px",border:"1px solid #d7e3f0",textAlign:"center"}}>{c["Total Orders"]}</td>
                    <td style={{background:"#ffffff",padding:"10px 12px",border:"1px solid #d7e3f0"}}><span style={{color:c["Sub. Status"].includes("Active")?"#44cc88":c["Sub. Status"].includes("Suspend")?"#ff5544":"#ff9944",fontSize:12,fontWeight:700}}>{c["Sub. Status"]}</span></td>
                    <td style={{background:"#ffffff",color:toNumber(c["Wallet Balance"])<0?"#ff5544":"#5f7f9f",padding:"10px 12px",border:"1px solid #d7e3f0"}}>{inr(toInt(c["Wallet Balance"]))}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* IMPORTS TAB */}
      {tab==="imports" && (
        <div style={{flex:1,overflowY:"auto",padding:"20px 22px 24px",position:"relative",zIndex:1}}>
          <ImportCenter role={role} roleMeta={ROLES[role]} onBackToDashboard={() => setTab("dash")} />
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
              <input value={calendarQuery} onChange={(e) => setCalendarQuery(e.target.value)} placeholder="Search event, area, or value path..." style={{background:"#f8fbff",border:"1px solid #c4daee",borderRadius:8,color:"#23486b",padding:"7px 9px",fontSize:11}} />
              <label style={{display:"flex",alignItems:"center",gap:6,color:"#5f7f9f",fontSize:11,background:"#f8fbff",border:"1px solid #c4daee",borderRadius:8,padding:"7px 9px"}}>
                <input type="checkbox" checked={calendarHideTentative} onChange={(e) => setCalendarHideTentative(e.target.checked)} />
                Hide tentative dates
              </label>
              <button onClick={() => { setCalendarTypeFilter("all"); setCalendarAreaFilter("all"); setCalendarConfidenceFilter("all"); setCalendarHideTentative(false); setCalendarQuery(""); }} style={{background:"#074069",border:"1px solid #356d9f",borderRadius:8,color:"#eaf3ff",padding:"7px 9px",fontSize:11,cursor:"pointer"}}>
                Reset filters
              </button>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(340px,1fr))",gap:14,alignItems:"start"}}>
            <div style={{display:"grid",gap:12}}>
              <div style={{background:"linear-gradient(155deg, rgba(255,255,255,0.98), rgba(244,249,255,0.95))",border:"1px solid #cfe0f1",borderRadius:16,padding:"14px 14px 16px",boxShadow:"0 16px 34px rgba(7,64,105,0.05)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:10}}>
                  <button onClick={() => shiftCalendarMonth(-1)} style={{background:"#edf5ff",border:"1px solid #a7c1db",borderRadius:10,color:"#365a7f",padding:"7px 10px",fontSize:11,cursor:"pointer",fontWeight:700}}>Prev</button>
                  <div style={{color:"#d2ab67",fontFamily:"'Montserrat', sans-serif",fontSize:26,lineHeight:1,fontWeight:800}}>{formatMonthYear(calendarView.year, calendarView.month)}</div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={jumpCalendarToToday} style={{background:"#edf5ff",border:"1px solid #a7c1db",borderRadius:10,color:"#365a7f",padding:"7px 10px",fontSize:11,cursor:"pointer",fontWeight:700}}>Today</button>
                    <button onClick={() => shiftCalendarMonth(1)} style={{background:"#edf5ff",border:"1px solid #a7c1db",borderRadius:10,color:"#365a7f",padding:"7px 10px",fontSize:11,cursor:"pointer",fontWeight:700}}>Next</button>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6,marginBottom:6}}>
                  {weekdayLabels.map((label) => (
                    <div key={label} style={{color:"#6f86aa",fontSize:10.5,textAlign:"center",textTransform:"uppercase",fontWeight:700,letterSpacing:0.6}}>{label}</div>
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
                        onClick={() => {
                          if (!cell.inMonth) return;
                          setSelectedDateIso(cell.iso);
                          if (dayEvents[0]?.id) setSelectedCalendarEventId(dayEvents[0].id);
                        }}
                        disabled={!cell.inMonth}
                        style={{minHeight:94,background:bg,border:`1px solid ${border}`,borderRadius:12,padding:"7px 6px",cursor:cell.inMonth ? "pointer" : "default",textAlign:"left",overflow:"hidden",boxShadow:cell.isSelected ? "0 10px 22px rgba(210,171,103,0.14)" : "none"}}
                      >
                        <div style={{fontSize:10.5,color:cell.inMonth ? "#1f3550" : "#8ca1bc",fontWeight:cell.isToday ? 800 : 600}}>{cell.day}</div>
                        <div style={{display:"flex",gap:3,flexWrap:"wrap",marginTop:4}}>
                          {dayEvents.slice(0, 3).map((evt) => <span key={`${cell.iso}-${evt.id}`} style={{width:6,height:6,borderRadius:"50%",background:typePalette[evt.type] || "#9fb5d8",display:"inline-block"}} />)}
                        </div>
                        <div style={{marginTop:4,display:"grid",gap:2}}>
                          {dayEvents.slice(0, 2).map((evt) => (
                            <div key={`${cell.iso}-name-${evt.id}`} style={{fontSize:9.5,color:cell.inMonth ? "#3f5f80" : "#8ca1bc",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
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

              <div style={{background:"linear-gradient(160deg, rgba(255,255,255,0.98), rgba(244,249,255,0.96))",border:"1px solid #cfe0f1",borderRadius:16,padding:"15px",boxShadow:"0 18px 38px rgba(7,64,105,0.06)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,gap:8,flexWrap:"wrap"}}>
                  <div>
                    <div style={{color:"#d2ab67",fontSize:13.5,fontWeight:800}}>Event Command Center</div>
                    <div style={{color:"#5f7f9f",fontSize:11.5,marginTop:4}}>{formatDateLongIso(selectedDateIso)}</div>
                  </div>
                  {selectedCalendarEvent && (
                    <span style={{background:"#edf5ff",border:"1px solid #c7d9ea",borderRadius:999,padding:"4px 9px",fontSize:10.5,color:"#365a7f",fontWeight:700}}>
                      {daysBetween(todayIso, selectedCalendarEvent.date) >= 0 ? `D-${daysBetween(todayIso, selectedCalendarEvent.date)}` : "Past"}
                    </span>
                  )}
                </div>
                {selectedCalendarEvent && selectedCalendarEventIntelligence ? (
                  <div style={{display:"grid",gap:10}}>
                    {selectedDateEvents.length > 1 && (
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        {selectedDateEvents.map((event) => (
                          <button
                            key={`selected-${event.id}`}
                            onClick={() => setSelectedCalendarEventId(event.id)}
                            style={{background:event.id === selectedCalendarEvent.id ? "#074069" : "#ffffff",border:`1px solid ${event.id === selectedCalendarEvent.id ? "#074069" : "#c7d9ea"}`,borderRadius:999,color:event.id === selectedCalendarEvent.id ? "#ffffff" : "#365a7f",padding:"4px 9px",fontSize:10,cursor:"pointer"}}
                          >
                            {event.name}
                          </button>
                        ))}
                      </div>
                    )}

                    <div style={{background:"#ffffff",border:"1px solid #d7e3f0",borderRadius:14,padding:"12px 12px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,flexWrap:"wrap"}}>
                        <div>
                          <div style={{color:"#1f3550",fontSize:16,fontWeight:800}}>{selectedCalendarEvent.name}</div>
                          <div style={{color:"#5f7f9f",fontSize:11.5,marginTop:4}}>{selectedCalendarEvent.objective}</div>
                        </div>
                        <span style={{fontSize:10,padding:"3px 8px",borderRadius:999,border:`1px solid ${(confidenceStyles[selectedCalendarEvent.confidence] || confidenceStyles.system).border}`,background:(confidenceStyles[selectedCalendarEvent.confidence] || confidenceStyles.system).bg,color:(confidenceStyles[selectedCalendarEvent.confidence] || confidenceStyles.system).text,fontWeight:700}}>{selectedCalendarEvent.confidence}</span>
                      </div>
                      <div style={{color:"#4d6d8f",fontSize:11.5,marginTop:8,lineHeight:1.6}}>Dairy angle: {selectedCalendarEvent.campaign_theme}</div>
                      <div style={{color:"#4d6d8f",fontSize:11.5,marginTop:4,lineHeight:1.6}}>Target scope: {selectedCalendarEventIntelligence.scopeSummary}</div>
                      <div style={{color:"#d2ab67",fontSize:11.5,marginTop:4,lineHeight:1.6}}>Value path: {selectedCalendarEvent.offer}</div>
                    </div>

                    <div style={{background:"#ffffff",border:"1px solid #d7e3f0",borderRadius:14,padding:"12px 12px"}}>
                      <div style={{color:"#d2ab67",fontSize:12,fontWeight:800,marginBottom:8}}>Recommended Segment</div>
                      <div style={{color:"#1f3550",fontSize:14,fontWeight:700}}>{selectedCalendarEventIntelligence.profileLabel}</div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8,marginTop:9}}>
                        <div style={{background:"#f8fbff",border:"1px solid #d7e3f0",borderRadius:12,padding:"8px 9px"}}>
                          <div style={{color:"#6f86aa",fontSize:10}}>Customers</div>
                          <div style={{color:"#17395c",fontSize:17,fontWeight:800,marginTop:3}}>{selectedCalendarEventIntelligence.stats.count.toLocaleString()}</div>
                        </div>
                        <div style={{background:"#f8fbff",border:"1px solid #d7e3f0",borderRadius:12,padding:"8px 9px"}}>
                          <div style={{color:"#6f86aa",fontSize:10}}>Revenue</div>
                          <div style={{color:"#2f7a4a",fontSize:17,fontWeight:800,marginTop:3}}>{inr(selectedCalendarEventIntelligence.stats.revenue)}</div>
                        </div>
                      </div>
                      <div style={{color:"#4d6d8f",fontSize:11.5,marginTop:8,lineHeight:1.6}}>{selectedCalendarEventIntelligence.reason}</div>
                      <div style={{color:"#6d4f18",fontSize:10.5,marginTop:6,lineHeight:1.6}}>Filters: {selectedCalendarEventIntelligence.filtersUsed.join(" | ")}</div>
                      <div style={{display:"flex",gap:6,marginTop:9,flexWrap:"wrap"}}>
                        <button onClick={() => openCalendarEventProof(selectedCalendarEvent, selectedCalendarEventIntelligence)} style={{background:"#074069",border:"1px solid #356d9f",borderRadius:9,color:"#eaf3ff",padding:"6px 10px",fontSize:10.5,fontWeight:700,cursor:"pointer"}}>Open customer list</button>
                        <button onClick={() => exportProofCsv(selectedCalendarEventIntelligence.customers, `${selectedCalendarEvent.name}-target-customers`)} style={{background:"#ffffff",border:"1px solid #c4daee",borderRadius:9,color:"#365a7f",padding:"6px 10px",fontSize:10.5,cursor:"pointer"}}>Export CSV</button>
                        <button onClick={() => focusChatComposer(`Build a premium-safe campaign plan for ${selectedCalendarEvent.name} on ${selectedCalendarEvent.date} for ${selectedCalendarEventIntelligence.profileLabel} in ${selectedCalendarEventIntelligence.scopeSummary}.`)} style={{background:"#ffffff",border:"1px solid #c4daee",borderRadius:9,color:"#365a7f",padding:"6px 10px",fontSize:10.5,cursor:"pointer"}}>Prepare prompt</button>
                      </div>
                    </div>

                    <div style={{background:"#ffffff",border:"1px solid #d7e3f0",borderRadius:14,padding:"12px 12px"}}>
                      <div style={{color:"#d2ab67",fontSize:12,fontWeight:800,marginBottom:8}}>3-Step Campaign Arc</div>
                      <div style={{display:"grid",gap:7}}>
                        {selectedCalendarEventArc.map((step) => (
                          <div key={`${selectedCalendarEvent.id}-${step.key}`} style={{background:"#f8fbff",border:"1px solid #d7e3f0",borderRadius:12,padding:"9px 10px"}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                              <div style={{color:"#1f3550",fontSize:12,fontWeight:800}}>{step.label}</div>
                              <span style={{background:"#fff8ec",border:"1px solid #ead4ab",borderRadius:999,padding:"3px 8px",fontSize:10,color:"#6d4f18"}}>{formatDateShort(step.date)}</span>
                            </div>
                            <div style={{color:"#587493",fontSize:10.5,marginTop:4,fontWeight:700}}>{step.channel}</div>
                            <div style={{color:"#4d6d8f",fontSize:11,marginTop:4,lineHeight:1.6}}>{step.copy}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : <div style={{color:"#5f7f9f",fontSize:11.5}}>No event for this date with current filters.</div>}
              </div>
            </div>

            <div style={{background:"#ffffff",border:"1px solid #cfe0f1",borderRadius:16,padding:"14px 14px",boxShadow:"0 16px 34px rgba(7,64,105,0.05)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{color:"#d2ab67",fontSize:13.5,fontWeight:800,letterSpacing:0.3}}>Month Timeline</div>
                <div style={{color:"#6f86aa",fontSize:11}}>In {formatMonthYear(calendarView.year, calendarView.month)}: {selectedMonthEvents.length} events</div>
              </div>
              <div style={{display:"grid",gap:8}}>
                {calendarCampaignCards.slice(0, 14).map((event) => {
                  const proofStats = calendarEventProofStats[event.id] || buildProofStats([]);
                  const selected = selectedCalendarEvent?.id === event.id;
                  return (
                  <button key={event.id} onClick={() => { setSelectedDateIso(event.date); setSelectedCalendarEventId(event.id); }} style={{display:"grid",gridTemplateColumns:"95px 1fr",gap:10,background:selected ? "linear-gradient(160deg, rgba(7,64,105,0.08), rgba(255,255,255,0.98))" : "#f8fbff",border:`1px solid ${selected ? "#8fb1d3" : "#d0e0f1"}`,borderRadius:12,padding:"10px 11px",cursor:"pointer",textAlign:"left",boxShadow:selected ? "0 12px 26px rgba(7,64,105,0.10)" : "none"}}>
                    <div>
                      <div style={{color:"#8b6914",fontSize:12.5,fontWeight:800}}>{formatDateShort(event.date)}</div>
                      <div style={{color:typePalette[event.type] || "#6e8ab2",fontSize:10,textTransform:"uppercase",marginTop:3,fontWeight:700}}>{event.type}</div>
                    </div>
                    <div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                        <div style={{color:"#1f3550",fontSize:12.5,fontWeight:800}}>{event.name}</div>
                        <span style={{color:"#5f7f9f",fontSize:10.5,fontWeight:700}}>{daysBetween(todayIso, event.date) >= 0 ? `D-${daysBetween(todayIso, event.date)}` : "Past"}</span>
                      </div>
                      <div style={{color:"#4d6d8f",fontSize:11.5,marginTop:3,lineHeight:1.55}}>{event.focus}</div>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:6}}>
                        <span style={{color:"#365a7f",fontSize:10.5}}>{proofStats.count.toLocaleString()} matches</span>
                        <span style={{color:"#2f7a4a",fontSize:10.5}}>{inr(proofStats.revenue)} linked revenue</span>
                      </div>
                      <div style={{color:"#6d4f18",fontSize:10.5,marginTop:5}}>Segment: {event.targetLabel}</div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginTop:5,flexWrap:"wrap"}}>
                        <span style={{fontSize:10,color:"#5f7f9f"}}>{event.source_label}</span>
                        <span style={{fontSize:10,color:"#5f7f9f"}}>{event.priority || "medium"} priority</span>
                      </div>
                    </div>
                  </button>
                );})}
              </div>
            </div>

            <div style={{display:"grid",gap:12}}>
              <div style={{background:"#ffffff",border:"1px solid #cfe0f1",borderRadius:16,padding:"14px",boxShadow:"0 16px 34px rgba(7,64,105,0.05)"}}>
                <div style={{color:"#d2ab67",fontSize:13.5,fontWeight:800,marginBottom:8}}>This Month Playbook</div>
                {selectedMonthPlaybookEvents.length ? (
                  <div style={{display:"grid",gap:7}}>
                    {selectedMonthPlaybookEvents.slice(0, 8).map((event) => {
                      const intelligence = calendarEventTargeting[event.id] || buildCalendarEventTargeting(event, customerRecords, topAreaNames);
                      return (
                        <button key={event.id} onClick={() => { setSelectedDateIso(event.date); setSelectedCalendarEventId(event.id); }} style={{background:"#f8fbff",border:"1px solid #d0e0f1",borderRadius:12,padding:"10px 11px",cursor:"pointer",textAlign:"left"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                            <div style={{color:"#1f3550",fontSize:12,fontWeight:800}}>{event.name} ({formatDateShort(event.date)})</div>
                            <span style={{color:"#365a7f",fontSize:10.5}}>{intelligence.stats.count.toLocaleString()} matches</span>
                          </div>
                          <div style={{color:"#4d6d8f",fontSize:11,marginTop:4,lineHeight:1.55}}>Action: {event.focus}</div>
                          <div style={{color:"#d2ab67",fontSize:10.5,marginTop:4}}>Next move: {buildCalendarCampaignArc(event, intelligence)[0]?.label || "Plan campaign"}</div>
                        </button>
                      );
                    })}
                  </div>
                ) : <div style={{color:"#5f7f9f",fontSize:11.5}}>No scheduled events in selected month.</div>}
              </div>

              <div style={{background:"#ffffff",border:"1px solid #cfe0f1",borderRadius:16,padding:"14px",boxShadow:"0 16px 34px rgba(7,64,105,0.05)"}}>
                <div style={{color:"#d2ab67",fontSize:13.5,fontWeight:800,marginBottom:8}}>Copy-Ready Step Text</div>
                <div style={{display:"grid",gap:7}}>
                  {calendarCampaignCards.slice(0, 4).map((event) => {
                    const intelligence = calendarEventTargeting[event.id] || buildCalendarEventTargeting(event, customerRecords, topAreaNames);
                    const firstStep = buildCalendarCampaignArc(event, intelligence)[1] || buildCalendarCampaignArc(event, intelligence)[0];
                    return (
                    <div key={`${event.id}-wa`} style={{background:"#f8fbff",border:"1px solid #d0e0f1",borderRadius:12,padding:"10px 11px"}}>
                      <div style={{color:"#1f3550",fontSize:12,fontWeight:800}}>{event.name}</div>
                      <div style={{color:"#587493",fontSize:10.5,marginTop:3}}>{firstStep?.label || "Campaign push"} | {formatDateShort(firstStep?.date || event.date)}</div>
                      <div style={{color:"#4d6d8f",fontSize:10.5,marginTop:4,lineHeight:1.6}}>{firstStep?.copy || event.whatsapp}</div>
                      <button onClick={() => navigator.clipboard?.writeText(firstStep?.copy || event.whatsapp)} style={{marginTop:7,background:"#edf5ff",border:"1px solid #a7c1db",borderRadius:8,color:"#365a7f",padding:"5px 9px",fontSize:10,cursor:"pointer"}}>
                        Copy text
                      </button>
                    </div>
                  );})}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONTENT STUDIO TAB */}
      {tab==="studio" && (
        <div style={{flex:1,overflowY:"auto",position:"relative",zIndex:1}}>
          <ContentStudio />
        </div>
      )}

      {/* CHAT TAB */}
      {tab==="chat" && (
        <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",overflow:"hidden",position:"relative",zIndex:1}}>
          <div ref={chatScrollRef} onScroll={onChatScroll} style={{flex:1,minHeight:0,overflowY:"auto",overscrollBehavior:"contain",padding:"18px 22px 12px",scrollBehavior:"auto"}}>
            <div style={{minHeight:"100%",maxWidth:1320,margin:"0 auto",display:"flex",flexDirection:"column",justifyContent:"flex-start"}}>
              {msgs.length===0 && !loading && (
                <div style={{alignSelf:"center",marginTop:"8vh",width:"min(980px, 100%)",background:"linear-gradient(145deg, rgba(255,255,255,0.96), rgba(245,250,255,0.92))",border:"1px solid #d7e3f0",boxShadow:"0 24px 60px rgba(7,64,105,0.10)",borderRadius:24,padding:"18px 20px",color:"#5f7f9f",fontSize:12,position:"relative",overflow:"hidden"}}>
                  <div style={{position:"absolute",inset:"auto -40px -80px auto",width:220,height:220,borderRadius:"50%",background:"radial-gradient(circle, rgba(210,171,103,0.18), rgba(210,171,103,0))"}} />
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:8,position:"relative"}}>
                    <div>
                      <div style={{fontSize:12,color:"#6d4f18",letterSpacing:1.2,textTransform:"uppercase",marginBottom:6}}>Preview-First Customer Intelligence</div>
                      <div style={{fontSize:28,color:"#17395c",fontWeight:800,lineHeight:1.05,maxWidth:560}}>Ask for the answer first. Open raw customers only when you need them.</div>
                    </div>
                    <span style={{background:"#fff8ec",border:"1px solid #ead4ab",borderRadius:999,padding:"4px 10px",fontSize:10,color:"#6d4f18"}}>{toInt(getCustomerRecords(appData).length || appData?.overview?.total_customers).toLocaleString()} synced rows</span>
                  </div>
                  <div style={{marginBottom:12,maxWidth:780,fontSize:13,lineHeight:1.7,position:"relative"}}>{activeOutcome.helper}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8,position:"relative"}}>
                    {chatShortcutPrompts.map(s=>(
                      <button key={`starter-${s}`} onClick={()=>send(s)} style={{background:"rgba(255,255,255,0.92)",border:"1px solid #c7d7e8",borderRadius:18,color:"#3d5b7c",padding:"8px 14px",cursor:"pointer",fontSize:11,fontFamily:"'Montserrat', sans-serif",boxShadow:"0 8px 18px rgba(7,64,105,0.05)"}}
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
                  <div style={{display:"flex",flexDirection:m.role==="user"?"row-reverse":"row",gap:10,alignItems:"flex-start",maxWidth:"100%"}}>
                    <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,background:m.role==="user"?rc+"15":"#d2ab6712",border:`1px solid ${m.role==="user"?rc+"40":"#d2ab6730"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>
                      {m.role==="user"?ROLES[role].icon:"MM"}
                    </div>
                    <div style={{maxWidth:m.role==="user"?"min(860px, 88%)":"min(1120px, 100%)",overflowX:"auto",background:m.role==="user"?"#edf5ff":"rgba(255,255,255,0.88)",border:`1px solid ${m.role==="user"?"#b9cee5":"#d7e3f0"}`,borderRadius:m.role==="user"?"18px 6px 18px 18px":"6px 20px 20px 20px",padding:"12px 15px",fontSize:13,lineHeight:1.78,color:m.error?"#ff6666":"#2f4f70",boxShadow:m.role==="user"?"0 10px 18px rgba(7,64,105,0.04)":"0 18px 34px rgba(7,64,105,0.06)"}}>
                      {m.role==="user"
                        ? <span style={{color:"#20476d"}}>{m.content}</span>
                        : <>
                            {m.skill && <div style={{color:"#6d87a9",fontSize:10,marginBottom:6}}>Strategy lens: {MARKETING_SKILLS[m.skill]?.label || MARKETING_SKILLS.core.label}</div>}
                            {m.deterministic && <div style={{color:"#2f7a4a",fontSize:10,marginBottom:6}}>Verified workbook mode | No model-generated customer rows</div>}
                            {m.searched && <div style={{color:"#4499ff",fontSize:10,marginBottom:8,display:"flex",alignItems:"center",gap:5}}>Live competitor scan <em>Fresh web intelligence added</em></div>}
                            {m.structured && (
                              <div style={{display:"grid",gap:7,marginBottom:8}}>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                                    <span style={{background:"#fff8ec",border:"1px solid #ead4ab",borderRadius:999,padding:"2px 8px",fontSize:10,color:"#6d4f18"}}>
                                      {toText(m?.structured?.data_snapshot?.response_mode || "strategy_brief").replace(/_/g, " ")} | Quality: {toInt(m.qualityScore)}/100
                                    </span>
                                    <span style={{background:"#edf5ff",border:"1px solid #c7d9ea",borderRadius:999,padding:"2px 8px",fontSize:10,color:"#365a7f"}}>
                                      Matches: {toInt(m?.structured?.data_snapshot?.matched_customers || asArray(m.structured?.customer_data_list).length).toLocaleString()}
                                    </span>
                                    <span style={{background:"#effbf2",border:"1px solid #cce8d3",borderRadius:999,padding:"2px 8px",fontSize:10,color:"#2f7a4a"}}>
                                      Confidence: {typeof m.structured?.confidence === "number" ? m.structured.confidence.toFixed(2) : toText(m.structured?.confidence)}
                                    </span>
                                    <span style={{background:"#f6f1ff",border:"1px solid #d8c7ef",borderRadius:999,padding:"2px 8px",fontSize:10,color:"#6a4c93"}}>
                                      Policy: {toText(m?.structured?.data_snapshot?.offer_policy_status || "clean")}
                                    </span>
                                    {!!toText(m?.structured?.data_snapshot?.data_timestamp) && (
                                      <span style={{background:"#f7fbff",border:"1px solid #d8e7f5",borderRadius:999,padding:"2px 8px",fontSize:10,color:"#587493"}}>
                                        Data: {toText(m?.structured?.data_snapshot?.data_timestamp)}
                                      </span>
                                    )}
                                    {!!toText(m?.context?.audit?.traceId || m?.structured?.data_snapshot?.audit_trace_id) && (
                                      <span style={{background:"#ffffff",border:"1px dashed #bfd0e4",borderRadius:999,padding:"2px 8px",fontSize:10,color:"#587493"}}>
                                        Trace: {toText(m?.context?.audit?.traceId || m?.structured?.data_snapshot?.audit_trace_id).slice(-12)}
                                      </span>
                                    )}
                                    {!!asArray(m.structured?.customer_data_list).length && (
                                      <button onClick={() => openProofPanel({
                                        title: `Chat proof: ${toText(m?.context?.query || "customer result")}`,
                                        subtitle: `${asArray(m.structured?.customer_data_list).length.toLocaleString()} rows attached to this reply.`,
                                        customers: asArray(m.structured?.customer_data_list),
                                        filters: asArray(m?.structured?.data_snapshot?.filters_applied),
                                        source: `AI chat | ${dataSource}`,
                                        query: toText(m?.context?.query),
                                        openedFrom: "chat",
                                        sortMode: toText(m?.structured?.data_snapshot?.sort_mode) || "revenue_desc"
                                      })} style={{background:"#ffffff",border:"1px solid #c7d9ea",borderRadius:999,padding:"2px 8px",fontSize:10,color:"#365a7f",cursor:"pointer"}}>
                                        View customer details
                                      </button>
                                    )}
                                  </div>
                                  {!!asArray(m.qualityIssues).length && (
                                    <span style={{fontSize:10,color:"#8b6b3a"}}>{asArray(m.qualityIssues).slice(0, 2).join(" | ")}</span>
                                  )}
                                </div>
                                {m?.context?.analysis_packet?.customer_match_summary && (
                                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                                    <span style={{fontSize:10,color:"#587493"}}>
                                      Verified against {toInt(m.context.analysis_packet.customer_match_summary.total_matches).toLocaleString()} customers in the current workbook
                                    </span>
                                    {!!asArray(m.context.analysis_packet.customer_match_summary.filters_applied).length && (
                                      <span style={{fontSize:10,color:"#6d4f18"}}>
                                        Filters: {asArray(m.context.analysis_packet.customer_match_summary.filters_applied).join(", ")}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {!m.deterministic && (
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
                                )}
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
                                {!!asArray(m.structured?.customer_data_list).length && (
                                  <button onClick={() => openProofPanel({
                                    title: `Chat proof: ${toText(m?.context?.query || "customer result")}`,
                                    subtitle: `${asArray(m.structured?.customer_data_list).length.toLocaleString()} rows attached to this reply.`,
                                    customers: asArray(m.structured?.customer_data_list),
                                    filters: asArray(m?.structured?.data_snapshot?.filters_applied),
                                    source: `AI chat | ${dataSource}`,
                                    query: toText(m?.context?.query),
                                    openedFrom: "chat",
                                    sortMode: toText(m?.structured?.data_snapshot?.sort_mode) || "revenue_desc"
                                  })} style={{background:"#f6faff",border:"1px solid #c1d4e8",borderRadius:6,color:"#3d5b7c",padding:"4px 12px",cursor:"pointer",fontSize:11,fontFamily:"'Montserrat', sans-serif"}}
                                    onMouseOver={e=>{e.currentTarget.style.color="#074069";e.currentTarget.style.borderColor="#07406935";}}
                                    onMouseOut={e=>{e.currentTarget.style.color="#3d5b7c";e.currentTarget.style.borderColor="#c1d4e8";}}>
                                    View Customer Details
                                  </button>
                                )}
                                {!!asArray(m.structured?.customer_data_list).length && (
                                  <button onClick={()=>exportProofCsv(asArray(m.structured.customer_data_list), `chat-${toText(m?.context?.query || "customer-result")}`)} style={{background:"#f6faff",border:"1px solid #c1d4e8",borderRadius:6,color:"#3d5b7c",padding:"4px 12px",cursor:"pointer",fontSize:11,fontFamily:"'Montserrat', sans-serif"}}
                                    onMouseOver={e=>{e.currentTarget.style.color="#074069";e.currentTarget.style.borderColor="#07406935";}}
                                    onMouseOut={e=>{e.currentTarget.style.color="#3d5b7c";e.currentTarget.style.borderColor="#c1d4e8";}}>
                                    Export CSV
                                  </button>
                                )}
                                <button onClick={() => focusChatComposer(toText(m?.context?.query || ""))} style={{background:"#f6faff",border:"1px solid #c1d4e8",borderRadius:6,color:"#3d5b7c",padding:"4px 12px",cursor:"pointer",fontSize:11,fontFamily:"'Montserrat', sans-serif"}}
                                  onMouseOver={e=>{e.currentTarget.style.color="#074069";e.currentTarget.style.borderColor="#07406935";}}
                                  onMouseOut={e=>{e.currentTarget.style.color="#3d5b7c";e.currentTarget.style.borderColor="#c1d4e8";}}>
                                  Refine Query
                                </button>
                                {!!asArray(m.structured?.customer_data_list).length && toText(m?.structured?.data_snapshot?.response_mode) === "customer_preview" && (
                                  <button onClick={()=>navigator.clipboard?.writeText(customerListToPlainText(m.structured.customer_data_list))} style={{background:"#f6faff",border:"1px solid #c1d4e8",borderRadius:6,color:"#3d5b7c",padding:"4px 12px",cursor:"pointer",fontSize:11,fontFamily:"'Montserrat', sans-serif"}}
                                    onMouseOver={e=>{e.currentTarget.style.color="#074069";e.currentTarget.style.borderColor="#07406935";}}
                                    onMouseOut={e=>{e.currentTarget.style.color="#3d5b7c";e.currentTarget.style.borderColor="#c1d4e8";}}>
                                    Copy For Ops
                                  </button>
                                )}
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
                    <span style={{color:"#6f83a8",fontSize:11,marginRight:6,fontStyle:"italic"}}>{`Grounding against ${toInt(D.total_customers).toLocaleString()} workbook customers`}</span>
                    {[0,1,2].map(i=><div key={i} style={{width:5,height:5,borderRadius:"50%",background:rc,animation:"pulse 1.2s ease-in-out infinite",animationDelay:`${i*0.2}s`}}/>)}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{padding:"10px 22px 16px",borderTop:"1px solid #d7e3f0",background:"linear-gradient(180deg, rgba(248,251,255,0.94), rgba(244,249,255,0.98))",backdropFilter:"blur(14px)",flexShrink:0}}>
            <div style={{maxWidth:1320,margin:"0 auto",position:"relative"}}>
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

              <div style={{position:"relative",background:"linear-gradient(160deg, rgba(255,255,255,0.97), rgba(245,250,255,0.94))",border:"1px solid #d7e3f0",borderRadius:26,padding:"10px 12px 9px",boxShadow:"0 18px 36px rgba(7,64,105,0.08)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:8}}>
                  <div style={{display:"inline-flex",gap:4,flexWrap:"wrap",padding:4,background:"rgba(244,249,255,0.9)",border:"1px solid #d7e3f0",borderRadius:999}}>
                    {CHAT_OUTCOME_OPTIONS.map((option) => {
                      const active = option.id === activeOutcome.id;
                      return (
                        <button
                          key={option.id}
                          onClick={() => setChatControls((prev) => applyOutcomeToControls(prev, option.id))}
                          style={{background:active?"#074069":"transparent",border:"none",borderRadius:999,color:active?"#ffffff":"#4b6787",padding:"6px 10px",cursor:"pointer",fontSize:10,fontWeight:700,fontFamily:"'Montserrat', sans-serif",boxShadow:active?"0 8px 16px rgba(7,64,105,0.14)":"none"}}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <span style={{fontSize:10,color:"#6f86aa"}}>
                    {activeOutcome.id === "customer_list"
                      ? "Summary first. Full customer list only on click."
                      : activeOutcome.id === "root_cause"
                        ? "Grounded diagnosis from the active workbook."
                        : activeOutcome.id === "action_plan"
                          ? "Premium-safe action plan, grounded to current data."
                          : "Scripts stay inside your brand guardrails."}
                  </span>
                </div>

                <div style={{display:"grid",gridTemplateColumns:"minmax(0, 1fr) auto",gap:8,alignItems:"end"}}>
                  <div style={{background:"rgba(255,255,255,0.96)",border:"1px solid #c8d9ea",boxShadow:"0 12px 24px rgba(7,64,105,0.06)",borderRadius:24,padding:"7px 10px 6px 14px"}}>
                    <textarea ref={chatInputRef} value={inp} onChange={handleChatComposerChange} onKeyDown={e=>{ if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                      placeholder={activeOutcome.placeholder}
                      rows={1}
                      style={{width:"100%",background:"transparent",border:"none",color:"#1f3550",padding:"4px 2px 1px",fontSize:14,outline:"none",fontFamily:"'Montserrat', sans-serif",lineHeight:1.48,resize:"none",minHeight:40,maxHeight:120,overflowY:"auto"}}
                    />
                  </div>
                  <button onClick={()=>send()} disabled={loading||!inp.trim()} style={{alignSelf:"stretch",background:loading?"#f3f7fc":rc,color:loading?"#587493":"#000",border:loading?"1px solid #d7e3f0":"none",borderRadius:18,padding:"0 18px",cursor:loading?"not-allowed":"pointer",fontSize:11,fontWeight:700,fontFamily:"'Montserrat', sans-serif",minHeight:46,minWidth:92,boxShadow:loading?"none":"0 12px 24px rgba(210,171,103,0.18)"}}>
                    {loading ? "Working..." : activeOutcome.id === "customer_list" ? "Preview" : activeOutcome.id === "scripts" ? "Generate" : "Build"}
                  </button>
                </div>

                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",marginTop:8}}>
                  <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{fontSize:10,color:"#6f86aa"}}>
                      {!!toText(deferredInput) && liveCustomerPreview
                        ? `Preview ready: ${toInt(liveCustomerPreview.totalMatches).toLocaleString()} matches in current workbook`
                        : "Enter to send. Shift + Enter for line break."}
                    </span>
                    {!(activeOutcome.id === "customer_list") && !apiKey.trim() && (
                      <span style={{fontSize:10,color:"#8b6b3a"}}>Model key required for this mode.</span>
                    )}
                  </div>
                  <button
                    onClick={()=>setShowControlGuide((v)=>!v)}
                    style={{background:"transparent",border:"none",padding:0,cursor:"pointer",fontSize:10,fontWeight:700,fontFamily:"'Montserrat', sans-serif",color:showControlGuide?"#074069":"#5f7f9f"}}
                  >
                    {showControlGuide ? "Close advanced settings" : "Advanced settings"}
                  </button>
                </div>

              {showControlGuide && (
                <div style={{position:"absolute",left:0,bottom:"calc(100% + 10px)",width:"min(900px, 100%)",background:"rgba(248,251,255,0.98)",border:"1px solid #d7e3f0",borderRadius:22,padding:"14px",boxShadow:"0 22px 60px rgba(7,64,105,0.14)",backdropFilter:"blur(14px)",zIndex:4}}>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:12}}>
                    <div>
                      <div style={{fontSize:10,color:"#6f86aa",marginBottom:6,textTransform:"uppercase",letterSpacing:0.6}}>Model Setup</div>
                      <div style={{display:"grid",gap:7}}>
                    <select
                      value={provider}
                      onChange={(e)=>setProvider(e.target.value)}
                      style={{background:"#ffffff",border:"1px solid #c8d9ea",borderRadius:8,color:"#1f3550",padding:"8px 11px",fontSize:11,outline:"none",fontFamily:"'Montserrat', sans-serif"}}
                    >
                      <option value="nvidia">NVIDIA NIM</option>
                      <option value="gemini">Gemini API</option>
                    </select>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={e=>setApiKey(e.target.value)}
                      placeholder={`${PROVIDER_META[provider]?.keyLabel || "API"} API key`}
                      autoComplete="off"
                      style={{background:"#ffffff",border:"1px solid #c8d9ea",borderRadius:8,color:"#1f3550",padding:"8px 11px",fontSize:11,outline:"none",fontFamily:"'Montserrat', sans-serif"}}
                      onFocus={e=>e.target.style.borderColor=rc+"55"} onBlur={e=>e.target.style.borderColor="#c8d9ea"}
                    />
                    <input
                      value={model}
                      onChange={e=>setModel(e.target.value)}
                      placeholder={getDefaultModel(provider)}
                      style={{background:"#ffffff",border:"1px solid #c8d9ea",borderRadius:8,color:"#1f3550",padding:"8px 11px",fontSize:11,outline:"none",fontFamily:"'Montserrat', sans-serif"}}
                      onFocus={e=>e.target.style.borderColor=rc+"55"} onBlur={e=>e.target.style.borderColor="#c8d9ea"}
                    />
                      </div>
                      <div style={{fontSize:10,color:"#5f7898",marginTop:7}}>
                        Customer Match preview works without a key. Root Cause, Action Plan, and Scripts use the selected model.
                      </div>
                    </div>

                    <div>
                      <div style={{fontSize:10,color:"#6f86aa",marginBottom:6,textTransform:"uppercase",letterSpacing:0.6}}>Strategy Tuning</div>
                      <div style={{display:"grid",gap:7}}>
                    <select value={chatControls.objective} onChange={(e)=>setChatControls((prev)=>({ ...prev, objective: e.target.value }))} style={{background:"#ffffff",border:"1px solid #c8d9ea",borderRadius:8,color:"#1f3550",padding:"8px 11px",fontSize:11,outline:"none",fontFamily:"'Montserrat', sans-serif"}}>
                      {CHAT_OBJECTIVES.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <select value={chatControls.depth} onChange={(e)=>setChatControls((prev)=>({ ...prev, depth: e.target.value }))} style={{background:"#ffffff",border:"1px solid #c8d9ea",borderRadius:8,color:"#1f3550",padding:"8px 11px",fontSize:11,outline:"none",fontFamily:"'Montserrat', sans-serif"}}>
                      {CHAT_DEPTH.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <select value={chatControls.tone} onChange={(e)=>setChatControls((prev)=>({ ...prev, tone: e.target.value }))} style={{background:"#ffffff",border:"1px solid #c8d9ea",borderRadius:8,color:"#1f3550",padding:"8px 11px",fontSize:11,outline:"none",fontFamily:"'Montserrat', sans-serif"}}>
                      {CHAT_TONES.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <select value={chatControls.persona} onChange={(e)=>setChatControls((prev)=>({ ...prev, persona: e.target.value }))} style={{background:"#ffffff",border:"1px solid #c8d9ea",borderRadius:8,color:"#1f3550",padding:"8px 11px",fontSize:11,outline:"none",fontFamily:"'Montserrat', sans-serif"}}>
                      {Object.entries(PERSONA_PLAYBOOKS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
                    </select>
                      </div>
                    </div>

                    <div>
                      <div style={{fontSize:10,color:"#6f86aa",marginBottom:6,textTransform:"uppercase",letterSpacing:0.6}}>Brand Guardrail</div>
                      <div style={{background:"#ffffff",border:"1px solid #ead4ab",borderRadius:10,padding:"9px 10px",fontSize:10,color:"#6d4f18",lineHeight:1.6}}>
                        {OFFER_POLICY.summary}
                      </div>
                      <div style={{fontSize:10,color:"#5f7898",marginTop:8}}>
                        Allowed premium value frames: {OFFER_POLICY.allowedFrames.join(", ")}.
                      </div>
                    </div>
                  </div>

                  <div style={{fontSize:10,color:"#6f86aa",marginTop:10,marginBottom:6,textTransform:"uppercase",letterSpacing:0.6}}>Quick Presets</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {CHAT_CONTEXT_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => applyContextPreset(preset)}
                        style={{background:"#ffffff",border:"1px solid #c7d9ea",borderRadius:14,color:"#365a7f",padding:"5px 10px",fontSize:10,cursor:"pointer",fontFamily:"'Montserrat', sans-serif"}}
                        title={preset.use_when}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      {proofPanel.open && (
        <div onClick={closeProofPanel} style={{position:"fixed",inset:0,background:"rgba(15,33,56,0.42)",backdropFilter:"blur(4px)",zIndex:20,display:"flex",justifyContent:"flex-end"}}>
          <div onClick={(e) => e.stopPropagation()} style={{width:"min(940px, 100%)",height:"100%",background:"#fdfefe",borderLeft:"1px solid #d7e3f0",boxShadow:"-24px 0 60px rgba(7,64,105,0.18)",display:"flex",flexDirection:"column"}}>
            <div style={{padding:"16px 18px 12px",borderBottom:"1px solid #d7e3f0",background:"linear-gradient(180deg, #ffffff, #f6fbff)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:10}}>
                <div>
                  <div style={{color:"#074069",fontSize:20,fontWeight:800,lineHeight:1.1}}>{proofPanel.title || "Customer proof"}</div>
                  <div style={{color:"#5f7f9f",fontSize:11,marginTop:4}}>{proofPanel.subtitle || "Full customer proof rows from the current workbook."}</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
                    <span style={{background:"#edf5ff",border:"1px solid #c7d9ea",borderRadius:999,padding:"3px 9px",fontSize:10,color:"#365a7f"}}>{proofVisibleStats.count.toLocaleString()} rows visible</span>
                    <span style={{background:"#effbf2",border:"1px solid #cce8d3",borderRadius:999,padding:"3px 9px",fontSize:10,color:"#2f7a4a"}}>{inr(proofVisibleStats.revenue)} revenue</span>
                    <span style={{background:"#fff8ec",border:"1px solid #ead4ab",borderRadius:999,padding:"3px 9px",fontSize:10,color:"#6d4f18"}}>{proofVisibleStats.negativeWallet.toLocaleString()} negative wallet</span>
                    <span style={{background:"#fff4f1",border:"1px solid #f0d0c5",borderRadius:999,padding:"3px 9px",fontSize:10,color:"#a14b39"}}>{proofVisibleStats.suspended.toLocaleString()} suspended</span>
                    <span style={{background:"#f7f3ff",border:"1px solid #d8d0f2",borderRadius:999,padding:"3px 9px",fontSize:10,color:"#644e9b"}}>{proofVisibleStats.notesCaptured.toLocaleString()} notes captured</span>
                  </div>
                </div>
                <button onClick={closeProofPanel} style={{background:"#ffffff",border:"1px solid #c7d9ea",borderRadius:10,color:"#365a7f",padding:"6px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>
                  Close
                </button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"minmax(220px, 1fr) repeat(4, auto)",gap:8,alignItems:"center"}}>
                <input value={proofSearch} onChange={(e) => { setProofSearch(e.target.value); setProofPage(1); }} placeholder="Search name, mobile, area, hub, status, note..." style={{background:"#ffffff",border:"1px solid #c7d9ea",borderRadius:10,color:"#1f3550",padding:"9px 11px",fontSize:12,outline:"none"}} />
                <select value={proofView.sortMode} onChange={(e) => { setProofView((prev) => ({ ...prev, sortMode: e.target.value })); setProofPage(1); }} style={{background:"#ffffff",border:"1px solid #c7d9ea",borderRadius:10,color:"#1f3550",padding:"9px 11px",fontSize:11,outline:"none"}}>
                  {PROOF_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <select value={String(proofPageSize)} onChange={(e) => { const value = e.target.value === "all" ? "all" : Number(e.target.value); setProofPageSize(value); setProofPage(1); }} style={{background:"#ffffff",border:"1px solid #c7d9ea",borderRadius:10,color:"#1f3550",padding:"9px 11px",fontSize:11,outline:"none"}}>
                  {PROOF_PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={String(option)} value={String(option)}>
                      {option === "all" ? "All rows" : `${option.toLocaleString()} rows/page`}
                    </option>
                  ))}
                </select>
                <button onClick={() => navigator.clipboard?.writeText(customerListToPlainText(proofVisibleCustomers))} style={{background:"#ffffff",border:"1px solid #c7d9ea",borderRadius:10,color:"#365a7f",padding:"8px 12px",cursor:"pointer",fontSize:11}}>
                  Copy visible
                </button>
                <button onClick={() => exportProofCsv(proofVisibleCustomers, proofPanel.title)} style={{background:"#ffffff",border:"1px solid #c7d9ea",borderRadius:10,color:"#365a7f",padding:"8px 12px",cursor:"pointer",fontSize:11}}>
                  Export visible CSV
                </button>
                <button onClick={() => exportProofCsv(proofPanel.customers, `${proofPanel.title}-all`)} style={{background:"#074069",border:"1px solid #356d9f",borderRadius:10,color:"#eaf3ff",padding:"8px 12px",cursor:"pointer",fontSize:11}}>
                  Export full CSV
                </button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:8,marginTop:8}}>
                <select value={proofView.status} onChange={(e) => { setProofView((prev) => ({ ...prev, status: e.target.value })); setProofPage(1); }} style={{background:"#ffffff",border:"1px solid #c7d9ea",borderRadius:10,color:"#1f3550",padding:"9px 11px",fontSize:11,outline:"none"}}>
                  <option value="all">All statuses</option>
                  <option value="active">Active only</option>
                  <option value="inactive">Inactive only</option>
                  <option value="suspended">Suspended only</option>
                  <option value="trial">Trial only</option>
                </select>
                <select value={proofView.wallet} onChange={(e) => { setProofView((prev) => ({ ...prev, wallet: e.target.value })); setProofPage(1); }} style={{background:"#ffffff",border:"1px solid #c7d9ea",borderRadius:10,color:"#1f3550",padding:"9px 11px",fontSize:11,outline:"none"}}>
                  <option value="all">All wallet states</option>
                  <option value="negative">Negative wallet</option>
                  <option value="zero">Zero wallet</option>
                  <option value="positive">Positive wallet</option>
                </select>
                <select value={proofView.area} onChange={(e) => { setProofView((prev) => ({ ...prev, area: e.target.value })); setProofPage(1); }} style={{background:"#ffffff",border:"1px solid #c7d9ea",borderRadius:10,color:"#1f3550",padding:"9px 11px",fontSize:11,outline:"none"}}>
                  <option value="all">All areas</option>
                  {proofAreaOptions.map((area) => <option key={area} value={area}>{area}</option>)}
                </select>
                <select value={proofView.hub} onChange={(e) => { setProofView((prev) => ({ ...prev, hub: e.target.value })); setProofPage(1); }} style={{background:"#ffffff",border:"1px solid #c7d9ea",borderRadius:10,color:"#1f3550",padding:"9px 11px",fontSize:11,outline:"none"}}>
                  <option value="all">All hubs</option>
                  {proofHubOptions.map((hub) => <option key={hub} value={hub}>{hub}</option>)}
                </select>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginTop:8,flexWrap:"wrap"}}>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {asArray(proofPanel.filters).slice(0, 10).map((filterTag) => (
                    <span key={filterTag} style={{background:"#ffffff",border:"1px solid #d7e3f0",borderRadius:999,padding:"2px 8px",fontSize:10,color:"#587493"}}>{filterTag}</span>
                  ))}
                  {!asArray(proofPanel.filters).length && (
                    <span style={{background:"#ffffff",border:"1px solid #d7e3f0",borderRadius:999,padding:"2px 8px",fontSize:10,color:"#587493"}}>dataset proof</span>
                  )}
                </div>
                <div style={{fontSize:10,color:"#6f86aa"}}>
                  Source: {proofPanel.source || dataSource} {proofPanel.query ? `| Query: ${proofPanel.query}` : ""}
                </div>
              </div>
              <div style={{marginTop:8,background:"#ffffff",border:"1px solid #d7e3f0",borderRadius:10,padding:"8px 10px",fontSize:10,color:"#365a7f"}}>
                {proofInsight}
              </div>
            </div>

            <div style={{padding:"10px 18px",borderBottom:"1px solid #d7e3f0",background:"#f8fbff",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <div style={{fontSize:11,color:"#365a7f"}}>
                Showing {(proofVisibleCustomers.length ? ((safeProofPage - 1) * Math.max(1, activeProofPageSize)) + 1 : 0).toLocaleString()}-{Math.min(safeProofPage * Math.max(1, activeProofPageSize), proofVisibleCustomers.length).toLocaleString()} of {proofVisibleCustomers.length.toLocaleString()} visible rows
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <button onClick={() => setProofPage((prev) => Math.max(1, prev - 1))} disabled={safeProofPage <= 1} style={{background:"#ffffff",border:"1px solid #c7d9ea",borderRadius:8,color:"#365a7f",padding:"5px 8px",cursor:"pointer",fontSize:10}}>Prev</button>
                <span style={{fontSize:10,color:"#587493"}}>Page {safeProofPage} / {proofPageCount} | View: {proofPageSize === "all" ? "All rows" : `${activeProofPageSize.toLocaleString()} rows/page`}</span>
                <button onClick={() => setProofPage((prev) => Math.min(proofPageCount, prev + 1))} disabled={safeProofPage >= proofPageCount} style={{background:"#ffffff",border:"1px solid #c7d9ea",borderRadius:8,color:"#365a7f",padding:"5px 8px",cursor:"pointer",fontSize:10}}>Next</button>
              </div>
            </div>

            <div style={{flex:1,overflow:"auto",padding:"12px 18px 18px"}}>
              <div style={{overflowX:"auto",background:"#ffffff",border:"1px solid #d7e3f0",borderRadius:12}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead style={{position:"sticky",top:0,zIndex:1}}>
                    {proofTable.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <th key={header.id} style={{background:"#074069",color:"#ffffff",padding:"8px 10px",textAlign:"left",border:"1px solid #1e5b88",whiteSpace:"nowrap",fontWeight:700}}>
                            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {proofPagedCustomers.map((row) => (
                      <tr key={row.id} onClick={() => openSingleCustomerProof(row.original, "Proof Workspace")} style={{cursor:"pointer"}}>
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} style={{padding:"7px 10px",border:"1px solid #e3edf6",minWidth:cell.column.id === "why_it_matters" ? 220 : cell.column.id === "note" ? 280 : undefined,whiteSpace:cell.column.id === "name" || cell.column.id === "mobile" || cell.column.id === "last_delivery" ? "nowrap" : "normal"}}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {!proofPagedCustomers.length && (
                      <tr>
                        <td colSpan={proofColumns.length} style={{padding:"18px 12px",textAlign:"center",color:"#6f86aa"}}>No customer rows match the current proof filters.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap');@keyframes pulse{0%,100%{opacity:0.2;transform:scale(0.7)}50%{opacity:1;transform:scale(1.15)}}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#9fb4cc;border-radius:3px}input::placeholder{color:#587493;font-size:11px}button{transition:all .18s ease}`}</style>
    </div>
  );
}
