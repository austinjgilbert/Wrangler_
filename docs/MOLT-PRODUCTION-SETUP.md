# Molt / GPT worker – production setup

Get the worker running in production with API key auth and your Custom GPT calling it.

---

## 1. Deploy the worker

From the project root:

```bash
cd /Users/austin.gilbert/website-scanner-worker
npm run deploy
```

(Or use your existing deploy script / CI.) Your worker URL is:

**https://website-scanner.austin-gilbert.workers.dev**

---

## 2. Set the API key secret in Cloudflare

Use a **strong random key** in production (e.g. 32+ characters). Generate one:

```bash
openssl rand -base64 32
```

Set it as a secret so the worker can require auth for `/molt/*` and `/wrangler/ingest`:

```bash
cd /Users/austin.gilbert/website-scanner-worker
wrangler secret put MOLT_API_KEY
```

When prompted, paste the key you generated (or another strong secret). You won’t see it again; Cloudflare stores it encrypted.

**Check:** After this, unauthenticated requests to `/molt/run` or `/wrangler/ingest` should get **401**. Test:

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST https://website-scanner.austin-gilbert.workers.dev/wrangler/ingest \
  -H "Content-Type: application/json" \
  -d '{"userPrompt":"x","gptResponse":"y"}'
# Expect: 401
```

---

## 3. Configure your Custom GPT to send the key

You need the **same** value you set in step 2 available when configuring the GPT.

### Option A: ChatGPT Custom GPT (Actions)

1. Open your GPT in the editor: **Configure** → **Actions**.
2. Under **Authentication**, choose **API Key**.
3. **Auth Type:** **Bearer** (recommended).
4. **API Key:** Paste your production `MOLT_API_KEY` (the value you used in `wrangler secret put MOLT_API_KEY`).
5. Save. ChatGPT will send `Authorization: Bearer <your-key>` on every request to your schema’s endpoints.

If your OpenAPI schema uses the `MoltApiKey` / `MoltApiKeyHeader` security schemes (as in this repo’s `openapi.yaml`), the Actions UI will show that the action requires authentication and use the key you enter.

### Option B: Custom header (X-API-Key)

1. In the GPT Action **Authentication** section, choose **API Key**.
2. **Auth Type:** **Custom** (or equivalent).
3. **Header name:** `X-API-Key`
4. **API Key:** Your production `MOLT_API_KEY`.

The worker accepts either `Authorization: Bearer <key>` or `X-API-Key: <key>`.

---

## 4. Point the GPT at your schema and base URL

- **Schema URL:** Use the raw OpenAPI spec (e.g. a URL that serves `openapi.yaml`, or paste the schema).
- **Server / Base URL:** `https://website-scanner.austin-gilbert.workers.dev`

If you use `gpt-config.json` / `openapi.yaml` in this repo, the server is already set to that URL. Ensure the GPT’s Action is using the same base URL and the schema that includes the `/wrangler/ingest` (and any `/molt/*`) paths with the security requirement.

---

## 5. Test from the GPT

In the GPT chat:

- Trigger an action that calls **Wrangler ingest** (or Molt) so it sends a request to your worker with the API key.

If something goes wrong:

- **401:** Key not sent or wrong. Check Authentication in the GPT and that the value matches `wrangler secret put MOLT_API_KEY`.
- **500:** Key is correct; the failure is inside the worker (e.g. Sanity or another service). Check worker logs in the Cloudflare dashboard.

---

## Quick reference

| Step | What to do |
|------|------------|
| 1 | `npm run deploy` (or your deploy process) |
| 2 | `wrangler secret put MOLT_API_KEY` and paste a strong key |
| 3 | In Custom GPT → Actions → Authentication: API Key, Bearer, paste same key |
| 4 | Schema + base URL = `https://website-scanner.austin-gilbert.workers.dev` |
| 5 | Test by using the GPT action that hits `/wrangler/ingest` or `/molt/*` |

**Endpoints that require the key (when `MOLT_API_KEY` is set):**

- `POST /molt/run`
- `POST /molt/approve`
- `POST /molt/log`
- `POST /molt/jobs/run`
- `POST /wrangler/ingest`

All other routes are unchanged.
