# Chrome Extension Setup

The **Wrangler** Chrome extension captures data from web pages and sends it to the worker to run enrichment and fill the database. The extension shows **Not connected** until you configure the worker URL and API key.

## 1. Load the extension

1. Open Chrome and go to `chrome://extensions/`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the project folder **`chrome-extension`** (inside this repo).
4. The extension icon should appear in the toolbar.

## 2. Set the API key (required to connect)

The worker requires the same API key used for the Custom GPT / wrangler ingest. If you haven’t set it in production yet:

```bash
# From project root
npx wrangler secret put MOLT_API_KEY --env=production
# Paste your secret when prompted (e.g. a long random string)
```

Use **that same value** in the extension:

1. Click the extension icon to open the popup.
2. Click **Settings**.
3. **Worker URL:** leave as  
   `https://website-scanner.austin-gilbert.workers.dev`  
   (or your own worker URL if you use a different deployment).
4. **API Key:** paste the same value you set for `MOLT_API_KEY` in the worker (Bearer key).
5. Click **Save**.

The badge will change to **Connected** only after the extension successfully calls `GET /extension/check` with your key. If it stays **Not connected**, check:

- Worker URL has no trailing slash and is reachable.
- API key matches the production secret exactly (no extra spaces).
- Production worker has `MOLT_API_KEY` set (`wrangler secret list --env=production`).

## 3. Capture and enrichment

- **Capture This Page** – extracts entities from the current tab and sends them to the worker; the worker resolves accounts/people, writes to Sanity, and queues enrichment.
- **Bulk** – select multiple tabs and capture them in one go.
- **Text** – paste text; the extension extracts companies/people/tech and sends the same payload to the worker.

All captures go to `POST /extension/capture` and flow into the same Content OS pipeline (accounts, people, tech, events, enrichment).

## Auth summary

| Endpoint               | Auth                    |
|------------------------|-------------------------|
| `GET /extension/check` | Bearer = MOLT_API_KEY   |
| `POST /extension/capture` | Bearer = MOLT_API_KEY |

The extension sends `Authorization: Bearer <your API key>` on every request. Use the same key as for your Custom GPT / wrangler ingest.
