/**
 * Wrangler – Background Service Worker
 *
 * Handles:
 *   - Extension install / update lifecycle
 *   - Badge text updates (capture count)
 *   - Context menu: right-click "Capture this page to Sanity"
 *   - Context menu: right-click selected text → "Send text to Sanity"
 */

const DEFAULT_WORKER_URL = 'https://website-scanner.austin-gilbert.workers.dev';

// ─── Install / Update ────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  // Set defaults on fresh install
  if (details.reason === 'install') {
    chrome.storage.local.set({
      workerUrl: DEFAULT_WORKER_URL,
      apiKey: '',
      totalCaptures: 0,
      todayCaptures: 0,
      lastCaptureDate: '',
    });
  }

  // Create context menus
  chrome.contextMenus.create({
    id: 'capture-page',
    title: 'Capture this page to Sanity',
    contexts: ['page'],
  });

  chrome.contextMenus.create({
    id: 'capture-selection',
    title: 'Send selected text to Sanity',
    contexts: ['selection'],
  });
});

// ─── Badge update ────────────────────────────────────────────────────────
chrome.storage.onChanged.addListener((changes) => {
  if (changes.totalCaptures) {
    const count = changes.totalCaptures.newValue || 0;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
  }
});

// ─── Context menu handler ────────────────────────────────────────────────
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const stored = await chrome.storage.local.get(['workerUrl', 'apiKey']);
  if (!stored.apiKey) {
    console.warn('[Wrangler] No API key configured — open the extension popup to set it.');
    return;
  }

  const workerUrl = (stored.workerUrl || DEFAULT_WORKER_URL).replace(/\/+$/, '');

  if (info.menuItemId === 'capture-page' && tab?.id) {
    // Inject content script and capture
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    } catch { /* already injected */ }

    await new Promise(r => setTimeout(r, 100));

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__moltExtract ? window.__moltExtract() : null,
    });

    if (result?.result) {
      await sendPayload(workerUrl, stored.apiKey, result.result);
    }
  }

  if (info.menuItemId === 'capture-selection' && info.selectionText) {
    const payload = {
      url: tab?.url || 'context-menu://selection',
      title: `Selection from ${tab?.title || 'unknown'}`,
      source: 'text_paste',
      capturedAt: new Date().toISOString(),
      accounts: [],
      people: [],
      technologies: [],
      signals: [],
      metadata: {},
      rawText: info.selectionText.substring(0, 15000),
    };

    await sendPayload(workerUrl, stored.apiKey, payload);
  }
});

// ─── Send to worker ──────────────────────────────────────────────────────
async function sendPayload(workerUrl, apiKey, payload) {
  try {
    const resp = await fetch(`${workerUrl}/extension/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => ({}));

    if (data && data.ok) {
      // Increment stats
      const stored = await chrome.storage.local.get(['totalCaptures', 'todayCaptures', 'lastCaptureDate']);
      const today = new Date().toDateString();
      const total = (stored.totalCaptures || 0) + 1;
      const todayCount = stored.lastCaptureDate === today ? (stored.todayCaptures || 0) + 1 : 1;
      await chrome.storage.local.set({ totalCaptures: total, todayCaptures: todayCount, lastCaptureDate: today });
    }

    return data;
  } catch (err) {
    console.error('[Wrangler] Send failed:', err.message);
    return { ok: false, error: err.message };
  }
}
