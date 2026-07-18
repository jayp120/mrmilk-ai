const DEFAULT_API_BASE = "http://127.0.0.1:8100";
const BACKEND_PORT = "8100";
const AUTH_TOKEN_KEY = "mrmilk_auth_token";
const AUTH_USER_KEY = "mrmilk_auth_user";

export function getApiBaseUrl() {
  const env = import.meta.env.VITE_API_BASE_URL;
  // explicit URL set in the build → trust it verbatim (e.g. Railway / Oracle)
  if (env !== undefined && env !== "") return env.replace(/\/$/, "");
  if (import.meta.env.PROD) return "";

  // Runtime-smart default:
  //   - If the page is being served from the same port as the backend (8100),
  //     use same-origin so cookies / CORS just work.
  //   - If the page is being served from a different port (e.g. vite preview
  //     on 5000, or python http.server on 5000), route API calls to the same
  //     hostname on the backend port (8100). This lets a single build work
  //     both from FastAPI's StaticFiles mount AND from a separate preview.
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname, port } = window.location;
    if (port === BACKEND_PORT || port === "") {
      // Same-origin (either served by FastAPI on 8100, or behind a reverse
      // proxy that maps 80/443 directly to the backend).
      return "";
    }
    return `${protocol}//${hostname}:${BACKEND_PORT}`;
  }

  // SSR / no-window fallback
  return import.meta.env.PROD ? "" : DEFAULT_API_BASE;
}

export function getAuthToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

export function setAuthToken(token) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  else window.localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function clearAuthToken() {
  setAuthToken("");
  setCachedUser(null);
}

// Last-known user, cached so a refresh / transient backend blip doesn't bounce
// the operator to the login screen. Cleared whenever the token is cleared.
export function getCachedUser() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem(AUTH_USER_KEY) || "null");
  } catch {
    return null;
  }
}

export function setCachedUser(user) {
  if (typeof window === "undefined") return;
  if (user) window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  else window.localStorage.removeItem(AUTH_USER_KEY);
}

function authHeaders(headers = {}) {
  const merged = new Headers(headers);
  const token = getAuthToken();
  if (token && !merged.has("Authorization")) {
    merged.set("Authorization", `Bearer ${token}`);
  }
  return merged;
}

function toApiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${cleanPath}`;
}

async function apiFetch(path, options = {}) {
  const response = await fetch(toApiUrl(path), {
    ...options,
    headers: authHeaders(options.headers),
  });
  if (response.status === 401) {
    clearAuthToken();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("mrmilk-auth-expired"));
    }
  }
  return response;
}

async function parseApiResponse(response) {
  const isJson = (response.headers.get("content-type") || "").includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (response.ok) {
    return payload;
  }

  const detail = typeof payload === "object" && payload !== null ? payload.detail ?? payload : payload;
  const message =
    typeof detail === "string"
      ? detail
      : detail?.message || "Request failed.";

  const error = new Error(message);
  error.detail = detail;
  error.status = response.status;
  throw error;
}

export async function login(username, password) {
  const response = await fetch(`${getApiBaseUrl()}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const payload = await parseApiResponse(response);
  if (payload?.access_token) setAuthToken(payload.access_token);
  return payload;
}

export async function fetchCurrentUser(signal) {
  const response = await apiFetch("/api/auth/me", {
    method: "GET",
    signal,
  });
  return parseApiResponse(response);
}

export async function downloadProtectedFile(url, filename = "download") {
  const response = await apiFetch(url, { method: "GET" });
  if (!response.ok) {
    await parseApiResponse(response);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export async function fetchImportHistory(signal) {
  const response = await apiFetch("/api/imports/history", {
    method: "GET",
    signal,
  });
  return parseApiResponse(response);
}

export async function profileImportFile(file, signal) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiFetch("/api/imports/profile", {
    method: "POST",
    body: formData,
    signal,
  });
  return parseApiResponse(response);
}

export async function queueImportFile({ file, role, confirmReplace }) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("snapshot_kind", "full");
  formData.append("confirm_replace", confirmReplace ? "true" : "false");

  const response = await apiFetch("/api/imports", {
    method: "POST",
    body: formData,
    headers: {
      "X-MrMilk-Role": role,
    },
  });
  return parseApiResponse(response);
}

// ----------------------------------------------------------------------
// Sales transactions import — parallel pipeline to customer master.
// Sales data is stored on disk as Parquet + CSV.gz (no Supabase rows).
// ----------------------------------------------------------------------
export async function fetchSalesStatus(signal) {
  const response = await apiFetch("/api/imports/sales/status", {
    method: "GET",
    signal,
  });
  return parseApiResponse(response);
}

export async function profileSalesFile(file, role, signal) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiFetch("/api/imports/sales/profile", {
    method: "POST",
    body: formData,
    headers: role ? { "X-MrMilk-Role": role } : undefined,
    signal,
  });
  return parseApiResponse(response);
}

export async function commitSalesFile({ file, role, confirmReplace }) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("confirm_replace", confirmReplace ? "true" : "false");
  const response = await apiFetch("/api/imports/sales", {
    method: "POST",
    body: formData,
    headers: {
      "X-MrMilk-Role": role,
    },
  });
  return parseApiResponse(response);
}

/**
 * Dry-run analysis of an append upload — returns existing/new ranges,
 * duplicate count, projected total after each strategy, and warnings.
 * Does NOT modify the dataset.
 */
export async function previewSalesAppend(file, role, signal) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiFetch("/api/imports/sales/append/preview", {
    method: "POST",
    body: formData,
    headers: role ? { "X-MrMilk-Role": role } : undefined,
    signal,
  });
  return parseApiResponse(response);
}

/**
 * Commit an append upload with a chosen overlap strategy.
 *   strategy: 'skip'    — keep existing rows on collision (safe default)
 *             'replace' — overwrite existing rows with the new file's version
 */
export async function commitSalesAppend({ file, role, strategy = "skip", confirmPartial = false }) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("strategy", strategy);
  // Required to override the partial-export guard (e.g. a hub-filtered file).
  formData.append("confirm_partial", confirmPartial ? "true" : "false");
  const response = await apiFetch("/api/imports/sales/append", {
    method: "POST",
    body: formData,
    headers: {
      "X-MrMilk-Role": role,
    },
  });
  return parseApiResponse(response);
}

/**
 * Fetch the live aggregated business summary from the backend.
 * Returns the same shape as the hardcoded DATA object in mrmilk-ai.jsx
 * so the workspace can swap it in directly.
 */
export async function fetchCustomerSummary(signal) {
  const response = await apiFetch("/api/customers/summary", {
    method: "GET",
    signal,
  });
  return parseApiResponse(response);
}

/**
 * Fetch the full customer record list from the live snapshot.
 * Returns { snapshot_id, records: [...] } where each record matches
 * the normalizeCustomerRecord shape used by the workspace.
 */
export async function fetchCustomerRecords(signal) {
  const response = await apiFetch("/api/customers/records", {
    method: "GET",
    signal,
  });
  return parseApiResponse(response);
}

/**
 * Distinct product + weight combos from the live sales dataset, for the
 * Daily Product Sales picker. Returns { products: [...], dataset: {...} }.
 */
export async function fetchSalesProducts(signal) {
  const response = await apiFetch("/api/sales/products", {
    method: "GET",
    signal,
  });
  return parseApiResponse(response);
}

/**
 * Continuous per-day sales for one product over a date window.
 * Returns { product, weight, status, start, end, days: [...], summary, dataset }.
 * `days` is a complete calendar — every day in range is present (zero-filled
 * when there were no sales) so it charts and exports cleanly.
 */
export async function fetchDailyProductSales(
  { product, weight = "", hub = "", start = "", end = "", status = "delivered" } = {},
  signal,
) {
  const params = new URLSearchParams({ product });
  if (weight) params.set("weight", weight);
  if (hub) params.set("hub", hub);
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  if (status) params.set("status", status);
  const response = await apiFetch(`/api/sales/daily?${params.toString()}`, {
    method: "GET",
    signal,
  });
  return parseApiResponse(response);
}

/**
 * Per-hub split for one product over a date window. Returns
 * { hubs: [{hub, units, revenue, share_units, avg_units_per_day, ...}],
 *   dates: [...], units_by_hub: { hub: [...] }, total_units, total_revenue }.
 */
export async function fetchSalesByHub(
  { product, weight = "", start = "", end = "", status = "delivered" } = {},
  signal,
) {
  const params = new URLSearchParams({ product });
  if (weight) params.set("weight", weight);
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  if (status) params.set("status", status);
  const response = await apiFetch(`/api/sales/by-hub?${params.toString()}`, {
    method: "GET",
    signal,
  });
  return parseApiResponse(response);
}

/**
 * Tidy daily sales split by hub — one record per (date, hub). Returns
 * { records: [{date, hub, units, delivered, revenue, lines, customers}], ... }.
 * Used to build the filterable per-hub Daily sheet in the Excel export.
 */
export async function fetchSalesDailyByHub(
  { product, weight = "", start = "", end = "", status = "delivered" } = {},
  signal,
) {
  const params = new URLSearchParams({ product });
  if (weight) params.set("weight", weight);
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  if (status) params.set("status", status);
  const response = await apiFetch(`/api/sales/daily-by-hub?${params.toString()}`, {
    method: "GET",
    signal,
  });
  return parseApiResponse(response);
}

/**
 * Neighbour-referral worklist: buildings where a loyal customer is the only
 * one ordering. Returns { opportunities, summary, excluded_customers,
 * criteria, hubs, areas }.
 *
 * `excluded_customers` matters — coordinates that disagree with their area's
 * GPS consensus are dropped rather than ranked, so the list is deliberately
 * shorter than the full customer book.
 */
export async function fetchReferralOpportunities(
  { minDeliveries = 30, maxInBuilding = 1, hub = "", area = "", limit = 200 } = {},
  signal,
) {
  const params = new URLSearchParams();
  params.set("min_deliveries", String(minDeliveries));
  params.set("max_in_building", String(maxInBuilding));
  if (hub) params.set("hub", hub);
  if (area) params.set("area", area);
  params.set("limit", String(limit));
  const response = await apiFetch(`/api/sales/referrals?${params.toString()}`, {
    method: "GET",
    signal,
  });
  return parseApiResponse(response);
}

/**
 * Delivery coordinates aggregated into heat-map points for a date window.
 * Returns { points: [[lat, lng, revenue, deliveries, units, customers], ...],
 *   point_schema, totals, coverage, excluded, hubs, dataset }.
 *
 * `coverage` matters: only ~2/3 of delivery rows carry coordinates, so the map
 * is a sample, not the full book — always show coverage alongside it.
 * `excluded` reports rows dropped for sitting outside the Pune/PCMC bbox
 * (a known bad-GPS cluster near Delhi).
 */
export async function fetchSalesGeoHeatmap(
  { start = "", end = "", hub = "", status = "delivered", windowDays = 90 } = {},
  signal,
) {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  if (hub) params.set("hub", hub);
  if (status) params.set("status", status);
  if (windowDays) params.set("window_days", String(windowDays));
  const response = await apiFetch(`/api/sales/geo-heatmap?${params.toString()}`, {
    method: "GET",
    signal,
  });
  return parseApiResponse(response);
}

/**
 * Streaming notebook chat. Opens an SSE connection to /api/chat/notebook/stream
 * and calls `onEvent({event, data})` for every event as it arrives — so the UI
 * can show a live Deepnote-style execution trail.
 *
 * Resolves when the stream ends (either `done` or `error` was received, or the
 * connection closed). The returned promise rejects on network failure only.
 *
 * Note: we use fetch + ReadableStream (not EventSource) because EventSource
 * is GET-only and doesn't let us POST the question body.
 */
export async function streamChatNotebook({ question, history = [], model = null, onEvent, signal } = {}) {
  const response = await apiFetch("/api/chat/notebook/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "text/event-stream",
    },
    body: JSON.stringify({
      question,
      history: history.map((m) => ({ role: m.role, content: String(m.content || "") })),
      model,
    }),
    signal,
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      detail = payload?.detail || detail;
    } catch (_) { /* ignore body parse error */ }
    const err = new Error(detail);
    err.status = response.status;
    throw err;
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Stream not supported in this environment.");
  const decoder = new TextDecoder();
  let buffer = "";

  const emit = (eventName, rawData) => {
    if (!onEvent) return;
    let parsed = rawData;
    try { parsed = JSON.parse(rawData); } catch (_) { /* leave as string */ }
    onEvent({ event: eventName, data: parsed });
  };

  // Parse SSE frames out of the buffer. Each frame is terminated by \n\n.
  // A frame contains one or more "<field>: <value>\n" lines.
  const drainBuffer = () => {
    let frameEnd;
    while ((frameEnd = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, frameEnd);
      buffer = buffer.slice(frameEnd + 2);
      let eventName = "message";
      const dataLines = [];
      for (const line of frame.split("\n")) {
        if (!line || line.startsWith(":")) continue; // blank or comment
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length > 0 || eventName !== "message") {
        emit(eventName, dataLines.join("\n"));
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    drainBuffer();
  }
  // flush any trailing frame
  buffer += "\n\n";
  drainBuffer();
}

/**
 * Notebook-style chat: calls the backend Gemini-tool-use agent and returns
 * a list of .deepnote-schema blocks (text / big_number / sql / table / chart / input).
 * This is the live-DB-grounded chat; every number comes from a real SQL query.
 */
export async function fetchChatNotebook({ question, history = [], model = null, signal } = {}) {
  const response = await apiFetch("/api/chat/notebook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      history: history.map((m) => ({ role: m.role, content: String(m.content || "") })),
      model,
    }),
    signal,
  });
  return parseApiResponse(response);
}

/**
 * Send a chat message through the backend LLM proxy.
 * The backend uses the configured API key (GEMINI_API_KEY etc. from .env).
 * Pass apiKeyOverride to use a client-supplied key instead.
 */
export async function proxyChat({ provider, model, instructions, inputText, history = [], apiKeyOverride = "" }) {
  const headers = { "Content-Type": "application/json" };
  if (apiKeyOverride && apiKeyOverride.trim()) {
    headers["X-LLM-Api-Key"] = apiKeyOverride.trim();
  }

  const response = await apiFetch("/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify({
      provider,
      model,
      instructions,
      input_text: inputText,
      history,
    }),
  });
  return parseApiResponse(response);
}
