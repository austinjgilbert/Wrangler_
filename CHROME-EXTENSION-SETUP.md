# Chrome Extension Setup

The **Wrangler Rabbit** Chrome extension now has two modes:

- `Capture`: manual page, bulk-tab, and pasted-text capture into the worker + Sanity enrichment flywheel
- `Rabbit`: always-on page observation that watches what is visible in-browser, surfaces opportunities in an overlay, stores important context quietly, and lets you ask grounded questions about the current page

The extension shows **Not connected** until you configure the worker URL and API key.

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

## 3. Rabbit mode

- `Always observe page changes` keeps watching supported pages as you move through Salesforce, Common Room, Outreach, LinkedIn, HubSpot, and normal websites.
- `Show in-page Rabbit overlay` injects a compact overlay that says, in effect, "on this page I noticed..." and highlights visible contacts, warm paths, and next moves.
- Rabbit now includes an `Open` workspace action that expands into a page lightbox with account context, warm paths, learnings, contacts, and recommended next actions.
- `Quietly store important page intelligence` captures high-value observations into the same worker/Sanity system without forcing manual clicks each time.
- `Ask Rabbit About This Page` uses the current page context plus stored worker memory to answer grounded questions inside the extension.
- CRM-aware extraction is stronger on Salesforce, Common Room, Outreach, and HubSpot, and Rabbit suppresses duplicate interrupts so only genuinely new or high-priority moments break through.

Rabbit relies on DOM observation and extension-side messaging. It does not need to crawl from the browser tab itself to notice what is visible on-screen.

## 4. Capture and enrichment

- **Capture This Page** – extracts entities from the current tab and sends them to the worker; the worker resolves accounts/people, writes to Sanity, and queues enrichment.
- **Bulk** – select multiple tabs and capture them in one go.
- **Text** – paste text; the extension extracts companies/people/tech and sends the same payload to the worker.

All captures go to `POST /extension/capture` and flow into the same Content OS pipeline (accounts, people, tech, events, enrichment).
Rabbit observation calls `POST /extension/page-intel` for grounded page analysis and `POST /extension/ask` for page-aware questions.
The worker also runs scheduled self-heal passes to compact duplicate enrichment jobs, repair missing completeness summaries, and upgrade stale learnings automatically.

## Auth summary

| Endpoint               | Auth                    |
|------------------------|-------------------------|
| `GET /extension/check` | Bearer = MOLT_API_KEY   |
| `POST /extension/capture` | Bearer = MOLT_API_KEY |

The extension sends `Authorization: Bearer <your API key>` on every request. Use the same key as for your Custom GPT / wrangler ingest.
