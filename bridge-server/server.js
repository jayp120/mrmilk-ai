import cors from "cors";
import express from "express";
import { validate as uuidValidate } from "uuid";

const app = express();
const PORT = 3456;
const HOST = "0.0.0.0";
const MAX_JOBS = 50;
const store = new Map();
const jobOrder = [];

const log = (icon, message, extra) => {
  if (extra !== undefined) {
    console.log(`🥛 [MrMilk Bridge] ${icon} ${message}`, extra);
    return;
  }
  console.log(`🥛 [MrMilk Bridge] ${icon} ${message}`);
};

const isLocalWebOrigin = (origin) => {
  try {
    const parsed = new URL(origin);
    const allowedHost =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(parsed.hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(parsed.hostname) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(parsed.hostname);
    const allowedProtocol = parsed.protocol === "http:" || parsed.protocol === "https:";
    return allowedHost && allowedProtocol;
  } catch {
    return false;
  }
};

const isPomelliOrigin = (origin) => {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "https:" && parsed.hostname === "labs.google.com";
  } catch {
    return false;
  }
};

const allowedOrigin = (origin) => {
  if (!origin) return true;
  if (isLocalWebOrigin(origin)) return true;
  if (isPomelliOrigin(origin)) return true;
  if (origin.startsWith("chrome-extension://")) return true;
  return false;
};

const corsOptions = {
  origin(origin, callback) {
    if (allowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    log("❌", `blocked CORS origin ${origin || "unknown"}`);
    callback(new Error("Origin not allowed by MrMilk Bridge CORS"));
  },
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
};

const evictIfNeeded = () => {
  while (jobOrder.length >= MAX_JOBS) {
    const oldestJobId = jobOrder.shift();
    if (!oldestJobId) continue;
    if (store.delete(oldestJobId)) {
      log("🧹", `evicted oldest job ${oldestJobId}`);
    }
  }
};

const pickPendingJob = () => {
  for (const jobId of jobOrder) {
    const job = store.get(jobId);
    if (job?.status === "pending") {
      return job;
    }
  }
  return null;
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "8mb" }));

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    brand: "MrMilk AI × Pomelli Bridge",
    message: "Bridge server is running. Use /health for status and /trigger to queue Pomelli jobs.",
    jobs: store.size
  });
});

app.post("/trigger", (req, res) => {
  const { prompt, campaignType, jobId, weeklyContext } = req.body || {};
  if (!prompt || !campaignType || !jobId || weeklyContext === undefined) {
    res.status(400).json({ success: false, error: "prompt, campaignType, jobId, and weeklyContext are required" });
    return;
  }
  if (!uuidValidate(jobId)) {
    res.status(400).json({ success: false, error: "jobId must be a valid uuid" });
    return;
  }
  if (store.has(jobId)) {
    res.status(409).json({ success: false, error: "jobId already exists" });
    return;
  }

  evictIfNeeded();
  const job = {
    jobId,
    prompt,
    campaignType,
    weeklyContext,
    status: "pending",
    createdAt: Date.now()
  };
  store.set(jobId, job);
  jobOrder.push(jobId);
  log("🚀", `triggered job ${jobId} for ${campaignType}`);
  res.json({ success: true, jobId, status: "queued" });
});

app.get("/pending", (_req, res) => {
  const job = pickPendingJob();
  if (!job) {
    res.json({ status: "idle" });
    return;
  }

  const processingJob = { ...job, status: "processing", fetchedAt: Date.now() };
  store.set(job.jobId, processingJob);
  log("🔍", `pending fetched for job ${job.jobId}`);
  res.json(processingJob);
});

app.post("/result", (req, res) => {
  const {
    jobId,
    captions,
    assetUrls,
    creativeItems,
    rawHtml,
    pageUrl,
    pageTitle,
    timestamp,
    promptUsed,
    status,
    error,
    debug
  } = req.body || {};
  if (!jobId || !status) {
    res.status(400).json({ success: false, error: "jobId and status are required" });
    return;
  }

  const existing = store.get(jobId);
  if (!existing) {
    res.status(404).json({ success: false, error: "job not found" });
    return;
  }

  const finalStatus = status === "error" ? "error" : "complete";
  const nextJob = {
    ...existing,
    captions,
    assetUrls,
    creativeItems,
    rawHtml,
    pageUrl,
    pageTitle,
    timestamp,
    promptUsed,
    error,
    debug,
    status: finalStatus,
    updatedAt: Date.now()
  };
  store.set(jobId, nextJob);
  log("📋", `result stored for ${jobId}`);
  log(finalStatus === "complete" ? "✅" : "❌", `${finalStatus} job ${jobId}`);
  res.json({ success: true });
});

app.get("/result/:jobId", (req, res) => {
  const job = store.get(req.params.jobId);
  if (!job) {
    res.json({ status: "not_found" });
    return;
  }

  if (job.status === "pending" || job.status === "processing") {
    res.json({ status: job.status });
    return;
  }

  res.json(job);
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    version: "1.0.0",
    brand: "MrMilk AI × Pomelli Bridge",
    jobs: store.size,
    timestamp: new Date().toISOString()
  });
});

app.delete("/jobs", (_req, res) => {
  const count = store.size;
  store.clear();
  jobOrder.length = 0;
  log("🧹", `cleared ${count} jobs`);
  res.json({ cleared: true, count });
});

const server = app.listen(PORT, HOST, () => {
  log("🟢", `started on http://localhost:${PORT}`);
});

const shutdown = () => {
  log("🛑", "Bridge server shutting down");
  server.close(() => process.exit(0));
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
