// MrMilk AI x Pomelli Bridge - background.js (Service Worker)
// Owns job orchestration and final delivery back to the bridge server.

const BRIDGE_URL = "http://localhost:3456";
const POMELLI_URL = "https://labs.google.com/pomelli";
const APP_URL = "http://localhost:5000";
const POLL_INTERVAL_MS = 3000;
const REQUEST_TIMEOUT_MS = 10000;
const GENERATION_TIMEOUT_MS = 240000;

let activePomelliTabId = null;
let activeJobId = null;
let pendingPollTimer = null;

function log(message, data = "") {
  console.log(`🥛 [MrMilk BG] ${message}`, data);
}

function err(message, error = "") {
  console.error(`❌ [MrMilk BG] ${message}`, error);
}

async function setStorage(key, value) {
  return chrome.storage.local.set({ [key]: value });
}

function broadcastState(state) {
  chrome.runtime.sendMessage({ type: "STATE_UPDATE", state }).catch(() => {});
}

async function fetchJson(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}${payload?.error ? `: ${payload.error}` : ""}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function postBridgeResult(jobId, payload) {
  return fetchJson(
    `${BRIDGE_URL}/result`,
    {
      method: "POST",
      body: JSON.stringify({ jobId, ...payload })
    },
    REQUEST_TIMEOUT_MS
  );
}

async function pollForPendingJob() {
  if (activeJobId) return;
  try {
    const job = await fetchJson(`${BRIDGE_URL}/pending`, { method: "GET" }, 5000);
    if (!job || job.status === "idle" || !job.jobId) return;

    log(`New job found: ${job.jobId}`);
    activeJobId = job.jobId;
    await setStorage("lastJob", {
      jobId: job.jobId,
      prompt: job.prompt,
      campaignType: job.campaignType,
      timestamp: new Date().toISOString(),
      status: "opening_pomelli"
    });
    broadcastState({ status: "opening_pomelli", jobId: job.jobId, campaignType: job.campaignType });
    await openPomelliAndRun(job);
  } catch {
    // Bridge server offline or busy; keep polling silently.
  }
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 1800);
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId, (tab) => {
      if (tab?.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 1800);
      }
    });
  });
}

async function resolvePomelliTab() {
  const tabs = await chrome.tabs.query({ url: "https://labs.google.com/pomelli*" });

  if (tabs.length > 0) {
    const tab = tabs[0];
    activePomelliTabId = tab.id;
    await chrome.tabs.update(tab.id, { url: POMELLI_URL, active: true });
    log(`Reusing Pomelli tab ${tab.id}`);
    await waitForTabLoad(tab.id);
    return chrome.tabs.get(tab.id);
  }

  const tab = await chrome.tabs.create({ url: POMELLI_URL, active: true });
  activePomelliTabId = tab.id;
  log(`Created new Pomelli tab ${tab.id}`);
  await waitForTabLoad(tab.id);
  return tab;
}

async function showDeliveryBadge(tabId, kind, message) {
  if (!tabId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: renderBridgeBadge,
      args: [kind, message]
    });
  } catch (badgeError) {
    err("Failed to render delivery badge", badgeError);
  }
}

async function openPomelliAndRun(job) {
  try {
    const tab = await resolvePomelliTab();
    broadcastState({ status: "generating", jobId: job.jobId, campaignType: job.campaignType });
    await setStorage("lastJob", {
      jobId: job.jobId,
      prompt: job.prompt,
      campaignType: job.campaignType,
      timestamp: new Date().toISOString(),
      status: "generating"
    });

    log(`Injecting Pomelli workflow for job ${job.jobId}`);
    const execution = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: runPomelliWorkflow,
      args: [job.prompt, job.jobId, GENERATION_TIMEOUT_MS]
    });

    const delivery = execution?.[0]?.result;
    if (!delivery || delivery.status === "error") {
      throw new Error(delivery?.error || "Pomelli workflow returned no result");
    }

    await postBridgeResult(job.jobId, delivery);

    const lastResult = {
      ...delivery,
      jobId: job.jobId,
      campaignType: job.campaignType,
      receivedAt: new Date().toISOString()
    };

    await setStorage("lastJob", {
      jobId: job.jobId,
      prompt: job.prompt,
      campaignType: job.campaignType,
      timestamp: new Date().toISOString(),
      status: "complete"
    });
    await setStorage("lastResult", lastResult);

    broadcastState({
      status: "complete",
      jobId: job.jobId,
      captions: delivery.captions,
      assetUrls: delivery.assetUrls,
      creativeItems: delivery.creativeItems
    });
    await showDeliveryBadge(tab.id, "success", "Delivered to MrMilk AI");
    log(`Result complete for job ${job.jobId}`);
  } catch (workflowError) {
    err(`Pomelli workflow failed for ${job.jobId}`, workflowError);
    await postErrorResult(job.jobId, workflowError.message || "Pomelli delivery failed");
    await showDeliveryBadge(activePomelliTabId, "error", "Delivery failed");
  } finally {
    activeJobId = null;
  }
}

async function postErrorResult(jobId, errorMessage) {
  try {
    await postBridgeResult(jobId, {
      status: "error",
      error: errorMessage,
      timestamp: new Date().toISOString()
    });
  } catch (postError) {
    err(`Failed to post error result for ${jobId}`, postError);
  }

  await setStorage("lastJob", {
    jobId,
    timestamp: new Date().toISOString(),
    status: "error"
  });
  broadcastState({ status: "error", jobId, error: errorMessage });
}

function renderBridgeBadge(kind, message) {
  const badgeId = "mrmilk-bridge-badge";
  document.getElementById(badgeId)?.remove();

  const badge = document.createElement("div");
  badge.id = badgeId;
  badge.style.cssText = [
    "position:fixed",
    "bottom:24px",
    "right:24px",
    "z-index:99999",
    "padding:12px 20px",
    "border-radius:12px",
    "font-family:DM Sans, sans-serif",
    "font-size:14px",
    "font-weight:700",
    "box-shadow:0 14px 34px rgba(0,0,0,0.28)",
    "display:flex",
    "align-items:center",
    "gap:10px",
    "transition:opacity 200ms ease"
  ].join(";");
  badge.style.background = kind === "success" ? "#1a3a16" : "#8b1e1e";
  badge.style.color = "#ffffff";
  badge.innerHTML = `<span style="font-size:18px">${kind === "success" ? "✓" : "!"}</span><span>${message}</span>`;
  document.body.appendChild(badge);
  setTimeout(() => {
    badge.style.opacity = "0";
    setTimeout(() => badge.remove(), 200);
  }, 3200);
}

function runPomelliWorkflow(prompt, jobId, timeoutMs) {
  const TAG = "🎨 [MrMilk Pomelli]";
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const INPUT_SELECTORS = [
    'textarea[placeholder*="campaign" i]',
    'textarea[placeholder*="prompt" i]',
    'textarea[placeholder*="describe" i]',
    'textarea[placeholder*="create" i]',
    'textarea[placeholder*="what" i]',
    'input[placeholder*="campaign" i]',
    '[role="textbox"]',
    "textarea",
    'input[type="text"]'
  ];
  const BUTTON_SELECTORS = [
    'button[type="submit"]',
    'button[aria-label*="generate" i]',
    'button[aria-label*="create" i]',
    'button[aria-label*="campaign" i]',
    'button[aria-label*="submit" i]',
    '[data-testid*="submit"]',
    '[data-testid*="generate"]',
    'form button:last-of-type'
  ];
  const GENERIC_TEXT_PATTERNS = [
    /^campaign$/i,
    /^back to campaigns$/i,
    /^add creative$/i,
    /^business dna$/i,
    /^photoshoot$/i,
    /^delete$/i,
    /^edit$/i,
    /^generate more$/i
  ];

  function isVisible(element) {
    if (!element || !(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function textLooksGeneric(text) {
    return GENERIC_TEXT_PATTERNS.some((pattern) => pattern.test(text));
  }

  function findElement(selectors) {
    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        if (element) return { element, selector };
      } catch {}
    }
    return null;
  }

  function findGenerateButton() {
    const direct = findElement(BUTTON_SELECTORS);
    if (direct) return direct;

    const buttons = Array.from(document.querySelectorAll("button, [role='button']"));
    const fallback = buttons.find((button) => /generate|create|campaign|submit|continue|next/i.test(normalizeText(button.innerText)));
    return fallback ? { element: fallback, selector: "text-match" } : null;
  }

  function setReactValue(element, value) {
    try {
      const proto = element.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (nativeSetter) {
        nativeSetter.call(element, value);
      } else {
        element.value = value;
      }
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
      return true;
    } catch (error) {
      console.warn(TAG, "setValue failed", error);
      return false;
    }
  }

  function extractNearestLabel(element, fallback) {
    const textCandidates = [
      element.getAttribute?.("alt"),
      element.getAttribute?.("aria-label"),
      element.closest?.("figure, article, li, section, div")?.innerText
    ].filter(Boolean).map((value) => normalizeText(value));
    const label = textCandidates.find((value) => value && !textLooksGeneric(value) && value.length <= 120);
    return label || fallback;
  }

  function urlFromNode(node) {
    if (node.tagName === "IMG") return node.currentSrc || node.src || "";
    if (node.tagName === "SOURCE") return node.src || "";
    if (node.tagName === "VIDEO") return node.poster || node.currentSrc || node.src || "";
    if (node.tagName === "A") return node.href || "";

    const bg = node.style?.backgroundImage || window.getComputedStyle(node).backgroundImage;
    const match = /url\(["']?(.*?)["']?\)/.exec(bg || "");
    return match?.[1] || "";
  }

  function shouldKeepAsset(url, node) {
    if (!url) return false;
    if (!/^https?:\/\//i.test(url) && !/^blob:/i.test(url)) return false;

    const lowered = url.toLowerCase();
    const interestingUrl = /(googleusercontent|gstatic|\.png|\.jpg|\.jpeg|\.webp|\.gif|\.mp4|\.mov|\.webm)(\?|$)/.test(lowered);
    const rect = node.getBoundingClientRect?.() || { width: 0, height: 0 };
    const largeEnough = rect.width >= 140 || rect.height >= 140;
    return interestingUrl || largeEnough;
  }

  function collectCreativeItems() {
    const seen = new Set();
    const items = [];
    const nodes = Array.from(document.querySelectorAll("img[src], source[src], video[src], video[poster], a[href], [style*='background-image']"));

    nodes.forEach((node, index) => {
      const url = normalizeText(urlFromNode(node));
      if (!shouldKeepAsset(url, node) || seen.has(url)) return;
      seen.add(url);
      const type = /\.(mp4|mov|webm)(\?|$)/i.test(url) || node.tagName === "VIDEO" ? "video" : "image";
      items.push({
        id: `${index}-${url}`,
        url,
        type,
        label: extractNearestLabel(node, `Creative ${items.length + 1}`)
      });
    });

    return items.slice(0, 12);
  }

  function collectCaptions() {
    const seen = new Set();
    const captions = [];
    const nodes = Array.from(document.querySelectorAll("h1, h2, h3, h4, p, div, span, button"));

    nodes.forEach((node) => {
      if (!isVisible(node)) return;
      const text = normalizeText(node.innerText);
      if (!text || text.length < 24 || text.length > 420 || textLooksGeneric(text) || seen.has(text)) return;
      if (/^https?:\/\//i.test(text)) return;
      seen.add(text);
      captions.push(text);
    });

    return captions.slice(0, 20);
  }

  function buildPayload() {
    const creativeItems = collectCreativeItems();
    const captions = collectCaptions();
    return {
      status: "complete",
      captions,
      assetUrls: creativeItems.map((item) => item.url),
      creativeItems,
      rawHtml: document.documentElement.outerHTML.slice(0, 600000),
      pageUrl: window.location.href,
      pageTitle: document.title,
      promptUsed: prompt,
      timestamp: new Date().toISOString(),
      debug: {
        jobId,
        path: window.location.pathname,
        captionCount: captions.length,
        creativeCount: creativeItems.length
      }
    };
  }

  function isCaptureReady() {
    const creativeItems = collectCreativeItems();
    const captions = collectCaptions();
    const onCampaignPage = window.location.pathname.includes("/campaigns/");
    const hasAddCreative = Array.from(document.querySelectorAll("button, [role='button']")).some((node) => /add creative/i.test(normalizeText(node.innerText)));

    if (onCampaignPage && (creativeItems.length >= 2 || hasAddCreative)) return true;
    if (creativeItems.length >= 4) return true;
    if (onCampaignPage && captions.length >= 3) return true;
    return false;
  }

  async function waitForCaptureReady() {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (isCaptureReady()) {
        await sleep(1800);
        if (isCaptureReady()) {
          return buildPayload();
        }
      }
      await sleep(1500);
    }

    const fallback = buildPayload();
    if (fallback.creativeItems.length || fallback.captions.length) {
      return fallback;
    }
    throw new Error("Pomelli final campaign page was not detected before timeout.");
  }

  async function ensurePromptSubmitted() {
    let foundInput = null;
    let foundSelector = "";
    let attempts = 0;

    while (!foundInput && attempts < 24) {
      const found = findElement(INPUT_SELECTORS);
      if (found) {
        foundInput = found.element;
        foundSelector = found.selector;
        break;
      }
      await sleep(1500);
      attempts += 1;
    }

    if (!foundInput) {
      throw new Error("Pomelli input field not found. Pomelli may be on a different screen.");
    }

    console.log(TAG, "Found input via", foundSelector);
    foundInput.focus();
    await sleep(250);
    const valueSet = setReactValue(foundInput, prompt);
    if (!valueSet) {
      throw new Error("Failed to set prompt value in Pomelli.");
    }

    await sleep(900);
    const button = findGenerateButton();
    if (button?.element) {
      console.log(TAG, "Clicking generate via", button.selector);
      button.element.click();
      return;
    }

    console.warn(TAG, "Generate button not found. Falling back to Enter.");
    foundInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
    foundInput.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", keyCode: 13, bubbles: true }));
  }

  return (async () => {
    try {
      console.log(TAG, "Starting workflow for", jobId);
      await ensurePromptSubmitted();
      return await waitForCaptureReady();
    } catch (error) {
      console.error(TAG, "Workflow failed", error);
      return {
        status: "error",
        error: error.message || "Pomelli workflow failed",
        timestamp: new Date().toISOString(),
        pageUrl: window.location.href,
        pageTitle: document.title,
        rawHtml: document.documentElement.outerHTML.slice(0, 200000)
      };
    }
  })();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_STATE") {
    chrome.storage.local.get(["lastJob", "lastResult"], (data) => {
      sendResponse({ lastJob: data.lastJob, lastResult: data.lastResult, activeJobId });
    });
    return true;
  }

  if (message.type === "OPEN_POMELLI") {
    chrome.tabs.create({ url: POMELLI_URL, active: true });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "OPEN_APP") {
    chrome.tabs.create({ url: APP_URL, active: true });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "CLEAR_JOBS") {
    fetch(`${BRIDGE_URL}/jobs`, { method: "DELETE" }).catch(() => {});
    activeJobId = null;
    chrome.storage.local.remove(["lastJob", "lastResult"]);
    sendResponse({ ok: true });
    return true;
  }
});

function startPendingPoll() {
  clearInterval(pendingPollTimer);
  pendingPollTimer = setInterval(pollForPendingJob, POLL_INTERVAL_MS);
  log(`Background service started. Polling for jobs every ${POLL_INTERVAL_MS} ms`);
}

self.addEventListener("activate", () => {
  startPendingPoll();
});

startPendingPoll();
