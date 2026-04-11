const DEFAULT_API_BASE = "http://127.0.0.1:8100";

export function getApiBaseUrl() {
  const env = import.meta.env.VITE_API_BASE_URL;
  // undefined = local dev (separate ports) → use default
  // empty string = same-origin production (FastAPI serves frontend too)
  // explicit URL = separate deploy (e.g. Railway)
  if (env === undefined) return DEFAULT_API_BASE;
  return env.replace(/\/$/, "");
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

export async function fetchImportHistory(signal) {
  const response = await fetch(`${getApiBaseUrl()}/api/imports/history`, {
    method: "GET",
    signal,
  });
  return parseApiResponse(response);
}

export async function profileImportFile(file, signal) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${getApiBaseUrl()}/api/imports/profile`, {
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

  const response = await fetch(`${getApiBaseUrl()}/api/imports`, {
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
  const response = await fetch(`${getApiBaseUrl()}/api/customers/summary`, {
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
  const response = await fetch(`${getApiBaseUrl()}/api/customers/records`, {
    method: "GET",
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

  const response = await fetch(`${getApiBaseUrl()}/api/chat`, {
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
