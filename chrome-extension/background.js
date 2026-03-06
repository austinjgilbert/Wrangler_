/**
 * Rabbit – Background Service Worker
 *
 * Always-on browser intelligence:
 * - receives DOM snapshots from content.js
 * - calls worker-side page intelligence
 * - updates the in-page overlay
 * - stores high-value captures quietly in the background
 * - answers prompt-box questions with grounded worker data
 */

const DEFAULT_WORKER_URL = 'https://website-scanner.austin-gilbert.workers.dev';
const analysisTimers = new Map();

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      workerUrl: DEFAULT_WORKER_URL,
      apiKey: '',
      totalCaptures: 0,
      todayCaptures: 0,
      lastCaptureDate: '',
      rabbitAutoObserve: true,
      rabbitOverlayEnabled: true,
      rabbitStoreImportant: true,
      rabbitLearnMode: false,
      rabbitLearnSessionId: '',
      rabbitLearnStatus: null,
      rabbitLastInsight: null,
    });
  }

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
  chrome.contextMenus.create({
    id: 'send-to-account-plan',
    title: 'Send to Account Plan Builder',
    contexts: ['page', 'selection'],
  });
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.totalCaptures) {
    const count = changes.totalCaptures.newValue || 0;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'rabbit:pageContext') {
    const tabId = sender?.tab?.id;
    if (!tabId || !message.payload) {
      sendResponse({ ok: false, error: 'Missing tab or payload' });
      return false;
    }

    scheduleAnalysis(tabId, message.payload)
      .then((result) => sendResponse({ ok: true, data: result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'rabbit:ask') {
    handleAsk(message.payload || {}, sender?.tab?.id)
      .then((result) => sendResponse({ ok: true, data: result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'rabbit:getLatestIntel') {
    const tabId = sender?.tab?.id || message.tabId;
    getTabState(tabId)
      .then((state) => sendResponse({ ok: true, data: { intel: state?.intel || null, learnIntel: state?.learnIntel || null } }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const stored = await getSettings();
  if (!stored.apiKey) {
    console.warn('[Rabbit] No API key configured — open the extension popup to set it.');
    return;
  }

  const workerUrl = normalizeWorkerUrl(stored.workerUrl);

  if (info.menuItemId === 'capture-page' && tab?.id) {
    const extracted = await extractTabPayload(tab.id);
    if (extracted) {
      await capturePayload(workerUrl, stored.apiKey, extracted);
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
    await capturePayload(workerUrl, stored.apiKey, payload);
  }

  if (info.menuItemId === 'send-to-account-plan') {
    await sendToAccountPlan(workerUrl, stored.apiKey, info, tab);
  }
});

async function scheduleAnalysis(tabId, payload) {
  const settings = await getSettings();
  if (!settings.apiKey || !settings.rabbitAutoObserve) {
    return { skipped: true, reason: 'Auto-observe disabled or API key missing' };
  }

  if (analysisTimers.has(tabId)) {
    clearTimeout(analysisTimers.get(tabId));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(async () => {
      analysisTimers.delete(tabId);
      try {
        const state = await getTabState(tabId);
        if (state?.lastFingerprint === payload.fingerprint) {
          resolve({ skipped: true, reason: 'Fingerprint unchanged', intel: state.intel || null });
          return;
        }

        await setTabState(tabId, {
          lastFingerprint: payload.fingerprint,
          payload,
          lastObservedAt: new Date().toISOString(),
        });

        const intel = await requestPageIntel(payload, settings);
        let learnIntel = state?.learnIntel || null;
        if (settings.rabbitLearnMode) {
          if (!settings.rabbitLearnSessionId) {
            const learnSessionId = createLearnSessionId(payload);
            await chrome.storage.local.set({ rabbitLearnSessionId: learnSessionId });
            settings.rabbitLearnSessionId = learnSessionId;
          }
          learnIntel = await requestLearnMode(payload, settings);
        }
        await setTabState(tabId, {
          lastFingerprint: payload.fingerprint,
          payload,
          intel,
          learnIntel,
          lastObservedAt: new Date().toISOString(),
        });

        const previousIntel = state?.intel || null;
        const shouldInterrupt = !previousIntel
          || previousIntel.interruptKey !== intel?.interruptKey
          || (intel?.interruptLevel === 'high' && previousIntel?.interruptLevel !== 'high');

        if (settings.rabbitOverlayEnabled && shouldInterrupt) {
          await chrome.tabs.sendMessage(tabId, { type: 'rabbit:intel', intel }).catch(() => {});
        }

        if (intel) {
          await chrome.storage.local.set({
            rabbitLastInsight: intel,
            rabbitLastIntel: intel,
          });
        }
        if (learnIntel) {
          await chrome.storage.local.set({
            rabbitLearnStatus: learnIntel,
          });
        }

        if (intel?.shouldStoreCapture && settings.rabbitStoreImportant) {
          const storedFingerprints = Array.isArray(state?.storedFingerprints) ? state.storedFingerprints : [];
          if (!storedFingerprints.includes(payload.fingerprint)) {
            const captureResult = await capturePayload(normalizeWorkerUrl(settings.workerUrl), settings.apiKey, payload);
            storedFingerprints.push(payload.fingerprint);
            await setTabState(tabId, {
              ...state,
              payload,
              intel,
              learnIntel,
              lastFingerprint: payload.fingerprint,
              storedFingerprints: storedFingerprints.slice(-25),
              lastCaptureResult: captureResult,
              lastObservedAt: new Date().toISOString(),
            });
          }
        }

        if (settings.rabbitOverlayEnabled && learnIntel) {
          await chrome.tabs.sendMessage(tabId, { type: 'rabbit:learnIntel', learnIntel }).catch(() => {});
        }

        await updateActionBadgeForIntel(intel);
        resolve({ intel, learnIntel });
      } catch (error) {
        reject(error);
      }
    }, 1200);

    analysisTimers.set(tabId, timer);
  });
}

async function handleAsk(payload, senderTabId) {
  const settings = await getSettings();
  if (!settings.apiKey) throw new Error('Missing API key');

  let page = payload.page || null;
  const tabId = senderTabId || payload.tabId || null;
  if (!page && tabId) {
    const state = await getTabState(tabId);
    page = state?.payload || null;
  }
  if (!page && tabId) {
    page = await extractTabPayload(tabId);
  }

  const response = await fetch(`${normalizeWorkerUrl(settings.workerUrl)}/extension/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      prompt: payload.prompt || '',
      page,
      threadId: payload.threadId || null,
    }),
  });
  const data = await response.json().catch(() => ({ ok: false, error: { message: 'Invalid response from worker' } }));
  if (!data.ok) {
    throw new Error(data?.error?.message || 'Question failed');
  }
  return data.data;
}

async function requestPageIntel(payload, settings) {
  const response = await fetch(`${normalizeWorkerUrl(settings.workerUrl)}/extension/page-intel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({ ok: false, error: { message: 'Invalid response from worker' } }));
  if (!data.ok) {
    throw new Error(data?.error?.message || 'Page analysis failed');
  }
  return data.data || null;
}

async function requestLearnMode(payload, settings) {
  const response = await fetch(`${normalizeWorkerUrl(settings.workerUrl)}/extension/learn`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      ...payload,
      learnMode: {
        sessionId: settings.rabbitLearnSessionId || createLearnSessionId(payload),
      },
    }),
  });
  const data = await response.json().catch(() => ({ ok: false, error: { message: 'Invalid response from worker' } }));
  if (!data.ok) {
    throw new Error(data?.error?.message || 'Learn Mode failed');
  }
  return data.data || null;
}

async function sendToAccountPlan(workerUrl, apiKey, info, tab) {
  let extractedData = null;
  if (tab?.id) {
    extractedData = await extractTabPayload(tab.id);
  }

  const ingestPayload = {
    selectedText: info.selectionText ? info.selectionText.substring(0, 15000) : '',
    pageUrl: tab?.url || '',
    pageTitle: tab?.title || '',
  };

  if (extractedData) {
    ingestPayload.extractedData = {
      source: extractedData.source || 'website',
      accounts: (extractedData.accounts || []).slice(0, 20),
      people: (extractedData.people || []).slice(0, 20),
      technologies: (extractedData.technologies || []).slice(0, 50),
      signals: (extractedData.signals || []).slice(0, 20),
      metadata: extractedData.metadata || {},
      rawText: (extractedData.rawText || '').substring(0, 15000),
    };
  }

  let screenshotDataUrl = null;
  try {
    if (tab?.id) {
      screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    }
  } catch {}
  if (screenshotDataUrl) ingestPayload.screenshotDataUrl = screenshotDataUrl;

  let accountName = extractedData?.accounts?.[0]?.name || '';
  if (!accountName) {
    accountName = (tab?.title || '')
      .replace(/\s*[\|–—-]\s*(LinkedIn|Company Page|Overview|About|Salesforce|HubSpot|Outreach|Home).*$/i, '')
      .trim()
      .substring(0, 100);
  }
  ingestPayload.accountName = accountName || 'Unknown Account';

  const resp = await fetch(`${workerUrl}/account-plan/context/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(ingestPayload),
  });
  const data = await resp.json().catch(() => ({}));
  if (data && data.ok && data.data?.draftId) {
    const contextUrl = `${workerUrl}/account-plan/context?draftId=${encodeURIComponent(data.data.draftId)}&accountName=${encodeURIComponent(data.data.accountName || '')}`;
    chrome.tabs.create({ url: contextUrl });
    return;
  }
  console.warn('[Rabbit] Account Plan ingest failed:', data);
}

async function extractTabPayload(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
  } catch {}

  await new Promise((resolve) => setTimeout(resolve, 120));

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (window.__rabbitBuildPageContext) return window.__rabbitBuildPageContext();
        if (window.__moltExtract) return window.__moltExtract();
        return null;
      },
    });
    if (result?.result) return result.result;
  } catch {}

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

async function capturePayload(workerUrl, apiKey, payload) {
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
      const stored = await chrome.storage.local.get(['totalCaptures', 'todayCaptures', 'lastCaptureDate']);
      const today = new Date().toDateString();
      const total = (stored.totalCaptures || 0) + 1;
      const todayCount = stored.lastCaptureDate === today ? (stored.todayCaptures || 0) + 1 : 1;
      await chrome.storage.local.set({ totalCaptures: total, todayCaptures: todayCount, lastCaptureDate: today });
    }
    return data;
  } catch (error) {
    console.error('[Rabbit] Send failed:', error.message);
    return { ok: false, error: { message: error.message } };
  }
}

async function updateActionBadgeForIntel(intel) {
  const count = Math.min(9, (intel?.opportunities || []).length || 0);
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: count > 0 ? '#f59e0b' : '#22c55e' });
}

async function getSettings() {
  return chrome.storage.local.get([
    'workerUrl',
    'apiKey',
    'rabbitAutoObserve',
    'rabbitOverlayEnabled',
    'rabbitStoreImportant',
    'rabbitLearnMode',
    'rabbitLearnSessionId',
  ]);
}

function normalizeWorkerUrl(workerUrl) {
  return (workerUrl || DEFAULT_WORKER_URL).replace(/\/+$/, '');
}

async function getTabState(tabId) {
  if (!tabId) return null;
  const key = `rabbitTabState:${tabId}`;
  const result = await chrome.storage.session.get([key]);
  return result[key] || null;
}

async function setTabState(tabId, state) {
  if (!tabId) return;
  const key = `rabbitTabState:${tabId}`;
  await chrome.storage.session.set({ [key]: state });
}

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

  const text = (document.body?.innerText || '').substring(0, 15000);
  const emails = [...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).slice(0, 25))];
  const phones = [...new Set((text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) || []).slice(0, 20))];

  return {
    url,
    title: document.title,
    source,
    capturedAt: new Date().toISOString(),
    accounts: [{ domain: h, url: location.origin, source: 'website' }],
    people: [],
    technologies: [],
    signals: [],
    metadata: {},
    emails,
    phones,
    rawText: text,
    fingerprint: [url, document.title, text.slice(0, 500)].join('|'),
  };
}

function createLearnSessionId(payload) {
  try {
    const url = new URL(payload?.contextUrl || payload?.url || '');
    const host = (url.hostname || 'session').replace(/[^a-z0-9.-]/gi, '-');
    return `learn-${host}-${new Date().toISOString().slice(0, 13).replace(/[:T]/g, '-')}`;
  } catch {
    return `learn-${Date.now()}`;
  }
}
