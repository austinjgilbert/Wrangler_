/**
 * Wrangler – Settings Page
 *
 * Manages Worker URL, API key, and extension preferences.
 * All settings stored in chrome.storage.local.
 */

const DEFAULT_WORKER_URL = 'https://website-scanner.austin-gilbert.workers.dev';

const workerUrlInput = document.getElementById('workerUrl');
const apiKeyInput = document.getElementById('apiKey');
const storeImportantToggle = document.getElementById('storeImportant');
const overlayEnabledToggle = document.getElementById('overlayEnabled');
const saveBtn = document.getElementById('save');
const testBtn = document.getElementById('test');
const statusEl = document.getElementById('status');

// Load current settings
chrome.storage.local.get(
  ['workerUrl', 'apiKey', 'storeImportant', 'overlayEnabled'],
  (result) => {
    workerUrlInput.value = result.workerUrl || DEFAULT_WORKER_URL;
    apiKeyInput.value = result.apiKey || '';
    storeImportantToggle.checked = result.storeImportant !== false;
    overlayEnabledToggle.checked = result.overlayEnabled !== false;
  },
);

// Save
saveBtn.addEventListener('click', () => {
  const workerUrl = workerUrlInput.value.trim().replace(/\/+$/, '') || DEFAULT_WORKER_URL;
  const apiKey = apiKeyInput.value.trim();

  chrome.storage.local.set(
    {
      workerUrl,
      apiKey,
      storeImportant: storeImportantToggle.checked,
      overlayEnabled: overlayEnabledToggle.checked,
    },
    () => {
      showStatus('Settings saved.', 'success');
    },
  );
});

// Test connection
testBtn.addEventListener('click', async () => {
  const workerUrl = workerUrlInput.value.trim().replace(/\/+$/, '') || DEFAULT_WORKER_URL;
  const apiKey = apiKeyInput.value.trim();

  if (!apiKey) {
    showStatus('Enter an API key first.', 'error');
    return;
  }

  testBtn.textContent = 'Testing…';
  testBtn.disabled = true;

  try {
    const response = await fetch(`${workerUrl}/extension/check`, {
      method: 'GET',
      headers: { 'X-API-Key': apiKey },
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data.ok || data.data?.ok) {
        showStatus('✓ Connected to Wrangler Worker.', 'success');
      } else {
        showStatus(`Worker responded but returned an error: ${data.error?.message || 'Unknown'}`, 'error');
      }
    } else if (response.status === 401 || response.status === 403) {
      showStatus('Invalid API key. Check your key and try again.', 'error');
    } else {
      showStatus(`Worker returned HTTP ${response.status}. Check the URL.`, 'error');
    }
  } catch (error) {
    showStatus(`Can't reach Worker: ${error.message}. Check the URL.`, 'error');
  } finally {
    testBtn.textContent = 'Test Connection';
    testBtn.disabled = false;
  }
});

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  setTimeout(() => {
    statusEl.className = 'status';
  }, 5000);
}
