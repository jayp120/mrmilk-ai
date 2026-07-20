// MrMilk AI × Pomelli Bridge — content.js
// Passive monitor injected into Pomelli tab
// Active injection is done via chrome.scripting.executeScript in background.js

const TAG = '🎨 [MrMilk Content]';
const BRIDGE_URL = 'http://192.168.101.216:3456';

// Notify background that Pomelli tab is ready
if (document.readyState === 'complete') {
  notifyReady();
} else {
  window.addEventListener('load', notifyReady);
}

function notifyReady() {
  chrome.runtime.sendMessage({ type: 'POMELLI_TAB_READY', url: window.location.href })
    .catch(() => {});
  console.log(TAG, 'Pomelli tab ready at:', window.location.href);
}

// Listen for direct messages from background (alternative injection path)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ status: 'alive', url: window.location.href });
  }
});
