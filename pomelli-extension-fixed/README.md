# MrMilk AI × Pomelli Bridge — Chrome Extension

Connects MrMilk AI Content Studio to Pomelli (labs.google.com/pomelli)
for one-click on-brand campaign generation.

---

## How It Works

```
MrMilk AI App → POST /trigger → Bridge Server
                                      ↓
                           Chrome Extension polls /pending
                                      ↓
                         Opens labs.google.com/pomelli
                         Injects your campaign prompt
                         Waits for the final Pomelli campaign page
                         Scrapes captions + creative assets
                                      ↓
                            POST result → Bridge Server
                                      ↓
                         MrMilk AI polls /result/:jobId
                         Shows output in Content Studio
```

---

## Install (2 minutes)

1. Open Chrome → go to `chrome://extensions`
2. Toggle **Developer mode** ON (top-right)
3. Click **Load unpacked**
4. Select this folder: `/chrome-extension`
5. Pin the "MrMilk × Pomelli" extension to your toolbar

---

## Prerequisites

### Bridge Server must be running
```bash
cd bridge-server
npm install
npm start
# Runs on http://localhost:3456
```

### Pomelli must be open and signed in
1. Go to `https://labs.google.com/pomelli`
2. Sign in with your Google account
3. Enter your website: `https://www.mittaldairyfarms.com`
4. Let Pomelli build Mr. Milk's Business DNA (do this once)
5. **Keep this tab open** — the extension uses it

---

## Extension Popup

Click the 🥛 icon in your toolbar to see:

| Indicator | Meaning |
|---|---|
| 🟢 Bridge ready | localhost:3456 is running |
| 🔴 Server offline | Start bridge-server first |
| 🟢 Pomelli: open ✓ | Pomelli tab is active |
| 🔴 Pomelli: not open | Open labs.google.com/pomelli |

### Buttons
- **Open MrMilk AI** → Opens localhost:5000
- **Open Pomelli** → Opens labs.google.com/pomelli
- **Refresh** → Rechecks all statuses
- **Clear Jobs** → Clears job queue (use if stuck)

---

## Troubleshooting

**Extension not responding after click**
→ Click "Refresh" in popup
→ Reload extension at chrome://extensions

**Pomelli input not found**
→ Pomelli may have updated their UI
→ Check the browser console on the Pomelli tab for selector logs
→ Report the new selector to update content.js

**Result never arrives**
→ Check Pomelli tab for the green "Delivered to MrMilk AI" badge
→ If badge didn't appear, Pomelli final creatives were not detected yet
→ Try clicking "Clear Jobs" and regenerating

**Bridge server offline**
```bash
cd bridge-server && npm start
```

---

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Extension config, permissions, Manifest V3 |
| `background.js` | Service worker — job orchestration, polling |
| `content.js` | Injected into Pomelli tab — passive monitor |
| `popup.html` | Extension popup UI |
| `popup.js` | Popup logic, status display |
| `icons/` | Extension icons (16, 48, 128px) |

---

## Brand

**Mr. Milk** by Mittal Dairy Farms, Pune
Website: mittaldairyfarms.com
Phone: 9922-67-6455
Awards: Times Power Brands + Lokmat Global Industry Award 2024
