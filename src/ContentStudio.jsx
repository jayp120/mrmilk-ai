import React, { useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths
} from "date-fns";
import { CONFIG } from "./config.js";
import { CAMPAIGN_TEMPLATES } from "./data/campaignTemplates.js";
import { FESTIVALS } from "./data/festivalCalendar.js";
import useFreshnessContext from "./hooks/useFreshnessContext.js";
import { usePomelliBridge } from "./hooks/usePomelliBridge.js";
import { buildPromptFromTemplate, summarizePrompt } from "./utils/promptBuilder.js";

const BRAND = CONFIG.BRAND;
const CALENDAR_STORAGE_KEY = "mrmilk_content_calendar_v1";
const HISTORY_STORAGE_KEY = "mrmilk_pomelli_history_v1";
const DEFAULT_PLATFORMS = { instagram: true, facebook: false, whatsapp: true };
const PLATFORM_OPTIONS = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "whatsapp", label: "WhatsApp" }
];
const STATUS_STEPS = [
  { key: "sending", label: "Sending to bridge server" },
  { key: "opening_pomelli", label: "Opening Pomelli tab" },
  { key: "generating", label: "Pomelli generating your campaign" },
  { key: "complete", label: "Receiving content back" }
];
const BUTTON = {
  cursor: "pointer",
  borderRadius: 12,
  transition: "all 200ms ease",
  fontFamily: "'DM Sans', sans-serif",
  fontWeight: 700
};

const readStorage = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.log("🥛 [Content Studio] localStorage read failed", { key, error });
    return fallback;
  }
};

const writeStorage = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.log("🥛 [Content Studio] localStorage write failed", { key, error });
  }
};

const CAPTION_BLOCKLIST = [
  /google[\s_-]?labs/i,
  /pomelli/i,
  /experiment/i,
  /right[_\s-]?panel/i,
  /business dna/i,
  /smart[_\s-]?campaign/i,
  /photoshoot/i,
  /aspect[_\s-]?ratio/i,
  /arrow[_\s-]?drop[_\s-]?down/i,
  /auto[_\s-]?awesome/i,
  /generate ideas/i,
  /shopping[_\s-]?bag/i,
  /product image/i,
  /close sidebar/i,
  /campaigns? start from/i,
  /double-?check/i,
  /campaigns?\b/i,
  /genetics/i
];

const CAPTION_PRIORITY = /mr\.?\s*milk|a2|milk|ghee|paneer|dahi|butter\s?milk|subscription|wallet|delivery|farm|human hands|gir|sahiwal|bilona|pause|resume|fresh|door/i;

const flattenCaptionValue = (value) => {
  if (Array.isArray(value)) return value.flatMap((item) => flattenCaptionValue(item));
  if (typeof value === "string") return value.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  if (value && typeof value === "object") return Object.values(value).flatMap((item) => flattenCaptionValue(item));
  return [];
};

const cleanCaptionCandidate = (value) => {
  const text = String(value || "").replace(/\s+/g, " ").replace(/[_]+/g, " ").trim();
  if (!text || text.length < 12 || text.length > 220) return "";
  if (CAPTION_BLOCKLIST.some((pattern) => pattern.test(text))) return "";
  const words = text.split(/\s+/);
  if (words.length < 3 || words.length > 24) return "";
  const alphaCharacters = (text.match(/[A-Za-z]/g) || []).length;
  if (alphaCharacters < Math.max(8, Math.floor(text.length * 0.45))) return "";
  return text;
};

const rankCaptionCandidate = (text) => {
  let score = 0;
  if (CAPTION_PRIORITY.test(text)) score += 4;
  if (/[.!?]$/.test(text)) score += 1;
  if (/[A-Z]{2,}/.test(text)) score += 1;
  if (/[0-9]/.test(text)) score += 0.5;
  score += Math.min(text.length / 120, 1.2);
  return score;
};

const normalizeCaptions = (value) => {
  const cleaned = flattenCaptionValue(value)
    .map((item) => cleanCaptionCandidate(item))
    .filter(Boolean);

  const deduped = cleaned.filter((text, index, list) => (
    list.findIndex((candidate) => candidate.toLowerCase() === text.toLowerCase()) === index
    && !list.some((other, otherIndex) => otherIndex !== index && other.length > text.length && other.includes(text))
  ));

  return deduped
    .sort((left, right) => rankCaptionCandidate(right) - rankCaptionCandidate(left))
    .slice(0, 4);
};

const normalizeAssetUrls = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (typeof value === "string") return value ? [value] : [];
  if (value && typeof value === "object") return Object.values(value).map((item) => String(item || "").trim()).filter(Boolean);
  return [];
};

const normalizeCreativeItems = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!item) return null;
      if (typeof item === "string") {
        return { id: `${index}-${item}`, url: item, type: "image", label: `Creative ${index + 1}` };
      }
      const url = String(item.url || item.src || "").trim();
      if (!url) return null;
      const nextType = String(item.type || "").trim().toLowerCase();
      return {
        id: item.id || `${index}-${url}`,
        url,
        type: nextType === "video" ? "video" : "image",
        label: String(item.label || `Creative ${index + 1}`)
      };
    })
    .filter(Boolean);
};

const extractCreativeItems = (payload) => {
  const structured = normalizeCreativeItems(payload?.creativeItems);
  if (structured.length) return structured;

  const candidates = new Set(normalizeAssetUrls(payload?.assetUrls));
  if (typeof window !== "undefined" && payload?.rawHtml) {
    try {
      const doc = new window.DOMParser().parseFromString(payload.rawHtml, "text/html");
      doc.querySelectorAll("img[src], source[src], a[href]").forEach((node) => {
        const nextUrl = node.getAttribute("src") || node.getAttribute("href");
        if (!nextUrl) return;
        if (/^https?:\/\//i.test(nextUrl)) candidates.add(nextUrl);
      });
    } catch (error) {
      console.log("🥛 [Content Studio] creative extraction failed", error);
    }
  }
  return Array.from(candidates).map((url, index) => {
    const lower = url.toLowerCase();
    const isVideo = /\.(mp4|mov|webm)(\?|$)/.test(lower);
    return {
      id: `${index}-${url}`,
      url,
      type: isVideo ? "video" : "image",
      label: `Creative ${index + 1}`
    };
  });
};

const truncateText = (value, maxLength = 220) => {
  const text = String(value || "").trim();
  return text.length <= maxLength ? text : `${text.slice(0, maxLength).trim()}...`;
};

const buildWhatsAppDraft = (campaignName, captions, freshness) => {
  if (captions.length) {
    return `${captions.slice(0, 2).join("\n")}\n\n${freshness.whatsappSuffix}`;
  }
  return `Mr. Milk | ${campaignName}\nPure A2 dairy from Mittal Dairy Farms, delivered fresh to your home.\n\n${freshness.whatsappSuffix}`;
};

const formatElapsed = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const buildFestivalMap = () => {
  const map = {};
  FESTIVALS.forEach((festival) => {
    if (festival.date) map[festival.date] = festival;
  });
  return map;
};

const getSeasonalFestivalForDate = (date) => {
  const month = date.getMonth();
  return FESTIVALS.find((festival) => festival.startMonth != null && festival.endMonth != null && month >= festival.startMonth && month <= festival.endMonth) || null;
};

const buildMonthCells = (monthDate, calendarEntries, festivalMap) => {
  const start = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 });
  const cells = [];
  let cursor = start;
  while (cursor <= end) {
    const iso = format(cursor, "yyyy-MM-dd");
    cells.push({
      date: cursor,
      iso,
      inMonth: isSameMonth(cursor, monthDate),
      entry: calendarEntries[iso] || null,
      festival: festivalMap[iso] || null
    });
    cursor = addDays(cursor, 1);
  }
  return cells;
};

const getStepState = (jobStatus, stepKey) => {
  const order = ["sending", "opening_pomelli", "generating", "complete"];
  const currentIndex = order.indexOf(jobStatus);
  const stepIndex = order.indexOf(stepKey);
  if (jobStatus === "error") return stepKey === "generating" || stepKey === "complete" ? "error" : stepIndex < 2 ? "done" : "waiting";
  if (currentIndex === -1) return "waiting";
  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return jobStatus === "complete" ? "done" : "active";
  return "waiting";
};

const copyToClipboard = async (text) => {
  if (!navigator?.clipboard?.writeText) throw new Error("Clipboard unavailable");
  await navigator.clipboard.writeText(text);
};

export default function ContentStudio() {
  const freshness = useFreshnessContext();
  const { sendToPomelli, jobId, jobStatus, result, isConnected, error, elapsedSeconds, cancelJob } = usePomelliBridge();

  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [calendarEntries, setCalendarEntries] = useState(() => readStorage(CALENDAR_STORAGE_KEY, {}));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOutputOpen, setIsOutputOpen] = useState(false);
  const [showIdeaPicker, setShowIdeaPicker] = useState(false);
  const [activeCampaignMeta, setActiveCampaignMeta] = useState(null);
  const [deliveries, setDeliveries] = useState(() => readStorage(HISTORY_STORAGE_KEY, []));
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [scheduleDate, setScheduleDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedPlatforms, setSelectedPlatforms] = useState(DEFAULT_PLATFORMS);
  const [copyState, setCopyState] = useState({});
  const [bridgeCommandCopied, setBridgeCommandCopied] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [assetChecklist, setAssetChecklist] = useState({ instagramSquare: false, facebookCover: false, storyFormat: false });
  const [jobNotes, setJobNotes] = useState("");

  useEffect(() => { writeStorage(CALENDAR_STORAGE_KEY, calendarEntries); }, [calendarEntries]);
  useEffect(() => {
    if (jobStatus === "complete" && result) {
      setIsModalOpen(false);
      setIsOutputOpen(true);
      setScheduleDate(format(new Date(), "yyyy-MM-dd"));
    }
  }, [jobStatus, result]);
  useEffect(() => { writeStorage(HISTORY_STORAGE_KEY, deliveries); }, [deliveries]);
  useEffect(() => {
    if (!jobId) return;
    setAssetChecklist(readStorage(`mrmilk_pomelli_assets_${jobId}`, { instagramSquare: false, facebookCover: false, storyFormat: false }));
    setJobNotes(readStorage(`mrmilk_pomelli_notes_${jobId}`, ""));
  }, [jobId]);
  useEffect(() => { if (jobId) writeStorage(`mrmilk_pomelli_assets_${jobId}`, assetChecklist); }, [assetChecklist, jobId]);
  useEffect(() => { if (jobId) writeStorage(`mrmilk_pomelli_notes_${jobId}`, jobNotes); }, [jobId, jobNotes]);

  const campaigns = useMemo(() => CAMPAIGN_TEMPLATES.map((template) => {
    const prompt = buildPromptFromTemplate(template, freshness);
    return { ...template, prompt, promptPreview: summarizePrompt(prompt) };
  }), [freshness]);
  const activeResult = selectedDelivery?.result || result;
  const activeCampaignName = selectedDelivery?.campaignName || activeCampaignMeta?.campaignName || "Mr. Milk Campaign";
  const captions = useMemo(() => normalizeCaptions(activeResult?.captions), [activeResult]);
  const assetUrls = useMemo(() => normalizeAssetUrls(activeResult?.assetUrls), [activeResult]);
  const creativeItems = useMemo(() => extractCreativeItems(activeResult), [activeResult]);
  const whatsappVersion = useMemo(() => buildWhatsAppDraft(activeCampaignName, captions, freshness), [activeCampaignName, captions, freshness]);
  const activePomelliTitle = useMemo(() => {
    const nextTitle = String(activeResult?.pageTitle || "").trim();
    if (!nextTitle || /^campaign$/i.test(nextTitle)) return "";
    return nextTitle;
  }, [activeResult]);
  const deliveryTimestamp = selectedDelivery?.receivedAt || activeResult?.timestamp || "";
  const festivalMap = useMemo(() => buildFestivalMap(), []);
  const monthCells = useMemo(() => buildMonthCells(calendarMonth, calendarEntries, festivalMap), [calendarEntries, calendarMonth, festivalMap]);

  const selectedDate = parseISO(selectedCalendarDate);
  const selectedEntry = calendarEntries[selectedCalendarDate] || null;
  const selectedFestival = festivalMap[selectedCalendarDate] || null;
  const selectedSeasonalFestival = getSeasonalFestivalForDate(selectedDate);
  const selectedCalendarCampaign = selectedEntry ? campaigns.find((campaign) => campaign.id === selectedEntry.campaignId) || null : null;
  const modalCampaign = selectedCampaign || (activeCampaignMeta ? campaigns.find((campaign) => campaign.id === activeCampaignMeta.campaignId) : null) || null;
  const processing = ["sending", "opening_pomelli", "generating", "error", "server_offline"].includes(jobStatus);
  const bridgeCommand = "cd bridge-server && npm start";
  const isITTransferDate = selectedDate.getMonth() === 3 || selectedDate.getMonth() === 4;
  const isGaneshWindow = selectedDate.getMonth() === 7 || selectedDate.getMonth() === 8;
  const contextPills = [
    freshness.today,
    freshness.season,
    freshness.festival ? `${freshness.festival.name} in ${freshness.festival.daysAway} days` : null,
    `Focus area: ${freshness.targetArea}`,
    `Product hero: ${freshness.productHero}`
  ].filter(Boolean);

  const panel = { background: "#fff", border: "1px solid #eadfcd", borderRadius: 22, boxShadow: "0 18px 44px rgba(26,58,22,0.06)" };
  const primaryButton = { ...BUTTON, background: BRAND.colors.primary, border: "none", color: "#fff", padding: "11px 14px", fontSize: 13 };
  const ghostButton = { ...BUTTON, background: "#fff", border: "1px solid #d8c8b3", color: BRAND.colors.primary, padding: "10px 12px", fontSize: 12 };
  const statusCopy = {
    idle: "Ready to send",
    sending: "Sending to bridge",
    opening_pomelli: "Opening Pomelli",
    generating: "Pomelli generating",
    complete: "Campaign received",
    error: "Generation error",
    server_offline: "Bridge offline"
  };

  const flashCopy = async (key, text) => {
    try {
      await copyToClipboard(String(text || ""));
      setCopyState((prev) => ({ ...prev, [key]: true }));
      window.setTimeout(() => setCopyState((prev) => ({ ...prev, [key]: false })), 2000);
      return true;
    } catch (clipboardError) {
      console.log("🥛 [Content Studio] clipboard copy failed", { key, clipboardError });
      return false;
    }
  };

  const openCampaignModal = (campaign) => {
    console.log("🥛 [Content Studio] open campaign modal", campaign.id);
    setSelectedCampaign(campaign);
    setPromptDraft(campaign.prompt);
    setIsModalOpen(true);
    setSavedMessage("");
  };

  const addIdeaAndOpen = (campaign) => {
    setCalendarEntries((prev) => ({
      ...prev,
      [selectedCalendarDate]: { campaignId: campaign.id, campaignName: campaign.name, platforms: ["instagram"], notes: "", status: "idea", jobId: "" }
    }));
    setShowIdeaPicker(false);
    openCampaignModal(campaign);
  };

  const handleSend = async () => {
    if (!selectedCampaign) return;
    setActiveCampaignMeta({ campaignId: selectedCampaign.id, campaignName: selectedCampaign.name, prompt: promptDraft });
    setSelectedDelivery(null);
    await sendToPomelli(promptDraft, selectedCampaign.id);
  };

  const handleSave = () => {
    if (!activeCampaignMeta) return;
    setCalendarEntries((prev) => ({
      ...prev,
      [scheduleDate]: {
        campaignId: activeCampaignMeta.campaignId,
        campaignName: activeCampaignMeta.campaignName,
        platforms: Object.entries(selectedPlatforms).filter(([, checked]) => checked).map(([platform]) => platform),
        notes: jobNotes,
        status: "scheduled",
        jobId
      }
    }));
    setSelectedCalendarDate(scheduleDate);
    setSavedMessage(`Added for ${scheduleDate}`);
    window.setTimeout(() => setSavedMessage(""), 2000);
  };

  const removeEntry = () => {
    setCalendarEntries((prev) => {
      const next = { ...prev };
      delete next[selectedCalendarDate];
      return next;
    });
    setShowIdeaPicker(false);
  };

  useEffect(() => {
    if (jobStatus !== "complete" || !result || !activeCampaignMeta || !jobId) return;
    const nextDelivery = {
      jobId,
      campaignId: activeCampaignMeta.campaignId,
      campaignName: activeCampaignMeta.campaignName,
      prompt: activeCampaignMeta.prompt,
      receivedAt: new Date().toISOString(),
      result
    };
    setDeliveries((prev) => [nextDelivery, ...prev.filter((item) => item.jobId !== jobId)].slice(0, 20));
    setSelectedDelivery(nextDelivery);
  }, [jobStatus, result, activeCampaignMeta, jobId]);

  return (
    <div style={{ padding: "28px 30px 34px", color: BRAND.colors.text, fontFamily: "'DM Sans', sans-serif", display: "grid", gap: 20 }}>
      <section style={{ ...panel, padding: "22px 24px", background: "linear-gradient(145deg, rgba(250,245,236,0.96), rgba(255,255,255,0.98))", display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 600, color: BRAND.colors.primary }}>Content Studio</div>
          <div style={{ fontSize: 14, color: "#6d5a43", maxWidth: 620, lineHeight: 1.65 }}>Generate on-brand campaigns via Pomelli and schedule them against live Pune demand moments without leaving MrMilk AI.</div>
        </div>
        <div style={{ minWidth: 290, display: "grid", gap: 10 }}>
          <div style={{ justifySelf: "end", display: "inline-flex", alignItems: "center", gap: 10, background: isConnected ? "#ecfdf3" : "#fff1f1", color: isConnected ? "#166534" : "#b91c1c", border: `1px solid ${isConnected ? "#bbf7d0" : "#fecaca"}`, borderRadius: 999, padding: "8px 14px", fontSize: 13, fontWeight: 700 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: isConnected ? "#16a34a" : "#dc2626" }} />
            {isConnected ? "Pomelli Bridge Ready" : "Start Bridge Server"}
          </div>
          {!isConnected && (
            <div style={{ background: "#fff", border: "1px solid #eadfcd", borderRadius: 16, padding: "12px 14px", display: "grid", gap: 10 }}>
              <div style={{ fontSize: 12, color: "#6d5a43", lineHeight: 1.55 }}>The Chrome extension waits for the local bridge server. Start it once on this machine.</div>
              <div style={{ background: BRAND.colors.bg, border: "1px solid #eadfcd", borderRadius: 12, padding: "10px 12px", fontSize: 12, fontFamily: "ui-monospace, monospace" }}>{bridgeCommand}</div>
              <button
                type="button"
                onClick={async () => {
                  const didCopy = await flashCopy("bridge", bridgeCommand);
                  if (didCopy) {
                    setBridgeCommandCopied(true);
                    window.setTimeout(() => setBridgeCommandCopied(false), 2000);
                  }
                }}
                style={ghostButton}
              >
                {bridgeCommandCopied ? "Copied! ✓" : "Copy start command"}
              </button>
            </div>
          )}
        </div>
      </section>

      <section style={{ ...panel, padding: "14px 16px", background: "#fffaf3", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {contextPills.map((pill) => <span key={pill} style={{ background: "#f0e6d3", color: BRAND.colors.text, border: "1px solid #e8dcc8", borderRadius: 999, padding: "8px 13px", fontSize: 12, fontWeight: 600 }}>{pill}</span>)}
        {freshness.isITTransferSeason && <span style={{ background: "#fff1f2", color: "#b91c1c", border: "1px solid #fecdd3", borderRadius: 999, padding: "8px 13px", fontSize: 12, fontWeight: 700 }}>High churn period</span>}
        {freshness.festival && freshness.festival.daysAway <= 7 && <span style={{ background: "#fffbeb", color: "#b45309", border: "1px solid #fcd34d", borderRadius: 999, padding: "8px 13px", fontSize: 12, fontWeight: 700 }}>{freshness.festival.name} approaching</span>}
      </section>

      <section style={{ ...panel, padding: "18px 20px", display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 600, color: BRAND.colors.primary }}>Campaign Inbox</div>
            <div style={{ fontSize: 13, color: "#7a654a", lineHeight: 1.6 }}>Every finished Pomelli delivery should land here with creatives, captions, and reopen/download actions.</div>
          </div>
          <span style={{ background: "#faf5ec", border: "1px solid #eadfcd", borderRadius: 999, padding: "7px 11px", fontSize: 12, fontWeight: 700, color: "#7a654a" }}>{deliveries.length} saved deliveries</span>
        </div>
        {deliveries.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            {deliveries.slice(0, 6).map((delivery) => {
              const deliveryCreatives = extractCreativeItems(delivery.result);
              const deliveryCaptions = normalizeCaptions(delivery.result?.captions);
              return (
                <div key={delivery.jobId} style={{ background: "#fffaf3", border: "1px solid #eadfcd", borderRadius: 16, padding: "14px 14px 13px", display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: BRAND.colors.primary }}>{delivery.campaignName}</div>
                    <span style={{ fontSize: 11, color: "#7a654a" }}>{format(parseISO(delivery.receivedAt), "d MMM, h:mm a")}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#7a654a", lineHeight: 1.6 }}>
                    {deliveryCreatives.length} creatives | {deliveryCaptions.length} captions
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => { setSelectedDelivery(delivery); setIsOutputOpen(true); }} style={primaryButton}>View delivery</button>
                    {deliveryCreatives[0] && <button type="button" onClick={() => window.open(deliveryCreatives[0].url, "_blank", "noopener,noreferrer")} style={ghostButton}>Open creative</button>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ background: "#faf5ec", border: "1px dashed #d8c8b3", borderRadius: 16, padding: "16px 18px", fontSize: 13, color: "#7a654a", lineHeight: 1.7 }}>
            No finished Pomelli deliveries yet. Once a campaign completes, its creatives and captions will appear here automatically.
          </div>
        )}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {campaigns.map((campaign) => (
          <article key={campaign.id} style={{ ...panel, padding: 16, borderRadius: 16, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ fontSize: 28 }}>{campaign.icon}</div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 25, fontWeight: 600, color: BRAND.colors.primary }}>{campaign.name}</div>
              </div>
              <span style={{ alignSelf: "start", background: campaign.tag === "URGENT" ? "#fef2f2" : campaign.tag === "WEEKLY" ? "#f0fdf4" : campaign.tag === "SEASONAL" ? "#fffbeb" : "#f8fafc", color: campaign.tag === "URGENT" ? "#b91c1c" : campaign.tag === "WEEKLY" ? "#15803d" : campaign.tag === "SEASONAL" ? "#b45309" : "#475569", borderRadius: 999, padding: "6px 10px", fontSize: 11, fontWeight: 800 }}>{campaign.tag}</span>
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>{campaign.description}</div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: BRAND.colors.accent, textTransform: "uppercase", marginBottom: 6 }}>Auto-built prompt</div>
              <div style={{ background: BRAND.colors.bg, border: "1px solid #e8dcc8", borderRadius: 10, padding: "10px 11px", fontSize: 11, lineHeight: 1.5, color: "#5c4a35", fontFamily: "ui-monospace, monospace", minHeight: 58, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{campaign.promptPreview}</div>
            </div>
            <button type="button" disabled={!isConnected} onClick={() => openCampaignModal(campaign)} style={{ ...primaryButton, width: "100%", opacity: isConnected ? 1 : 0.55, cursor: isConnected ? "pointer" : "not-allowed" }}>Generate with Pomelli →</button>
          </article>
        ))}
      </section>

      {isModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(19,18,17,0.5)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ width: "min(840px, 100%)", background: "#fffdf9", borderRadius: 24, border: "1px solid #eadfcd", boxShadow: "0 30px 80px rgba(26,58,22,0.18)", overflow: "hidden" }}>
            <div style={{ padding: "22px 24px 18px", borderBottom: "1px solid #efe3d2", display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 29, color: BRAND.colors.primary, fontWeight: 600 }}>{modalCampaign?.icon || "Prompt"} {modalCampaign?.name || "Campaign prompt"}</div>
                <div style={{ fontSize: 13, color: "#7a654a", lineHeight: 1.6 }}>{processing ? "Pomelli handoff is in progress. Keep this window open until the bridge returns content into the Campaign Inbox." : "Campaign prompt (auto-built — you can edit before sending)."}</div>
              </div>
              <div style={{ background: "#faf5ec", border: "1px solid #eadfcd", borderRadius: 999, padding: "7px 11px", fontSize: 12, fontWeight: 700 }}>{statusCopy[jobStatus] || statusCopy.idle}</div>
            </div>
            <div style={{ padding: 24, display: "grid", gap: 18 }}>
              {processing ? (
                <>
                  <div style={{ display: "grid", gap: 14 }}>
                    {STATUS_STEPS.map((step) => {
                      const state = getStepState(jobStatus, step.key);
                      return (
                        <div key={step.key} style={{ display: "grid", gridTemplateColumns: "24px 1fr", gap: 12, alignItems: "center" }}>
                          <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${state === "done" ? "#16a34a" : state === "active" ? BRAND.colors.accent : state === "error" ? "#dc2626" : "#d7c7af"}`, background: state === "done" ? "#16a34a" : state === "active" ? BRAND.colors.accent : state === "error" ? "#dc2626" : "transparent" }} />
                          <div style={{ fontSize: 14, fontWeight: state === "active" ? 800 : 600, color: state === "error" ? "#b91c1c" : state === "waiting" ? "#8e7b64" : BRAND.colors.text, textDecoration: state === "done" ? "line-through" : "none" }}>{step.label}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 13, color: "#7a654a", fontWeight: 700 }}>Elapsed: {formatElapsed(elapsedSeconds)}</div>
                  {(jobStatus === "server_offline" || error) && <div style={{ background: "#fff1f1", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 14, padding: "12px 14px", fontSize: 13, lineHeight: 1.6 }}>{error || `Bridge server is offline. Start it locally with ${bridgeCommand}.`}</div>}
                </>
              ) : (
                <textarea value={promptDraft} onChange={(event) => setPromptDraft(event.target.value)} style={{ minHeight: 200, resize: "vertical", width: "100%", background: BRAND.colors.bg, border: "1px solid #e8dcc8", borderRadius: 16, padding: "16px 18px", color: BRAND.colors.text, fontSize: 12, lineHeight: 1.7, fontFamily: "ui-monospace, monospace", outlineColor: BRAND.colors.accent }} />
              )}
            </div>
            <div style={{ padding: "16px 24px 22px", borderTop: "1px solid #efe3d2", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <button type="button" onClick={() => { if (processing) cancelJob(); setIsModalOpen(false); setSelectedCampaign(null); if (!processing) setPromptDraft(""); }} style={ghostButton}>{processing ? "Cancel job" : "Cancel"}</button>
              {!processing && <button type="button" onClick={handleSend} style={primaryButton}>Send to Pomelli →</button>}
            </div>
          </div>
        </div>
      )}

      {isOutputOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(19,18,17,0.46)", zIndex: 70, display: "flex", justifyContent: "flex-end" }}>
          <div style={{ width: "min(1320px, 96vw)", height: "100%", background: "#fffdf9", boxShadow: "-18px 0 48px rgba(26,58,22,0.18)", display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(300px, 0.95fr)" }}>
            <div style={{ padding: "28px 26px 24px", overflowY: "auto", display: "grid", gap: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <button type="button" onClick={() => { setSelectedDelivery(null); setIsOutputOpen(false); }} style={ghostButton}>← Back to Inbox</button>
                <button type="button" onClick={() => setIsOutputOpen(false)} style={ghostButton}>Close</button>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, fontWeight: 600, color: BRAND.colors.primary }}>{activeCampaignName}</div>
                <div style={{ fontSize: 14, color: "#7a654a", lineHeight: 1.7 }}>
                  This delivery was generated from the <strong>{activeCampaignName}</strong> campaign card in MrMilk AI. Only the returned creatives and cleaned campaign copy are shown here.
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ background: "#faf5ec", border: "1px solid #eadfcd", borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 700, color: "#7a654a" }}>{creativeItems.length} creatives</span>
                  <span style={{ background: "#faf5ec", border: "1px solid #eadfcd", borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 700, color: "#7a654a" }}>{captions.length} clean copy lines</span>
                  {deliveryTimestamp && <span style={{ background: "#faf5ec", border: "1px solid #eadfcd", borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 700, color: "#7a654a" }}>{format(parseISO(deliveryTimestamp), "d MMM, h:mm a")}</span>}
                </div>
              </div>

              <div style={{ background: "#fff", border: "1px solid #eadfcd", borderRadius: 18, padding: 16, display: "grid", gap: 10 }}>
                <div style={{ fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase", fontWeight: 800, color: "#af8547" }}>Campaign identity</div>
                <div style={{ display: "grid", gap: 8, fontSize: 13, color: "#6d5a43" }}>
                  <div><strong style={{ color: BRAND.colors.primary }}>Requested campaign:</strong> {activeCampaignName}</div>
                  {activePomelliTitle && <div><strong style={{ color: BRAND.colors.primary }}>Pomelli title:</strong> {activePomelliTitle}</div>}
                  {activeResult?.pageUrl && <div><strong style={{ color: BRAND.colors.primary }}>Pomelli page:</strong> <a href={activeResult.pageUrl} target="_blank" rel="noreferrer" style={{ color: BRAND.colors.primary }}>{truncateText(activeResult.pageUrl, 90)}</a></div>}
                </div>
              </div>

              <div style={{ background: "#fff", border: "1px solid #eadfcd", borderRadius: 18, padding: 16, display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 600, color: BRAND.colors.primary }}>Creative Gallery</div>
                  <span style={{ fontSize: 12, color: "#7a654a" }}>Generated for {activeCampaignName}</span>
                </div>
                {creativeItems.length ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                    {creativeItems.map((creative, index) => (
                      <div key={creative.id} style={{ background: "#fffaf3", border: "1px solid #eadfcd", borderRadius: 16, padding: 12, display: "grid", gap: 10 }}>
                        {creative.type === "image" ? (
                          <img src={creative.url} alt={`${activeCampaignName} creative ${index + 1}`} style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 12, border: "1px solid #eadfcd", background: "#faf5ec" }} />
                        ) : (
                          <video src={creative.url} controls style={{ width: "100%", borderRadius: 12, border: "1px solid #eadfcd", background: "#faf5ec" }} />
                        )}
                        <div style={{ display: "grid", gap: 3 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: BRAND.colors.primary }}>Creative {index + 1}</div>
                          <div style={{ fontSize: 12, color: "#7a654a" }}>{activeCampaignName}</div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button type="button" onClick={() => window.open(creative.url, "_blank", "noopener,noreferrer")} style={primaryButton}>View</button>
                          <a href={creative.url} target="_blank" rel="noreferrer" download style={{ ...ghostButton, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                            Download
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ background: "#faf5ec", border: "1px dashed #d8c8b3", borderRadius: 16, padding: "16px 18px", fontSize: 13, color: "#7a654a", lineHeight: 1.7 }}>
                    No creative assets were extracted from this Pomelli run yet.
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 31, fontWeight: 600, color: BRAND.colors.primary }}>Clean Campaign Copy</div>
                <div style={{ fontSize: 13, color: "#7a654a", lineHeight: 1.6 }}>Only filtered, human-readable copy is shown here. Pomelli interface labels, prompt fragments, and technical strings are removed.</div>
              </div>
              {captions.length ? captions.map((caption, index) => (
                <div key={`${jobId || "caption"}-${index}`} style={{ background: "#fff", border: "1px solid #eadfcd", borderRadius: 18, padding: 16, display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: "#af8547" }}>Copy line {index + 1}</div>
                    <button type="button" onClick={() => flashCopy(`caption-${index}`, caption)} style={ghostButton}>{copyState[`caption-${index}`] ? "Copied! ✓" : "Copy"}</button>
                  </div>
                  <div style={{ fontSize: 15, lineHeight: 1.7, whiteSpace: "pre-wrap", color: BRAND.colors.text }}>{caption}</div>
                </div>
              )) : (
                <div style={{ background: "#faf5ec", border: "1px dashed #d8c8b3", borderRadius: 18, padding: "18px 16px", fontSize: 14, color: "#7a654a", lineHeight: 1.7 }}>
                  No clean campaign copy was extracted from this run. The creative files are still available above.
                </div>
              )}

              <div style={{ background: "#fff", border: "1px solid #eadfcd", borderRadius: 18, padding: 16, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 600, color: BRAND.colors.primary }}>WhatsApp Draft</div>
                  <button type="button" onClick={() => flashCopy("whatsapp", whatsappVersion)} style={ghostButton}>{copyState.whatsapp ? "Copied! ✓" : "Copy"}</button>
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.75, whiteSpace: "pre-wrap", color: BRAND.colors.text }}>{whatsappVersion}</div>
              </div>
            </div>
            <div style={{ borderLeft: "1px solid #efe3d2", padding: "28px 24px 22px", overflowY: "auto", display: "grid", gap: 18, alignContent: "start" }}>
              <div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 600, color: BRAND.colors.primary }}>Delivery Actions</div>
                <div style={{ fontSize: 13, color: "#7a654a", lineHeight: 1.6 }}>Keep only the essential actions: open the original Pomelli page, review the creative files, and download what you need.</div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" onClick={() => window.open(activeResult?.pageUrl || CONFIG.POMELLI_URL, "_blank", "noopener,noreferrer")} style={primaryButton}>Open Pomelli Page →</button>
                {!!creativeItems.length && (
                  <button
                    type="button"
                    onClick={() => creativeItems.forEach((creative) => window.open(creative.url, "_blank", "noopener,noreferrer"))}
                    style={ghostButton}
                  >
                    Open all creatives
                  </button>
                )}
              </div>
              <div style={{ background: "#fff", border: "1px solid #eadfcd", borderRadius: 18, padding: "15px 16px", display: "grid", gap: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: "#af8547" }}>Delivery summary</div>
                <div style={{ display: "grid", gap: 8, fontSize: 13, color: "#6d5a43" }}>
                  <div><strong style={{ color: BRAND.colors.primary }}>Campaign:</strong> {activeCampaignName}</div>
                  <div><strong style={{ color: BRAND.colors.primary }}>Creatives received:</strong> {creativeItems.length}</div>
                  <div><strong style={{ color: BRAND.colors.primary }}>Clean copy lines:</strong> {captions.length}</div>
                  {deliveryTimestamp && <div><strong style={{ color: BRAND.colors.primary }}>Received:</strong> {format(parseISO(deliveryTimestamp), "d MMM yyyy, h:mm a")}</div>}
                </div>
              </div>
              {!!creativeItems.length && (
                <div style={{ background: "#fff", border: "1px solid #eadfcd", borderRadius: 18, padding: "15px 16px", display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: "#af8547" }}>Creative files</div>
                  {creativeItems.map((creative, index) => (
                    <a key={creative.id} href={creative.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: BRAND.colors.primary }}>
                      {activeCampaignName} • Creative {index + 1}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
