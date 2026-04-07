const LOCAL_AUDIT_KEY = "mrmilk_chat_audit_buffer";
const MAX_BUFFERED_AUDITS = 250;

const toText = (value) => value == null ? "" : String(value).trim();

const generateTraceId = () => {
  const seed = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `mrmilk-trace-${seed}`;
};

const readBufferedAudits = () => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_AUDIT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeBufferedAudits = (items = []) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(items.slice(-MAX_BUFFERED_AUDITS)));
  } catch {
    // Ignore storage quota failures.
  }
};

export const captureChatAudit = async (payload = {}) => {
  const traceId = generateTraceId();
  const envelope = {
    trace_id: traceId,
    captured_at: new Date().toISOString(),
    source: "mrmilk-ai-chat",
    ...payload
  };

  const buffered = readBufferedAudits();
  writeBufferedAudits([...buffered, envelope]);

  const proxyUrl = toText(import.meta.env.VITE_LANGFUSE_PROXY_URL);
  if (!proxyUrl) {
    return { traceId, status: "local_buffer_only" };
  }

  try {
    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope)
    });
    return {
      traceId,
      status: response.ok ? "proxy_queued" : `proxy_failed_${response.status}`
    };
  } catch {
    return { traceId, status: "proxy_failed_network" };
  }
};

export const getBufferedChatAudits = () => readBufferedAudits();
