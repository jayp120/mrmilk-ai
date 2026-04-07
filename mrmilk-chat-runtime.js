import * as duckdb from "@duckdb/duckdb-wasm";
import { Engine } from "json-rules-engine";
import duckdbMvpWasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import duckdbEhWasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import duckdbMvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import duckdbEhWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

const DUCKDB_BUNDLES = {
  mvp: {
    mainModule: duckdbMvpWasm,
    mainWorker: duckdbMvpWorker
  },
  eh: {
    mainModule: duckdbEhWasm,
    mainWorker: duckdbEhWorker
  }
};

const toText = (value) => value == null ? "" : String(value).trim();
const toKey = (value) => toText(value).toLowerCase();
const toInt = (value) => {
  const normalized = typeof value === "string" ? value.replace(/[, ]+/g, "") : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
};
const toNumber = (value) => {
  const normalized = typeof value === "string" ? value.replace(/[, ]+/g, "") : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};
const escapeSql = (value) => `'${toText(value).replace(/'/g, "''")}'`;
const encodeValues = (values = []) => values.map((value) => escapeSql(value)).join(", ");

const normalizeIsoDate = (value) => {
  const raw = toText(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const day = `${parsed.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const daysSinceDate = (isoDate, todayIso) => {
  const normalized = normalizeIsoDate(isoDate);
  if (!normalized) return null;
  const current = new Date(`${todayIso}T00:00:00`);
  const source = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(current.getTime()) || Number.isNaN(source.getTime())) return null;
  return Math.max(0, Math.floor((current.getTime() - source.getTime()) / 86400000));
};

const inferTimeWindowDays = (query = "") => {
  const q = toKey(query);
  if (/(one|1)\s*(or|-|to)\s*(two|2)\s*months/.test(q)) return null;
  const dayMatch = q.match(/(?:last|past|for)\s+(\d{1,3})\s+days?/);
  if (dayMatch) return toInt(dayMatch[1]);
  const monthMatch = q.match(/(?:last|past|for)\s+(\d{1,2})\s+months?/);
  if (monthMatch) return toInt(monthMatch[1]) * 30;
  if (/\blast month\b|\bpast month\b|\bprevious month\b/.test(q)) return 30;
  if (/\blast two months\b|\bpast two months\b|\bprevious two months\b/.test(q)) return 60;
  if (/\blast 60 days\b/.test(q)) return 60;
  if (/\blast 30 days\b/.test(q)) return 30;
  return null;
};

const prepareRows = (records = [], todayIso = "") => records.map((record, index) => {
  const statusKey = toKey(record.status);
  const lastDeliveryIso = normalizeIsoDate(record.last_delivery);
  const daysSinceLastDelivery = daysSinceDate(lastDeliveryIso, todayIso);
  return {
    row_index: index + 1,
    customer_key: `${toText(record.mobile)}|${toText(record.name)}|${toText(record.area)}`,
    name: toText(record.name),
    name_key: toKey(record.name),
    mobile: toText(record.mobile),
    area: toText(record.area),
    area_key: toKey(record.area),
    hub: toText(record.hub),
    hub_key: toKey(record.hub),
    status: toText(record.status),
    status_key: statusKey,
    revenue: toInt(record.revenue),
    orders: toInt(record.orders),
    wallet_balance: toInt(record.wallet_balance),
    wallet_state: toInt(record.wallet_balance) < 0 ? "negative" : toInt(record.wallet_balance) === 0 ? "zero" : "positive",
    last_delivery: toText(record.last_delivery),
    last_delivery_iso: lastDeliveryIso,
    days_since_last_delivery: daysSinceLastDelivery == null ? null : daysSinceLastDelivery,
    source: toText(record.source),
    source_key: toKey(record.source),
    payment_mode: toText(record.payment_mode),
    payment_mode_key: toKey(record.payment_mode),
    delivery_boy: toText(record.delivery_boy),
    delivery_boy_key: toKey(record.delivery_boy),
    current_consumption: toNumber(record.current_consumption),
    note: toText(record.note),
    note_key: toKey(record.note),
    note_present: Boolean(toText(record.note)),
    is_active: /active/.test(statusKey) && !/inactive/.test(statusKey),
    is_inactive: /inactive/.test(statusKey),
    is_suspended: /suspend/.test(statusKey),
    is_trial: /trial|new customer/.test(statusKey),
    is_blocked: /blocked/.test(statusKey),
    is_dnd: /\bdnd\b/.test(statusKey)
  };
});

let duckDbPromise = null;
let seededFingerprint = "";

const getDuckDb = async () => {
  if (duckDbPromise) return duckDbPromise;
  duckDbPromise = (async () => {
    const bundle = await duckdb.selectBundle(DUCKDB_BUNDLES);
    const worker = new Worker(bundle.mainWorker);
    const logger = new duckdb.VoidLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    return db;
  })();
  return duckDbPromise;
};

const seedCustomersTable = async ({ records = [], fingerprint = "", todayIso = "" }) => {
  const db = await getDuckDb();
  if (fingerprint && fingerprint === seededFingerprint) return db;
  const conn = await db.connect();
  try {
    const preparedRows = prepareRows(records, todayIso);
    await db.registerFileText("mrmilk_customers.json", JSON.stringify(preparedRows));
    await conn.query("DROP TABLE IF EXISTS customers");
    await conn.insertJSONFromPath("mrmilk_customers.json", { name: "customers" });
    seededFingerprint = fingerprint;
  } finally {
    await conn.close();
  }
  return db;
};

const buildWhereClause = (filters = {}) => {
  const clauses = ["1=1"];
  if (filters.mobile) clauses.push(`mobile LIKE ${escapeSql(`%${toText(filters.mobile)}%`)}`);
  if (filters.areas?.length) clauses.push(`area_key IN (${encodeValues(filters.areas.map((value) => toKey(value)))})`);
  if (filters.hubs?.length) clauses.push(`hub_key IN (${encodeValues(filters.hubs.map((value) => toKey(value)))})`);
  if (filters.sources?.length) clauses.push(`source_key IN (${encodeValues(filters.sources.map((value) => toKey(value)))})`);
  if (filters.deliveryBoys?.length) clauses.push(`delivery_boy_key IN (${encodeValues(filters.deliveryBoys.map((value) => toKey(value)))})`);
  if (filters.customerKeys?.length) clauses.push(`customer_key IN (${encodeValues(filters.customerKeys)})`);
  if (filters.names?.length) {
    clauses.push(`(${filters.names.map((value) => `name_key LIKE ${escapeSql(`%${toKey(value)}%`)}`).join(" OR ")})`);
  }
  if (filters.statusType === "suspended") clauses.push("is_suspended = true");
  if (filters.statusType === "inactive") clauses.push("is_inactive = true");
  if (filters.statusType === "trial") clauses.push("is_trial = true");
  if (filters.statusType === "active") clauses.push("is_active = true");
  if (filters.statusType === "blocked") clauses.push("is_blocked = true");
  if (filters.statusType === "dnd") clauses.push("is_dnd = true");
  if (filters.requireActive) clauses.push("is_active = true");
  if (filters.requireBlocked) clauses.push("is_blocked = true");
  if (filters.requireDnd) clauses.push("is_dnd = true");
  if (filters.statusText?.length) {
    clauses.push(`(${filters.statusText.map((value) => `status_key LIKE ${escapeSql(`%${toKey(value)}%`)}`).join(" OR ")})`);
  }
  if (filters.wallet === "negative") clauses.push("wallet_balance < 0");
  if (filters.wallet === "zero") clauses.push("wallet_balance = 0");
  if (filters.wallet === "positive") clauses.push("wallet_balance > 0");
  if (filters.requireNoHub) clauses.push("hub_key = 'no hub assigned'");
  if (filters.paymentModes?.length) clauses.push(`payment_mode_key IN (${encodeValues(filters.paymentModes.map((value) => toKey(value)))})`);
  if (filters.minRevenue != null) clauses.push(`revenue >= ${toInt(filters.minRevenue)}`);
  if (filters.maxRevenue != null) clauses.push(`revenue <= ${toInt(filters.maxRevenue)}`);
  if (filters.currentConsumptionPositive) clauses.push("current_consumption > 0");
  if (filters.minDaysSinceLastDelivery != null) clauses.push(`COALESCE(days_since_last_delivery, 999999) >= ${toInt(filters.minDaysSinceLastDelivery)}`);
  if (filters.maxDaysSinceLastDelivery != null) clauses.push(`COALESCE(days_since_last_delivery, -1) <= ${toInt(filters.maxDaysSinceLastDelivery)}`);
  if (filters.requireOrdersZero) clauses.push("orders = 0");
  if (filters.requireOrdersPositive) clauses.push("orders > 0");
  if (filters.requireNote) clauses.push("note_present = true");
  if (filters.noteTerms?.length) {
    clauses.push(`(${filters.noteTerms.map((value) => `note_key LIKE ${escapeSql(`%${toKey(value)}%`)}`).join(" OR ")})`);
  }
  if (filters.queryText) clauses.push(`(name_key LIKE ${escapeSql(`%${toKey(filters.queryText)}%`)} OR mobile LIKE ${escapeSql(`%${toText(filters.queryText)}%`)} OR area_key LIKE ${escapeSql(`%${toKey(filters.queryText)}%`)} OR hub_key LIKE ${escapeSql(`%${toKey(filters.queryText)}%`)} OR status_key LIKE ${escapeSql(`%${toKey(filters.queryText)}%`)} OR note_key LIKE ${escapeSql(`%${toKey(filters.queryText)}%`)})`);
  return clauses.join(" AND ");
};

const buildSortClause = (sortMode = "revenue_desc") => {
  if (sortMode === "wallet_asc") return "wallet_balance ASC, revenue DESC, orders DESC";
  if (sortMode === "last_delivery_desc") return "last_delivery_iso DESC NULLS LAST, revenue DESC, orders DESC";
  if (sortMode === "consumption_desc") return "current_consumption DESC, revenue DESC, orders DESC";
  return "revenue DESC, orders DESC, name ASC";
};

const tableToRows = (table) => {
  const rawRows = table?.toArray?.() || [];
  return rawRows.map((row) => {
    if (typeof row?.toJSON === "function") return row.toJSON();
    return row;
  });
};

const getIntentRulesEngine = () => {
  const engine = new Engine();
  engine.addRule({
    conditions: { any: [{ fact: "ambiguousMonthRange", operator: "equal", value: true }, { fact: "missingTimeWindowForInactivity", operator: "equal", value: true }] },
    event: { type: "clarify_timeframe" }
  });
  engine.addRule({
    conditions: { all: [{ fact: "customerQuery", operator: "equal", value: true }, { fact: "explicitExport", operator: "equal", value: true }] },
    event: { type: "export" }
  });
  engine.addRule({
    conditions: { all: [{ fact: "customerQuery", operator: "equal", value: true }, { fact: "explicitFullList", operator: "equal", value: true }, { fact: "explicitExport", operator: "equal", value: false }] },
    event: { type: "full_list" }
  });
  engine.addRule({
    conditions: { all: [{ fact: "customerQuery", operator: "equal", value: true }, { fact: "asksCountOnly", operator: "equal", value: true }, { fact: "explicitFullList", operator: "equal", value: false }] },
    event: { type: "count_only" }
  });
  engine.addRule({
    conditions: { all: [{ fact: "customerQuery", operator: "equal", value: true }, { fact: "explicitSummary", operator: "equal", value: true }, { fact: "explicitFullList", operator: "equal", value: false }, { fact: "explicitExport", operator: "equal", value: false }] },
    event: { type: "summary_only" }
  });
  engine.addRule({
    conditions: { all: [{ fact: "customerQuery", operator: "equal", value: true }] },
    event: { type: "customer_query" }
  });
  return engine;
};

const intentRulesEngine = getIntentRulesEngine();

export const evaluateCustomerQueryRules = async ({ query = "", outcomeId = "" }) => {
  const q = toKey(query);
  const strategyVerb = /(why|reason|root cause|cause|build|plan|action plan|strategy|campaign|script|timeline|playbook|improve|fix|solve)/.test(q);
  const customerLookupPattern = /(which|who|show|give|find|how many|count|list|preview|view|export|download).*(customer|customers|accounts|rows|records|people|mobiles)|((wallet balance|positive wallet|negative wallet|zero wallet|no order|not placed any order|last order|last delivery|inactive|suspended|trial).*(customer|customers|accounts|people)?)/.test(q);
  const explicitFullList = /(full customer list|full list|exact customer list|exact customer data|complete customer data|all matching customers|all matched customers|show full list|open full list|raw customer rows|customer records|full records|full data|exact data|view customer list)/.test(q);
  const explicitExport = /(export|download|csv|sheet|report).*(customer|customers|rows|records|data)|customer export/.test(q);
  const asksCountOnly = /(how many|count|total count|number of customers)/.test(q);
  const explicitSummary = /(summary|overview|preview|insight|just tell me|do not show list|without list|don't show list)/.test(q);
  const customerQuery = outcomeId === "customer_list" || explicitFullList || explicitExport || customerLookupPattern || (asksCountOnly && !strategyVerb);
  const gatedCustomerQuery = strategyVerb && !explicitFullList && !explicitExport && !asksCountOnly && outcomeId !== "customer_list"
    ? false
    : customerQuery;
  const timeWindowDays = inferTimeWindowDays(q);
  const ambiguousMonthRange = /(one|1)\s*(or|-|to)\s*(two|2)\s*months/.test(q);
  const inactivityQuestion = /(no order|not placed any order|no successful order|last order|last delivery|inactive since|inactive for|not ordered|have not ordered|haven't ordered)/.test(q);
  const missingTimeWindowForInactivity = inactivityQuestion && timeWindowDays == null && !ambiguousMonthRange;
  const { events } = await intentRulesEngine.run({
    ambiguousMonthRange,
    asksCountOnly,
    customerQuery: gatedCustomerQuery,
    explicitExport,
    explicitFullList,
    explicitSummary,
    missingTimeWindowForInactivity
  });
  const types = new Set(events.map((event) => event.type));
  const intent = types.has("export")
    ? "export"
    : types.has("full_list")
      ? "full_list"
      : types.has("count_only")
        ? "count"
        : "preview";
  let clarificationMessage = "";
  if (types.has("clarify_timeframe")) {
    clarificationMessage = ambiguousMonthRange
      ? "Do you want the last 30 days or the last 60 days?"
      : "What inactivity window should I use: last 30 days or last 60 days?";
  }
  return {
    customerQuery: types.has("customer_query"),
    explicitExport,
    explicitFullList,
    explicitSummary,
    requiresClarification: types.has("clarify_timeframe"),
    clarificationMessage,
    intent,
    timeWindowDays
  };
};

export const runGroundedCustomerQuery = async ({
  records = [],
  fingerprint = "",
  todayIso = "",
  filterSpec = {},
  sortMode = "revenue_desc",
  previewLimit = 8
}) => {
  const db = await seedCustomersTable({ records, fingerprint, todayIso });
  const conn = await db.connect();
  try {
    const whereClause = buildWhereClause(filterSpec);
    const sortClause = buildSortClause(sortMode);
    const summaryRows = tableToRows(await conn.query(`
      WITH filtered AS (
        SELECT * FROM customers WHERE ${whereClause}
      )
      SELECT
        COUNT(*) AS matched_customers,
        COALESCE(SUM(revenue), 0) AS matched_revenue,
        COALESCE(SUM(orders), 0) AS matched_orders,
        SUM(CASE WHEN wallet_balance > 0 THEN 1 ELSE 0 END) AS positive_wallet_customers,
        SUM(CASE WHEN wallet_balance = 0 THEN 1 ELSE 0 END) AS zero_wallet_customers,
        SUM(CASE WHEN wallet_balance < 0 THEN 1 ELSE 0 END) AS negative_wallet_customers,
        SUM(CASE WHEN is_active THEN 1 ELSE 0 END) AS active_customers,
        SUM(CASE WHEN is_inactive THEN 1 ELSE 0 END) AS inactive_customers,
        SUM(CASE WHEN is_suspended THEN 1 ELSE 0 END) AS suspended_customers,
        SUM(CASE WHEN note_present THEN 1 ELSE 0 END) AS notes_captured,
        MIN(days_since_last_delivery) AS min_days_since_last_delivery,
        MAX(days_since_last_delivery) AS max_days_since_last_delivery
      FROM filtered
    `));
    const customerRows = tableToRows(await conn.query(`
      SELECT
        name,
        mobile,
        area,
        hub,
        status,
        revenue,
        wallet_balance,
        orders,
        last_delivery,
        source,
        payment_mode,
        delivery_boy,
        current_consumption,
        note,
        days_since_last_delivery
      FROM customers
      WHERE ${whereClause}
      ORDER BY ${sortClause}
    `));
    const topAreas = tableToRows(await conn.query(`
      SELECT area, COUNT(*) AS customers, COALESCE(SUM(revenue), 0) AS revenue
      FROM customers
      WHERE ${whereClause}
      GROUP BY area
      ORDER BY revenue DESC, customers DESC, area ASC
      LIMIT 5
    `));
    const topStatuses = tableToRows(await conn.query(`
      SELECT status, COUNT(*) AS customers
      FROM customers
      WHERE ${whereClause}
      GROUP BY status
      ORDER BY customers DESC, status ASC
      LIMIT 5
    `));
    return {
      summary: summaryRows[0] || {
        matched_customers: 0,
        matched_revenue: 0,
        matched_orders: 0,
        positive_wallet_customers: 0,
        zero_wallet_customers: 0,
        negative_wallet_customers: 0,
        active_customers: 0,
        inactive_customers: 0,
        suspended_customers: 0,
        notes_captured: 0,
        min_days_since_last_delivery: null,
        max_days_since_last_delivery: null
      },
      customers: customerRows,
      preview: customerRows.slice(0, Math.max(1, previewLimit)),
      topAreas,
      topStatuses,
      sqlAudit: {
        whereClause,
        sortClause
      }
    };
  } finally {
    await conn.close();
  }
};
