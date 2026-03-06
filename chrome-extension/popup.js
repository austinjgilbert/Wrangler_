/**
 * Rabbit – Popup Script
 *
 * Consolidated from all extension projects. Features:
 *   - Single page capture  (content.js DOM extraction → worker)
 *   - Bulk tab capture      (capture multiple open tabs at once)
 *   - Text paste analysis   (paste raw text → extract entities → worker)
 *   - Settings              (worker URL + API key stored in chrome.storage)
 *
 * All data flows to:  POST /extension/capture  on the Cloudflare Worker
 * which upserts to Sanity and triggers the enrichment pipeline.
 */

const DEFAULT_WORKER_URL = 'https://website-scanner.austin-gilbert.workers.dev';

// ─── DOM refs ────────────────────────────────────────────────────────────
const captureBtn       = document.getElementById('capture-btn');
const settingsToggle   = document.getElementById('settings-toggle');
const settingsPanel    = document.getElementById('settings-panel');
const saveBtn          = document.getElementById('save-settings');
const badge            = document.getElementById('badge');
const connectHint      = document.getElementById('connect-hint');
const statusMsg        = document.getElementById('status-msg');
const sourceLabel      = document.getElementById('source-label');
const pageUrlEl        = document.getElementById('page-url');
const entitiesList     = document.getElementById('entities-list');
const apiUrlInput      = document.getElementById('api-url');
const apiKeyInput      = document.getElementById('api-key');
const rabbitAutoObserve = document.getElementById('rabbit-auto-observe');
const rabbitOverlayEnabled = document.getElementById('rabbit-overlay-enabled');
const rabbitStoreImportant = document.getElementById('rabbit-store-important');
const rabbitLearnMode = document.getElementById('rabbit-learn-mode');
const rabbitLearnStatus = document.getElementById('rabbit-learn-status');
const rabbitLatestInsight = document.getElementById('rabbit-latest-insight');
const rabbitPromptInput = document.getElementById('rabbit-prompt-input');
const rabbitAskBtn = document.getElementById('rabbit-ask-btn');
const rabbitStatus = document.getElementById('rabbit-status');
const rabbitAnswer = document.getElementById('rabbit-answer');

// Bulk
const bulkBtn          = document.getElementById('bulk-capture-btn');
const bulkSelectAll    = document.getElementById('bulk-select-all');
const bulkTabList      = document.getElementById('bulk-tab-list');
const bulkProgress     = document.getElementById('bulk-progress');
const bulkProgressFill = document.getElementById('bulk-progress-fill');
const bulkStatus       = document.getElementById('bulk-status');

// Text
const textBtn          = document.getElementById('text-capture-btn');
const textInput        = document.getElementById('text-input');
const textStatus       = document.getElementById('text-status');

// Tabs
const tabButtons = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

let currentTabId = null;

// ─── Tab switching ───────────────────────────────────────────────────────
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');

    // Load bulk tabs when switching to bulk tab
    if (btn.dataset.tab === 'bulk') loadBulkTabs();
  });
});

// ─── Init ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get([
    'workerUrl', 'apiKey', 'totalCaptures', 'todayCaptures', 'lastCaptureDate',
    'rabbitAutoObserve', 'rabbitOverlayEnabled', 'rabbitStoreImportant', 'rabbitLearnMode',
    'rabbitLastInsight', 'rabbitLastIntel', 'rabbitLearnStatus',
  ]);

  apiUrlInput.value = stored.workerUrl || DEFAULT_WORKER_URL;
  apiKeyInput.value = stored.apiKey || '';
  rabbitAutoObserve.checked = stored.rabbitAutoObserve !== false;
  rabbitOverlayEnabled.checked = stored.rabbitOverlayEnabled !== false;
  rabbitStoreImportant.checked = stored.rabbitStoreImportant !== false;
  rabbitLearnMode.checked = stored.rabbitLearnMode === true;
  renderRabbitInsight(stored.rabbitLastIntel || stored.rabbitLastInsight || null);
  renderLearnStatus(stored.rabbitLearnStatus || null);

  if (stored.apiKey) {
    checkConnection(stored.workerUrl || DEFAULT_WORKER_URL, stored.apiKey, badge, () => {
      captureBtn.disabled = false;
      textBtn.disabled = false;
      bulkBtn.disabled = false;
      rabbitAskBtn.disabled = false;
      if (connectHint) connectHint.classList.add('hidden');
      const emptyMsg = document.getElementById('capture-empty-msg');
      if (emptyMsg) emptyMsg.textContent = 'Click Capture to extract data from this page.';
    });
  } else {
    badge.textContent = 'Not connected';
    badge.className = 'badge disconnected';
    if (connectHint) connectHint.classList.remove('hidden');
    rabbitAskBtn.disabled = true;
    const emptyMsg = document.getElementById('capture-empty-msg');
    if (emptyMsg) emptyMsg.textContent = 'Connect in Settings (Worker URL + API key), then click Capture.';
  }

  const today = new Date().toDateString();
  const todayCount = stored.lastCaptureDate === today ? (stored.todayCaptures || 0) : 0;
  document.getElementById('total-captures').textContent = stored.totalCaptures || 0;
  document.getElementById('today-captures').textContent = todayCount;

  // Current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    currentTabId = tab.id;
    pageUrlEl.textContent = tab.url;
    sourceLabel.textContent = detectSource(tab.url);
    await refreshRabbitIntel(tab.id);
  }
});

// ─── Settings ────────────────────────────────────────────────────────────
settingsToggle.addEventListener('click', () => {
  settingsPanel.classList.toggle('visible');
  settingsToggle.textContent = settingsPanel.classList.contains('visible') ? 'Close settings' : 'Settings';
});

saveBtn.addEventListener('click', async () => {
  const url = apiUrlInput.value.trim().replace(/\/+$/, '');
  const key = apiKeyInput.value.trim();

  await chrome.storage.local.set({
    workerUrl: url,
    apiKey: key,
    rabbitAutoObserve: rabbitAutoObserve.checked,
    rabbitOverlayEnabled: rabbitOverlayEnabled.checked,
    rabbitStoreImportant: rabbitStoreImportant.checked,
    rabbitLearnMode: rabbitLearnMode.checked,
  });

  captureBtn.disabled = true;
  textBtn.disabled = true;
  bulkBtn.disabled = true;
  rabbitAskBtn.disabled = true;

  if (key) {
    if (connectHint) connectHint.classList.add('hidden');
    await checkConnection(url, key, badge, () => {
      captureBtn.disabled = false;
      textBtn.disabled = false;
      bulkBtn.disabled = false;
      rabbitAskBtn.disabled = false;
    });
    const emptyMsg = document.getElementById('capture-empty-msg');
    if (emptyMsg) emptyMsg.textContent = 'Click Capture to extract data from this page.';
    showStatus(statusMsg, badge.className.includes('connected') ? 'Connected. Settings saved.' : 'Settings saved. Check API key and worker URL.', badge.className.includes('connected') ? 'success' : 'error');
  } else {
    badge.textContent = 'Not connected';
    badge.className = 'badge disconnected';
    if (connectHint) connectHint.classList.remove('hidden');
    const emptyMsg = document.getElementById('capture-empty-msg');
    if (emptyMsg) emptyMsg.textContent = 'Connect in Settings (Worker URL + API key), then click Capture.';
    showStatus(statusMsg, 'Settings saved. Set an API key to connect.', 'success');
  }
  settingsPanel.classList.remove('visible');
  settingsToggle.textContent = 'Settings';
});

[rabbitAutoObserve, rabbitOverlayEnabled, rabbitStoreImportant, rabbitLearnMode].forEach((input) => {
  input?.addEventListener('change', async () => {
    await chrome.storage.local.set({
      rabbitAutoObserve: rabbitAutoObserve.checked,
      rabbitOverlayEnabled: rabbitOverlayEnabled.checked,
      rabbitStoreImportant: rabbitStoreImportant.checked,
      rabbitLearnMode: rabbitLearnMode.checked,
    });
  });
});


// ═══════════════════════════════════════════════════════════════════════════
//  SINGLE PAGE CAPTURE
// ═══════════════════════════════════════════════════════════════════════════

captureBtn.addEventListener('click', async () => {
  if (!currentTabId) return;

  captureBtn.disabled = true;
  captureBtn.textContent = 'Capturing...';
  showStatus(statusMsg, 'Extracting page data...', 'loading');

  try {
    const extracted = await extractFromTab(currentTabId);

    if (!extracted) {
      showStatus(statusMsg, 'Could not extract data from this page.', 'error');
      resetBtn(captureBtn, 'Capture This Page');
      return;
    }

    renderEntities(extracted);
    showStatus(statusMsg, 'Sending to Sanity Content OS...', 'loading');

    const result = await sendToWorker(extracted);

    if (result.ok) {
      await updateStats();
      const d = result.data || {};
      showStatus(statusMsg,
        `Captured! ${d.accountsResolved || 0} accounts, ${d.peopleResolved || 0} people, ${d.technologiesLinked || 0} techs. Enrichment queued.`,
        'success',
      );
    } else {
      showStatus(statusMsg, `Error: ${result.error?.message || 'Unknown'}`, 'error');
    }
  } catch (err) {
    showStatus(statusMsg, `Failed: ${err.message}`, 'error');
  }

  resetBtn(captureBtn, 'Capture This Page');
});


// ═══════════════════════════════════════════════════════════════════════════
//  BULK TAB CAPTURE
// ═══════════════════════════════════════════════════════════════════════════

async function loadBulkTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const stored = await chrome.storage.local.get(['apiKey']);

  bulkTabList.innerHTML = '';

  if (tabs.length === 0) {
    bulkTabList.innerHTML = '<div class="empty-preview">No open tabs found.</div>';
    return;
  }

  for (const tab of tabs) {
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) continue;

    const item = document.createElement('div');
    item.className = 'tab-item';
    item.innerHTML = `
      <input type="checkbox" data-tab-id="${tab.id}" checked>
      <span class="tab-source">${detectSourceShort(tab.url)}</span>
      <span class="tab-title" title="${esc(tab.url)}">${esc(tab.title || tab.url)}</span>
    `;
    bulkTabList.appendChild(item);
  }

  bulkBtn.disabled = !stored.apiKey;
}

bulkSelectAll.addEventListener('click', () => {
  const checkboxes = bulkTabList.querySelectorAll('input[type="checkbox"]');
  const allChecked = Array.from(checkboxes).every(c => c.checked);
  checkboxes.forEach(c => c.checked = !allChecked);
  bulkSelectAll.textContent = allChecked ? 'Select All' : 'Deselect All';
});

bulkBtn.addEventListener('click', async () => {
  const checkboxes = bulkTabList.querySelectorAll('input[type="checkbox"]:checked');
  const tabIds = Array.from(checkboxes).map(c => parseInt(c.dataset.tabId, 10));

  if (tabIds.length === 0) {
    showStatus(bulkStatus, 'No tabs selected.', 'error');
    return;
  }

  bulkBtn.disabled = true;
  bulkBtn.textContent = `Capturing 0/${tabIds.length}...`;
  bulkProgress.classList.add('visible');
  bulkProgressFill.style.width = '0%';

  let done = 0;
  let totalAccounts = 0;
  let totalPeople = 0;
  let totalTechs = 0;
  let errors = 0;

  for (const tabId of tabIds) {
    try {
      const extracted = await extractFromTab(tabId);
      if (extracted) {
        const result = await sendToWorker(extracted);
        if (result.ok) {
          await updateStats();
          const d = result.data || {};
          totalAccounts += d.accountsResolved || 0;
          totalPeople   += d.peopleResolved || 0;
          totalTechs    += d.technologiesLinked || 0;
        } else {
          errors++;
        }
      } else {
        errors++;
      }
    } catch {
      errors++;
    }

    done++;
    bulkBtn.textContent = `Capturing ${done}/${tabIds.length}...`;
    bulkProgressFill.style.width = `${Math.round((done / tabIds.length) * 100)}%`;
  }

  bulkBtn.disabled = false;
  bulkBtn.textContent = 'Capture Selected Tabs';
  bulkProgress.classList.remove('visible');

  const msg = `Bulk complete: ${totalAccounts} accounts, ${totalPeople} people, ${totalTechs} techs.${errors > 0 ? ` ${errors} tabs failed.` : ''}`;
  showStatus(bulkStatus, msg, errors > 0 ? 'error' : 'success');
});

rabbitAskBtn.addEventListener('click', async () => {
  const prompt = rabbitPromptInput.value.trim();
  if (!prompt) {
    showStatus(rabbitStatus, 'Ask Rabbit a question first.', 'error');
    return;
  }

  rabbitAskBtn.disabled = true;
  rabbitAskBtn.textContent = 'Asking...';
  showStatus(rabbitStatus, 'Rabbit is grounding an answer in this page and your worker memory...', 'loading');

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'rabbit:ask',
      payload: { prompt, tabId: currentTabId },
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'Question failed');
    }

    renderRabbitAnswer(response.data);
    showStatus(rabbitStatus, 'Rabbit answered with grounded page context.', 'success');
  } catch (err) {
    showStatus(rabbitStatus, `Rabbit failed: ${err.message}`, 'error');
  }

  rabbitAskBtn.disabled = false;
  rabbitAskBtn.textContent = 'Ask Rabbit About This Page';
});


// ═══════════════════════════════════════════════════════════════════════════
//  TEXT PASTE CAPTURE
// ═══════════════════════════════════════════════════════════════════════════

textBtn.addEventListener('click', async () => {
  const text = textInput.value.trim();
  if (!text) {
    showStatus(textStatus, 'Paste some text first.', 'error');
    return;
  }

  textBtn.disabled = true;
  textBtn.textContent = 'Extracting...';
  showStatus(textStatus, 'Extracting entities from text...', 'loading');

  try {
    // If user has a normal page open, treat pasted tech list as belonging to that URL
    let contextUrl = null;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        contextUrl = tab.url;
      }
    } catch (_) {}

    const technologies = extractTechFromText(text);
    const payload = {
      url: 'manual://text-paste',
      title: 'Manual text paste',
      source: 'text_paste',
      capturedAt: new Date().toISOString(),
      accounts: extractAccountsFromText(text),
      people: extractPeopleFromText(text),
      technologies,
      signals: [],
      metadata: {},
      rawText: text.substring(0, 15000),
    };
    if (contextUrl) payload.contextUrl = contextUrl;

    const result = await sendToWorker(payload);

    if (result.ok) {
      await updateStats();
      const d = result.data || {};
      showStatus(textStatus,
        `Extracted! ${d.accountsResolved || 0} accounts, ${d.peopleResolved || 0} people, ${d.technologiesLinked || 0} techs. Enrichment queued.`,
        'success',
      );
      textInput.value = '';
    } else {
      showStatus(textStatus, `Error: ${result.error?.message || 'Unknown'}`, 'error');
    }
  } catch (err) {
    showStatus(textStatus, `Failed: ${err.message}`, 'error');
  }

  textBtn.disabled = false;
  textBtn.textContent = 'Extract & Send to Sanity';
});


// ═══════════════════════════════════════════════════════════════════════════
//  CONNECTION CHECK (uses GET /extension/check with Bearer auth)
// ═══════════════════════════════════════════════════════════════════════════

async function checkConnection(workerUrl, apiKey, badgeEl, onConnected) {
  const base = (workerUrl || DEFAULT_WORKER_URL).replace(/\/+$/, '');
  badgeEl.textContent = 'Checking...';
  badgeEl.className = 'badge disconnected';

  try {
    const resp = await fetch(`${base}/extension/check`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'X-API-Key': apiKey,
      },
    });
    const data = await resp.json().catch(() => ({}));
    // Worker returns { ok: true, data: { ok: true, message: '...' } }
    const connected = resp.ok && (data.ok === true || (data.data && data.data.ok === true));
    if (connected) {
      badgeEl.textContent = 'Connected';
      badgeEl.className = 'badge connected';
      if (typeof onConnected === 'function') onConnected();
      return;
    }
    // Show reason in status so user can fix it
    const statusEl = document.getElementById('status-msg');
    if (statusEl) {
      if (resp.status === 401) {
        statusEl.textContent = 'Invalid API key. Use the same value as MOLT_API_KEY in the worker.';
        statusEl.className = 'status-msg error';
      } else if (resp.status >= 500) {
        statusEl.textContent = 'Worker error. Try again in a moment.';
        statusEl.className = 'status-msg error';
      } else if (!resp.ok) {
        statusEl.textContent = `Connection failed (${resp.status}). Check Worker URL and API key.`;
        statusEl.className = 'status-msg error';
      }
    }
  } catch (err) {
    const statusEl = document.getElementById('status-msg');
    if (statusEl) {
      statusEl.textContent = 'Network error. Check Worker URL and that the worker is reachable.';
      statusEl.className = 'status-msg error';
    }
  }

  badgeEl.textContent = 'Not connected';
  badgeEl.className = 'badge disconnected';
}

// ═══════════════════════════════════════════════════════════════════════════
//  SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function extractFromTab(tabId) {
  try {
    // Try injecting the content script first
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
  } catch { /* already injected or restricted page */ }

  // Small delay for script to register
  await new Promise(r => setTimeout(r, 100));

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__moltExtract ? window.__moltExtract() : null,
    });

    if (result?.result) return result.result;
  } catch { /* fall through */ }

  // Fallback
  try {
    const [fallback] = await chrome.scripting.executeScript({
      target: { tabId },
      func: fallbackExtract,
    });
    return fallback?.result || null;
  } catch {
    return null;
  }
}

async function sendToWorker(payload) {
  const stored = await chrome.storage.local.get(['workerUrl', 'apiKey']);
  const workerUrl = (stored.workerUrl || DEFAULT_WORKER_URL).replace(/\/+$/, '');
  const apiKey = stored.apiKey;

  const resp = await fetch(`${workerUrl}/extension/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json().catch(() => ({ ok: false, error: { message: 'Invalid response from worker' } }));
  return data;
}

function resetBtn(btn, text) {
  btn.disabled = false;
  btn.textContent = text;
}

function detectSource(url) {
  if (!url) return 'Unknown';
  if (url.includes('linkedin.com'))    return 'LinkedIn';
  if (url.includes('salesforce.com') || url.includes('force.com')) return 'Salesforce';
  if (url.includes('outreach.io'))     return 'Outreach';
  if (url.includes('commonroom.io'))   return 'Common Room';
  if (url.includes('looker.com') || url.includes('lookerstudio')) return 'Looker';
  if (url.includes('hubspot.com'))     return 'HubSpot';
  if (url.includes('gong.io'))         return 'Gong';
  if (url.includes('apollo.io'))       return 'Apollo';
  if (url.includes('zoominfo.com'))    return 'ZoomInfo';
  if (url.includes('6sense.com'))      return '6sense';
  try { return new URL(url).hostname; } catch { return 'Website'; }
}

function detectSourceShort(url) {
  if (!url) return '?';
  if (url.includes('linkedin.com'))    return 'LI';
  if (url.includes('salesforce.com') || url.includes('force.com')) return 'SF';
  if (url.includes('outreach.io'))     return 'OR';
  if (url.includes('commonroom.io'))   return 'CR';
  if (url.includes('hubspot.com'))     return 'HS';
  if (url.includes('gong.io'))         return 'GG';
  if (url.includes('apollo.io'))       return 'AP';
  if (url.includes('zoominfo.com'))    return 'ZI';
  if (url.includes('6sense.com'))      return '6S';
  return 'WEB';
}

function showStatus(el, msg, type) {
  el.textContent = msg;
  el.className = `status-msg ${type}`;
  if (type === 'success') {
    setTimeout(() => { el.className = 'status-msg'; }, 8000);
  }
}

async function updateStats() {
  const stored = await chrome.storage.local.get(['totalCaptures', 'todayCaptures', 'lastCaptureDate']);
  const today = new Date().toDateString();
  const total = (stored.totalCaptures || 0) + 1;
  const todayCount = stored.lastCaptureDate === today ? (stored.todayCaptures || 0) + 1 : 1;

  await chrome.storage.local.set({ totalCaptures: total, todayCaptures: todayCount, lastCaptureDate: today });
  document.getElementById('total-captures').textContent = total;
  document.getElementById('today-captures').textContent = todayCount;
}

function renderEntities(data) {
  const items = [];

  for (const a of (data.accounts || [])) {
    items.push({ type: 'account', name: a.name || a.domain || a.url || '?' });
  }
  for (const p of (data.people || [])) {
    items.push({ type: 'person', name: p.name || p.title || '?' });
  }
  for (const t of (data.technologies || [])) {
    items.push({ type: 'tech', name: typeof t === 'string' ? t : t.name || '?' });
  }
  for (const s of (data.signals || [])) {
    items.push({ type: 'signal', name: typeof s === 'string' ? s : s.text || '?' });
  }

  if (items.length === 0) {
    entitiesList.innerHTML = '<div class="empty-preview">No entities detected.</div>';
    return;
  }

  entitiesList.innerHTML = items.map(i => `
    <div class="entity">
      <span class="type ${i.type}">${i.type}</span>
      <span class="name">${esc(i.name)}</span>
    </div>
  `).join('');
}

async function refreshRabbitIntel(tabId) {
  if (!tabId) return;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'rabbit:getLatestIntel', tabId });
    if (response?.ok && response.data) {
      renderRabbitInsight(response.data.intel || response.data);
      renderLearnStatus(response.data.learnIntel || null);
    }
  } catch {}
}

function renderRabbitInsight(intel) {
  if (!rabbitLatestInsight) return;
  if (!intel) {
    rabbitLatestInsight.innerHTML = '<div class="empty-preview">Rabbit will surface the latest high-signal page insight here.</div>';
    return;
  }

  const summary = typeof intel === 'string' ? intel : intel.summary;
  const opportunities = typeof intel === 'object' && Array.isArray(intel.opportunities) ? intel.opportunities : [];
  rabbitLatestInsight.innerHTML = `
    <div class="entity">
      <span class="type signal">signal</span>
      <span class="name">${esc(summary || 'Rabbit is watching this page.')}</span>
    </div>
    ${opportunities.slice(0, 3).map((item) => `
      <div class="entity">
        <span class="type account">opportunity</span>
        <span class="name">${esc(item.title || item)}</span>
      </div>
    `).join('')}
  `;
}

function renderLearnStatus(status) {
  if (!rabbitLearnStatus) return;
  if (!status) {
    rabbitLearnStatus.innerHTML = '<div class="empty-preview">Learn Mode will map visible fields, page structure, consensus assumptions, and validation signals here.</div>';
    return;
  }

  const mappedFields = Array.isArray(status.mappedFields) ? status.mappedFields : [];
  const findings = Array.isArray(status.validationFindings) ? status.validationFindings : [];
  rabbitLearnStatus.innerHTML = `
    <div class="entity">
      <span class="type signal">learn</span>
      <span class="name">${esc(status.summary || 'Learn Mode is building a consensus model for this app.')}</span>
    </div>
    ${mappedFields.slice(0, 4).map((field) => `
      <div class="entity">
        <span class="type tech">field</span>
        <span class="name">${esc(field)}</span>
      </div>
    `).join('')}
    ${findings.slice(0, 3).map((item) => `
      <div class="entity">
        <span class="type person">check</span>
        <span class="name">${esc(item)}</span>
      </div>
    `).join('')}
  `;
}

function renderRabbitAnswer(answerData) {
  if (!rabbitAnswer) return;
  const answer = answerData?.answer || 'Rabbit did not return an answer.';
  const bullets = answerData?.nextActions || [];
  rabbitAnswer.innerHTML = `
    <div class="entity">
      <span class="type signal">answer</span>
      <span class="name">${esc(answer)}</span>
    </div>
    ${bullets.map((item) => `
      <div class="entity">
        <span class="type person">next</span>
        <span class="name">${esc(item)}</span>
      </div>
    `).join('')}
  `;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}


// ═══════════════════════════════════════════════════════════════════════════
//  TEXT ENTITY EXTRACTION (runs client-side before sending to worker)
// ═══════════════════════════════════════════════════════════════════════════

function extractAccountsFromText(text) {
  const accounts = [];
  // Company suffixes
  const companyPattern = /(?:^|\s)([A-Z][a-zA-Z0-9&'.]+(?:\s+[A-Z][a-zA-Z0-9&'.]+)*\s+(?:Inc\.?|LLC|Corp\.?|Ltd\.?|Co\.?|Group|Holdings|Technologies|Software|Labs|Solutions|Systems|Ventures|Partners|Enterprises))/gm;
  let match;
  while ((match = companyPattern.exec(text)) !== null) {
    accounts.push({ name: match[1].trim(), source: 'text_paste' });
  }

  // Domains
  const domainPattern = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?)/g;
  while ((match = domainPattern.exec(text)) !== null) {
    const domain = match[1].toLowerCase();
    if (!['google.com', 'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'].includes(domain)) {
      accounts.push({ domain, source: 'text_paste' });
    }
  }

  // Dedupe by name or domain
  const seen = new Set();
  return accounts.filter(a => {
    const key = (a.name || a.domain || '').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractPeopleFromText(text) {
  const people = [];
  // Emails → people with domain → account
  const emailPattern = /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  let match;
  while ((match = emailPattern.exec(text)) !== null) {
    people.push({ email: match[0], source: 'text_paste' });
  }

  // Name + Title patterns  ("John Smith, VP of Sales at Acme Corp")
  const nameTitle = /([A-Z][a-z]+(?:\s[A-Z][a-z]+)+),?\s*(?:(?:VP|Director|Manager|Head|Chief|SVP|EVP|President|CEO|CTO|CRO|CMO|CFO|COO)\s+(?:of\s+)?[\w\s]+?)(?:\s+at\s+([A-Z][\w\s&.]+))?/g;
  while ((match = nameTitle.exec(text)) !== null) {
    people.push({
      name: match[1].trim(),
      currentCompany: match[2]?.trim() || '',
      source: 'text_paste',
    });
  }

  return people;
}

function extractTechFromText(text) {
  const techs = new Set();
  const techKeywords = [
    'Salesforce', 'HubSpot', 'Marketo', 'Outreach', 'Gong', 'Drift', 'Intercom',
    'Zendesk', 'ServiceNow', 'Workday', 'SAP', 'Oracle', 'Microsoft 365', 'Slack',
    'Zoom', 'AWS', 'Azure', 'GCP', 'Snowflake', 'Databricks', 'Datadog', 'Splunk',
    'New Relic', 'PagerDuty', 'Jira', 'Confluence', 'GitHub', 'GitLab', 'Terraform',
    'Kubernetes', 'Docker', 'Jenkins', 'CircleCI', 'Vercel', 'Netlify', 'Cloudflare',
    'Stripe', 'Twilio', 'SendGrid', 'Segment', 'Amplitude', 'Mixpanel', 'Pendo',
    'LaunchDarkly', 'Optimizely', 'Contentful', 'Sanity', 'WordPress', 'Shopify',
    'Magento', 'BigCommerce', 'React', 'Vue.js', 'Angular', 'Next.js', 'Node.js',
    'Python', 'Java', 'Go', 'Rust', 'TypeScript', 'PostgreSQL', 'MongoDB', 'Redis',
    'Elasticsearch', 'Kafka', 'RabbitMQ', 'Algolia', 'Okta', 'Auth0', 'OneLogin',
    'CrowdStrike', 'SentinelOne', 'Zscaler', 'Palo Alto', 'Fortinet',
    'Tableau', 'Power BI', 'Looker', 'dbt', 'Fivetran', 'Airbyte',
    'Monday.com', 'Asana', 'Notion', 'Airtable', 'Figma', 'Miro',
    'Apollo', 'ZoomInfo', '6sense', 'Clari', 'Chorus', 'SalesLoft',
    'Demandbase', 'Bombora', 'TechTarget', 'G2', 'TrustRadius',
  ];

  for (const tech of techKeywords) {
    if (text.includes(tech)) techs.add(tech);
  }
  return Array.from(techs);
}


// ═══════════════════════════════════════════════════════════════════════════
//  FALLBACK EXTRACTOR (when content.js isn't loaded)
// ═══════════════════════════════════════════════════════════════════════════

function fallbackExtract() {
  const url = window.location.href;
  const h = location.hostname;
  const source = h.includes('linkedin.com') ? 'linkedin'
    : (h.includes('salesforce.com') || h.includes('force.com')) ? 'salesforce'
    : h.includes('outreach.io') ? 'outreach'
    : h.includes('commonroom.io') ? 'commonroom'
    : h.includes('hubspot.com') ? 'hubspot'
    : h.includes('looker.com') ? 'looker'
    : 'website';

  const metas = {};
  document.querySelectorAll('meta[name], meta[property]').forEach(m => {
    const k = m.getAttribute('name') || m.getAttribute('property');
    if (k) metas[k] = m.getAttribute('content');
  });

  return {
    url,
    title: document.title,
    source,
    capturedAt: new Date().toISOString(),
    accounts: [{ domain: h, url: location.origin, source: 'website' }],
    people: [],
    technologies: [],
    signals: [],
    metadata: metas,
    rawText: (document.body?.innerText || '').substring(0, 15000),
  };
}
