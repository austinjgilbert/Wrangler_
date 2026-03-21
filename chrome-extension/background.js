/**
 * Wrangler – Background Service Worker (v2)
 *
 * Event-driven service worker for the Wrangler Chrome extension.
 * - Receives DOM snapshots from content.js
 * - Calls Worker /extension/page-intel for account context
 * - Manages capture toggle state (green active / gray paused)
 * - Answers overlay Q&A via /extension/ask
 * - Stores high-value captures via /extension/capture
 */

const DEFAULT_WORKER_URL = 'https://website-scanner.austin-gilbert.workers.dev';
const WRANGLER_APP_URL = 'https://www.sanity.io/@of8nbhG8g/application/fhba58obwhfounyb1893q6ea/';

// Debounce timers for page analysis (per tab)
const analysisTimers = new Map();

// ─── Installation ────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      workerUrl: DEFAULT_WORKER_URL,
      apiKey: '',
      totalCaptures: 0,
      todayCaptures: 0,
      lastCaptureDate: '',
      captureEnabled: true,
      overlayEnabled: true,
      storeImportant: true,
    });
  }

  // Phase B: Context menus (requires contextMenus permission)
  // chrome.contextMenus.create({ id: 'wrangler-capture-page', ... });

  // Set initial icon state
  updateIconState(true);
});

// ─── Action icon click → toggle capture ──────────────────────────────────────

chrome.action.onClicked.addListener(async () => {
  const { captureEnabled } = await chrome.storage.local.get(['captureEnabled']);
  const newState = !captureEnabled;
  await chrome.storage.local.set({ captureEnabled: newState });
  await updateIconState(newState);

  // Notify all tabs of state change
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'wrangler:captureStateChanged',
        enabled: newState,
      }).catch(() => {});
    }
  }
});

async function updateIconState(enabled) {
  const color = enabled ? '#22c55e' : '#6b7280';
  const text = enabled ? '' : 'OFF';
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  await chrome.action.setTitle({
    title: enabled ? 'Wrangler — Capture active' : 'Wrangler — Capture paused',
  });
}

// ─── Message handling ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) return false;

  switch (message.type) {
    case 'wrangler:pageContext': {
      const tabId = sender?.tab?.id;
      if (!tabId || !message.payload) {
        sendResponse({ ok: false, error: 'Missing tab or payload' });
        return false;
      }
      scheduleAnalysis(tabId, message.payload)
        .then((result) => sendResponse({ ok: true, data: result }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true; // async response
    }

    case 'wrangler:linkedinCapture': {
      const profile = message.profile;
      const profileUrl = String(message.profileUrl || '').trim();
      if (!profile?.name || !profileUrl) {
        sendResponse({ ok: false, error: 'Missing profile data or URL' });
        return false;
      }
      handleLinkedInCapture(profileUrl, profile)
        .then((result) => sendResponse({ ok: true, data: result }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true; // async response
    }

    case 'wrangler:ask': {
      const prompt = String(message.prompt || '').trim();
      if (!prompt) {
        sendResponse({ ok: false, error: 'prompt is required' });
        return false;
      }
      handleAsk(prompt, message.page || null)
        .then((result) => sendResponse({ ok: true, data: result }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true; // async response
    }

    case 'wrangler:getState': {
      const tabId = sender?.tab?.id || message.tabId;
      Promise.all([
        getTabState(tabId),
        chrome.storage.local.get(['captureEnabled', 'overlayEnabled']),
      ])
        .then(([tabState, settings]) => {
          sendResponse({
            ok: true,
            data: {
              intel: tabState?.intel || null,
              captureEnabled: settings.captureEnabled !== false,
              overlayEnabled: settings.overlayEnabled !== false,
            },
          });
        })
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    case 'wrangler:openApp': {
      const accountKey = message.accountKey || '';
      const url = accountKey
        ? `${WRANGLER_APP_URL}?view=command-center&account=${encodeURIComponent(accountKey)}`
        : `${WRANGLER_APP_URL}?view=command-center`;
      chrome.tabs.create({ url });
      sendResponse({ ok: true });
      return false;
    }

    case 'wrangler:openSettings': {
      chrome.runtime.openOptionsPage();
      sendResponse({ ok: true });
      return false;
    }

    case 'wrangler:setOverlayEnabled': {
      chrome.storage.local.set({ overlayEnabled: !!message.enabled });
      sendResponse({ ok: true });
      return false;
    }

    case 'wrangler:setCaptureRule': {
      // D1: Per-site capture rules — 'always' | 'never' | null (clear rule)
      const ruleDomain = String(message.domain || '').trim().toLowerCase();
      const ruleValue = message.rule; // 'always' | 'never' | null
      if (!ruleDomain) {
        sendResponse({ ok: false, error: 'domain is required' });
        return false;
      }
      if (ruleValue && ruleValue !== 'always' && ruleValue !== 'never') {
        sendResponse({ ok: false, error: 'rule must be always, never, or null' });
        return false;
      }
      chrome.storage.local.get(['captureRules'], (result) => {
        const rules = result.captureRules || {};
        if (ruleValue) {
          rules[ruleDomain] = ruleValue;
        } else {
          delete rules[ruleDomain];
        }
        chrome.storage.local.set({ captureRules: rules }, () => {
          sendResponse({ ok: true, rules });
        });
      });
      return true; // async response
    }

    case 'wrangler:getCaptureRules': {
      chrome.storage.local.get(['captureRules'], (result) => {
        sendResponse({ ok: true, rules: result.captureRules || {} });
      });
      return true; // async response
    }

    default:
      return false;
  }
});

// Phase B: Context menus (requires contextMenus permission in manifest)

// ─── Page analysis (debounced) ───────────────────────────────────────────────

async function scheduleAnalysis(tabId, payload) {
  const settings = await getSettings();
  if (!settings.apiKey) {
    return { skipped: true, reason: 'API key missing' };
  }

  // D1: Per-site capture rules override global toggle
  const domain = payload.domain || '';
  const siteRule = getCaptureRule(settings, domain);
  if (siteRule === 'never') {
    return { skipped: true, reason: `Capture disabled for ${domain}` };
  }
  if (!settings.captureEnabled && siteRule !== 'always') {
    return { skipped: true, reason: 'Capture disabled' };
  }

  if (analysisTimers.has(tabId)) {
    clearTimeout(analysisTimers.get(tabId));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(async () => {
      analysisTimers.delete(tabId);
      try {
        const state = await getTabState(tabId);

        // Skip if page hasn't changed
        if (state?.lastFingerprint === payload.fingerprint) {
          resolve({
            skipped: true,
            reason: 'Fingerprint unchanged',
            intel: state.intel || null,
          });
          return;
        }

        // Save payload immediately
        await setTabState(tabId, {
          lastFingerprint: payload.fingerprint,
          payload,
          lastObservedAt: new Date().toISOString(),
        });

        // Request page intelligence from Worker
        const intel = await requestPageIntel(payload, settings);

        await setTabState(tabId, {
          lastFingerprint: payload.fingerprint,
          payload,
          intel,
          lastObservedAt: new Date().toISOString(),
        });

        // Determine if overlay should be notified
        const previousIntel = state?.intel || null;
        const shouldNotify = !previousIntel
          || previousIntel.interruptKey !== intel?.interruptKey
          || (intel?.interruptLevel === 'high' && previousIntel?.interruptLevel !== 'high');

        if (settings.overlayEnabled && shouldNotify) {
          await chrome.tabs.sendMessage(tabId, {
            type: 'wrangler:intel',
            intel,
          }).catch(() => {});
        }

        // Store intel for badge
        if (intel) {
          await chrome.storage.local.set({ lastIntel: intel });
        }

        // Auto-capture high-value pages
        if (intel?.shouldStoreCapture && settings.storeImportant) {
          const storedFingerprints = Array.isArray(state?.storedFingerprints)
            ? state.storedFingerprints
            : [];
          if (!storedFingerprints.includes(payload.fingerprint)) {
            const captureResult = await capturePayload(
              normalizeWorkerUrl(settings.workerUrl),
              settings.apiKey,
              payload,
            );
            storedFingerprints.push(payload.fingerprint);
            await setTabState(tabId, {
              ...state,
              payload,
              intel,
              lastFingerprint: payload.fingerprint,
              storedFingerprints: storedFingerprints.slice(-25),
              lastCaptureResult: captureResult,
              lastObservedAt: new Date().toISOString(),
            });
          }
        }

        await updateBadgeForIntel(intel);
        resolve({ intel });
      } catch (error) {
        reject(error);
      }
    }, 1200);

    analysisTimers.set(tabId, timer);
  });
}

// ─── Worker API calls ────────────────────────────────────────────────────────

async function requestPageIntel(payload, settings) {
  const response = await fetch(`${normalizeWorkerUrl(settings.workerUrl)}/extension/page-intel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': settings.apiKey,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({
    ok: false,
    error: { message: 'Invalid response from worker' },
  }));
  if (!data.ok) {
    throw new Error(data?.error?.message || 'Page analysis failed');
  }
  return data.data || null;
}

async function handleLinkedInCapture(profileUrl, profile) {
  const settings = await getSettings();
  if (!settings.apiKey) {
    throw new Error('API key not configured. Open Settings to add your key.');
  }
  const workerUrl = normalizeWorkerUrl(settings.workerUrl);
  const response = await fetch(`${workerUrl}/extension/linkedin-capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': settings.apiKey,
    },
    body: JSON.stringify({
      profileUrl,
      capturedAt: new Date().toISOString(),
      source: 'extension_dom',
      profile,
    }),
  });
  const data = await response.json().catch(() => ({
    ok: false,
    error: { message: 'Invalid response from worker' },
  }));
  if (!data.ok) {
    throw new Error(data?.error?.message || 'LinkedIn capture failed');
  }
  return data.data || null;
}

async function handleAsk(prompt, page) {
  const settings = await getSettings();
  if (!settings.apiKey) {
    throw new Error('API key not configured. Open Settings to add your key.');
  }
  const workerUrl = normalizeWorkerUrl(settings.workerUrl);
  const body = { prompt };
  if (page) body.page = page;

  const response = await fetch(`${workerUrl}/extension/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': settings.apiKey,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({
    ok: false,
    error: { message: 'Invalid response from worker' },
  }));
  if (!data.ok) {
    throw new Error(data?.error?.message || 'Ask failed');
  }
  return data.data || null;
}

async function capturePayload(workerUrl, apiKey, payload) {
  try {
    const enrichedPayload = enrichCapturePayload(payload);
    if (!enrichedPayload) {
      return { ok: false, error: { message: 'Missing required domain' } };
    }

    const resp = await fetch(`${workerUrl}/extension/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(enrichedPayload),
    });

    const data = await resp.json().catch(() => ({}));
    if (data && data.ok) {
      const stored = await chrome.storage.local.get([
        'totalCaptures',
        'todayCaptures',
        'lastCaptureDate',
      ]);
      const today = new Date().toDateString();
      const total = (stored.totalCaptures || 0) + 1;
      const todayCount = stored.lastCaptureDate === today
        ? (stored.todayCaptures || 0) + 1
        : 1;
      await chrome.storage.local.set({
        totalCaptures: total,
        todayCaptures: todayCount,
        lastCaptureDate: today,
      });
    }
    return data;
  } catch (error) {
    console.error('[Wrangler] Capture failed:', error.message);
    return { ok: false, error: { message: error.message } };
  }
}

// ─── Payload enrichment ──────────────────────────────────────────────────────

function enrichCapturePayload(payload) {
  if (!payload) return null;

  const url = payload.interaction?.url || payload.url || payload.contextUrl || '';
  const domain = String(
    payload.domain || payload.interaction?.domain || extractDomainFromUrl(url),
  ).trim();
  if (!domain) {
    console.warn('[Wrangler] Capture skipped: missing domain');
    return null;
  }

  const timestamp = payload.interaction?.timestamp || payload.capturedAt || new Date().toISOString();
  const title = payload.interaction?.title || payload.title || '';
  const companyName = String(
    payload.companyName
      || payload.interaction?.companyName
      || inferCompanyNameFromCapture(payload, domain),
  ).trim();

  return {
    ...payload,
    url,
    title,
    domain,
    companyName,
    capturedAt: timestamp,
    captureSource: 'chrome_extension',
    pageSource: payload.pageSource || payload.source || 'website',
    interaction: {
      _type: 'interaction',
      source: 'chrome_extension',
      domain,
      url,
      title,
      companyName,
      timestamp,
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractDomainFromUrl(url) {
  try {
    return new URL(url).hostname || '';
  } catch {
    return '';
  }
}

function inferCompanyNameFromCapture(payload, domain) {
  const accountName = (payload?.accounts || []).find((a) => a?.name)?.name;
  if (accountName) return accountName;

  const metaSiteName = payload?.metadata?.ogSiteName
    || payload?.metadata?.['og:site_name']
    || payload?.metadata?.['application-name'];
  if (metaSiteName) return String(metaSiteName).trim();

  const titleRoot = String(payload?.title || '')
    .split(/\s+[|–—-]\s+/)
    .map((part) => part.trim())
    .find(Boolean);
  if (titleRoot) return titleRoot;

  const base = String(domain || '').replace(/^www\./i, '').split('.')[0] || '';
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : '';
}

async function extractTabPayload(tabId) {
  // E5: Use message passing instead of window globals.
  // Content script handles 'wrangler:extractPayload' and returns page context.
  try {
    // Ensure content script is injected
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
      });
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 120));

    // Request payload via message passing (no window globals)
    const response = await chrome.tabs.sendMessage(tabId, { type: 'wrangler:extractPayload' });
    if (response?.ok && response.data) return response.data;
  } catch {}

  // Fallback: inline extraction if content script isn't responding
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

function fallbackExtract() {
  const url = window.location.href;
  const h = location.hostname;
  const source = h.includes('linkedin.com') ? 'linkedin'
    : (h.includes('salesforce.com') || h.includes('force.com')) ? 'salesforce'
      : h.includes('outreach.io') ? 'outreach'
        : h.includes('commonroom.io') ? 'commonroom'
          : h.includes('hubspot.com') ? 'hubspot'
            : 'website';

  const text = (document.body?.innerText || '').substring(0, 15000);
  const emails = [...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).slice(0, 25))];
  const phones = [...new Set((text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) || []).slice(0, 20))];
  const timestamp = new Date().toISOString();
  const companyName = (document.title.split(/\s+[|–—-]\s+/)[0] || h.replace(/^www\./i, '').split('.')[0] || '').trim();

  return {
    url,
    title: document.title,
    source,
    capturedAt: timestamp,
    domain: h,
    companyName,
    captureSource: 'chrome_extension',
    pageSource: source,
    accounts: [{ domain: h, url: location.origin, source: 'website' }],
    people: [],
    technologies: [],
    signals: [],
    metadata: {},
    emails,
    phones,
    rawText: text,
    fingerprint: [url, document.title, text.slice(0, 500)].join('|'),
    interaction: {
      _type: 'interaction',
      source: 'chrome_extension',
      domain: h,
      url,
      title: document.title,
      companyName,
      timestamp,
    },
  };
}

async function updateBadgeForIntel(intel) {
  const count = Math.min(9, (intel?.opportunities || []).length || 0);
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  await chrome.action.setBadgeBackgroundColor({
    color: count > 0 ? '#f59e0b' : '#22c55e',
  });
}

async function getSettings() {
  return chrome.storage.local.get([
    'workerUrl',
    'apiKey',
    'captureEnabled',
    'overlayEnabled',
    'storeImportant',
    'captureRules',
  ]);
}

/**
 * D1: Check per-site capture rule for a domain.
 * Returns 'always' | 'never' | null (follow global toggle).
 */
function getCaptureRule(settings, domain) {
  const rules = settings.captureRules || {};
  if (!domain) return null;
  // Exact domain match first, then check parent domain (e.g., www.linkedin.com → linkedin.com)
  if (rules[domain]) return rules[domain];
  const parts = domain.split('.');
  if (parts.length > 2) {
    const parent = parts.slice(1).join('.');
    if (rules[parent]) return rules[parent];
  }
  return null;
}

function normalizeWorkerUrl(workerUrl) {
  return (workerUrl || DEFAULT_WORKER_URL).replace(/\/+$/, '');
}

async function getTabState(tabId) {
  if (!tabId) return null;
  const key = `wranglerTab:${tabId}`;
  const result = await chrome.storage.session.get([key]);
  return result[key] || null;
}

async function setTabState(tabId, state) {
  if (!tabId) return;
  const key = `wranglerTab:${tabId}`;
  await chrome.storage.session.set({ [key]: state });
}
