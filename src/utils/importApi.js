const DEFAULT_API_BASE = "http://127.0.0.1:8100";

export function getApiBaseUrl() {
  const env = import.meta.env.VITE_API_BASE_URL;
  // local dev defaults to the separate FastAPI port.
  // production defaults to same-origin because FastAPI serves dist/ and /api.
  // explicit URL = separate deploy (e.g. Railway)
  if (env === undefined) return import.meta.env.PROD ? "" : DEFAULT_API_BASE;
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

// ----------------------------------------------------------------------
// Sales transactions import — parallel pipeline to customer master.
// Sales data is stored on disk as Parquet + CSV.gz (no Supabase rows).
// ----------------------------------------------------------------------
export async function fetchSalesStatus(signal) {
  const response = await fetch(`${getApiBaseUrl()}/api/imports/sales/status`, {
    method: "GET",
    signal,
  });
  return parseApiResponse(response);
}

export async function profileSalesFile(file, signal) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${getApiBaseUrl()}/api/imports/sales/profile`, {
    method: "POST",
    body: formData,
    signal,
  });
  return parseApiResponse(response);
}

export async function commitSalesFile({ file, role, confirmReplace }) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("confirm_replace", confirmReplace ? "true" : "false");
  const response = await fetch(`${getApiBaseUrl()}/api/imports/sales`, {
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
  const response = await fetch(`${getApiBaseUrl()}/api/chat/notebook/stream`, {
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
  const response = await fetch(`${getApiBaseUrl()}/api/chat/notebook`, {
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
