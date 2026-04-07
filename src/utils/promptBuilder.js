import { CONFIG } from "../config.js";

export const withBrandFooter = (prompt) => `${prompt.trim()}

---
POMELLI BRAND REFERENCE: ${CONFIG.BRAND.website}
Brand: ${CONFIG.BRAND.name} by ${CONFIG.BRAND.company}, Pune
Colors: ${CONFIG.BRAND.colors.primary} (forest green) + ${CONFIG.BRAND.colors.accent} (saffron gold) + ${CONFIG.BRAND.colors.bg} (ivory)
Tagline: "${CONFIG.BRAND.tagline}"
Awards: ${CONFIG.BRAND.awards.join(" + ")}
Contact: ${CONFIG.BRAND.phone} | ${CONFIG.BRAND.portal}
---`;

export const buildPromptFromTemplate = (template, freshness) => template.buildPrompt(freshness);

export const summarizePrompt = (prompt, maxLength = 180) => {
  const normalized = String(prompt || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trim()}...`;
};
