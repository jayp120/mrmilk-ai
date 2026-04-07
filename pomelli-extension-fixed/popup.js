// MrMilk AI × Pomelli Bridge — popup.js

const BRIDGE_URL = 'http://localhost:3456';
const POMELLI_URL = 'https://labs.google.com/pomelli';
const APP_URL = 'http://localhost:5000';

let isBridgeOnline = false;
let refreshTimer = null;

// ─── DOM refs ────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkBridgeStatus();
  loadStoredState();
  refreshTimer = setInterval(checkBridgeStatus, 5000);

  // Listen for state updates from background
  chrome.runtime.onMessage.addListener(handleStateUpdate);
});

// ─── Bridge health check ──────────────────────────────────────────────────────
async function checkBridgeStatus() {
  try {
    const res = await fetch(`${BRIDGE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    if (data.status === 'ok') {
      setBridgeStatus(true);
      return;
    }
  } catch (e) {}
  setBridgeStatus(false);
}

function setBridgeStatus(online) {
  isBridgeOnline = online;
  const dot = $('bridge-dot');
  const label = $('bridge-label');
  const alert = $('offline-alert');

  if (online) {
    dot.className = 'dot green';
    label.textContent = 'Bridge ready';
    alert.classList.remove('visible');
  } else {
    dot.className = 'dot red pulse';
    label.textContent = 'Server offline';
    alert.classList.add('visible');
  }
}

// ─── Check if Pomelli tab is open ────────────────────────────────────────────
async function checkPomerliTab() {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://labs.google.com/pomelli*' });
    const dot = $('pomelli-dot');
    const label = $('pomelli-label');
    if (tabs.length > 0) {
      dot.className = 'dot green';
      label.textContent = 'Pomelli: open ✓';
    } else {
      dot.className = 'dot red';
      label.textContent = 'Pomelli: not open';
    }
  } catch (e) {}
}

// ─── Load stored state from background ───────────────────────────────────────
async function loadStoredState() {
  checkPomerliTab();
  try {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (data) => {
      if (chrome.runtime.lastError) return;
      if (!data) return;
      if (data.lastJob) renderJob(data.lastJob);
      if (data.lastResult) renderResult(data.lastResult);
      if (data.activeJobId) {
        $('progress-steps').style.display = 'flex';
      }
    });
  } catch (e) {}
}

// ─── Handle state update from background service worker ──────────────────────
function handleStateUpdate(message) {
  if (message.type !== 'STATE_UPDATE') return;
  const { state } = message;
  if (!state) return;

  const steps = {
    'sending':          ['send'],
    'opening_pomelli':  ['send', 'open'],
    'generating':       ['send', 'open', 'gen'],
    'complete':         ['send', 'open', 'gen', 'recv'],
    'error':            []
  };

  const stepIds = ['send', 'open', 'gen', 'recv'];
  const doneSteps = steps[state.status] || [];

  $('progress-steps').style.display = state.status === 'idle' ? 'none' : 'flex';

  stepIds.forEach((sid, i) => {
    const el = $(`step-${sid}`);
    if (!el) return;
    el.className = 'step';
    if (doneSteps.includes(sid)) {
      const allDone = state.status === 'complete';
      if (allDone || doneSteps.indexOf(sid) < doneSteps.length - 1) {
        el.classList.add('done');
      } else {
        el.classList.add('active');
      }
    }
  });

  updateJobBadge(state.status);

  if (state.status === 'complete' && state.captions) {
    renderResult({
      captions: state.captions,
      assetUrls: state.assetUrls,
      creativeItems: state.creativeItems,
      receivedAt: new Date().toISOString()
    });
  }

  if (state.status === 'error') {
    $('result-value').textContent = `Error: ${state.error || 'Unknown error'}`;
    $('result-value').style.color = '#991b1b';
    $('result-meta').textContent = new Date().toLocaleTimeString('en-IN');
  }
}

// ─── Render job info ──────────────────────────────────────────────────────────
function renderJob(job) {
  if (!job) return;
  $('job-name').textContent = job.campaignType || 'Campaign';
  $('job-name').style.color = '#2c1a0e';
  $('job-meta').textContent = formatTime(job.timestamp);
  updateJobBadge(job.status);
}

function updateJobBadge(status) {
  const badge = $('job-badge');
  const map = {
    idle:            ['idle',       'Idle'],
    pending:         ['sending',    'Queued'],
    sending:         ['sending',    'Sending'],
    opening_pomelli: ['sending',    'Opening'],
    processing:      ['generating', 'Processing'],
    generating:      ['generating', '🎨 Generating'],
    complete:        ['complete',   '✓ Complete'],
    error:           ['error',      '✗ Error']
  };
  const [cls, text] = map[status] || ['idle', 'Idle'];
  badge.className = `status-badge ${cls}`;
  badge.textContent = text;
}

// ─── Render result ────────────────────────────────────────────────────────────
function renderResult(result) {
  if (!result) return;
  const count = result.captions?.length || 0;
  const assets = result.creativeItems?.length || result.assetUrls?.length || 0;
  $('result-value').textContent = count > 0
    ? `${count} caption${count > 1 ? 's' : ''} received${assets > 0 ? ` · ${assets} asset${assets > 1 ? 's' : ''}` : ''}`
    : 'Result received (check MrMilk AI)';
  $('result-value').style.color = '#166534';
  $('result-meta').textContent = `at ${formatTime(result.receivedAt)}`;
}

// ─── Copy command ─────────────────────────────────────────────────────────────
function copyCommand() {
  navigator.clipboard.writeText('cd bridge-server && npm start').then(() => {
    const el = $('copy-cmd');
    const orig = el.textContent;
    el.textContent = '✓ Copied!';
    setTimeout(() => { el.textContent = orig; }, 2000);
  });
}
window.copyCommand = copyCommand;

// ─── Button actions ───────────────────────────────────────────────────────────
function openApp() {
  chrome.runtime.sendMessage({ type: 'OPEN_APP' });
  window.close();
}
function openPomelli() {
  chrome.runtime.sendMessage({ type: 'OPEN_POMELLI' });
  window.close();
}
function refreshStatus() {
  checkBridgeStatus();
  loadStoredState();
}
function clearJobs() {
  chrome.runtime.sendMessage({ type: 'CLEAR_JOBS' }, () => {
    $('job-name').textContent = 'No active job';
    $('job-meta').textContent = 'Cleared';
    $('result-value').textContent = 'No results yet';
    $('result-value').style.color = '';
    $('result-meta').textContent = '';
    $('progress-steps').style.display = 'none';
    updateJobBadge('idle');
  });
}

window.openApp = openApp;
window.openPomelli = openPomelli;
window.refreshStatus = refreshStatus;
window.clearJobs = clearJobs;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatTime(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  } catch (e) { return isoString; }
}
