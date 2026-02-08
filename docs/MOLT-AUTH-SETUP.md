# Molt / ChatGPT API auth – setup and test

Step-by-step: turn on API key auth for `/molt/*` and `/wrangler/ingest`, then verify with curl.

**Why you might have seen 503:** The worker normally requires `SANITY_PROJECT_ID` and `SANITY_TOKEN` for every request. `/molt/*` and `/wrangler/ingest` are now exempt from that global check so you can test auth without Sanity. With a valid key you may get **200** (if Sanity is set) or **500** (if not); both mean auth succeeded.

---

## Step 1: Start the worker (no key yet)

From the project root:

```bash
cd /Users/austin.gilbert/website-scanner-worker
npm run dev
```

Leave this running. You should see something like:

```
⛅️ wrangler 3.x.x
➜ Local: http://localhost:8787/
```

**Check:** With no `MOLT_API_KEY` set, the endpoints are open. We’ll confirm that in Step 3.

---

## Step 2: Run the auth test script (no key)

In a **second terminal**:

```bash
cd /Users/austin.gilbert/website-scanner-worker
./scripts/test-molt-auth.sh
```

**Expected:** All tests pass: “No auth” request is **not** 401 (auth not required when no key is set). “Wrong key” and “With key” are skipped when the worker has no key.

---

## Step 3: Enable auth (local dev)

This project sets a **test key in `wrangler.toml`** so auth works in local dev without extra setup:

```toml
[vars]
MOLT_API_KEY = "test-secret-12345"
```

So `npm run dev` already has auth on. For production you override this with a real secret: `wrangler secret put MOLT_API_KEY` (secrets override `[vars]` when deployed).

**Optional:** To use a different key locally, put it in `.dev.vars` (same directory as `wrangler.toml`), then restart the worker. If `auth-status` still shows `authRequired: false`, the test value in `wrangler.toml` above is the fallback.

**Check:** `curl -s http://localhost:8787/molt/auth-status` should show `"authRequired":true`.

---

## Step 4: Run the test script again (with key)

In the second terminal, pass the **same** key so the script can send it:

```bash
MOLT_API_KEY=test-secret-12345 ./scripts/test-molt-auth.sh
```

The script first calls `GET /molt/auth-status`. If the worker reports `authRequired: false`, the script will tell you to add `.dev.vars` and **restart the worker** — Wrangler does not reload `.dev.vars` on the fly.

**Expected:**

- **No auth:** Request returns **401** with message about requiring auth.
- **Wrong key:** Returns **401** “Invalid API key”.
- **With key (Bearer):** Returns **not 401** (e.g. 200 if Sanity is configured, or **500** if Sanity isn’t set in `.dev.vars` – auth still passed).
- **With key (X-API-Key):** Same as Bearer.

**Note:** These routes are exempt from the global “require Sanity” check so you can test auth without Sanity. If you see **503** on other endpoints, add `SANITY_PROJECT_ID` and `SANITY_TOKEN` to `.dev.vars` for full behavior.

---

## Step 5: Manual curl examples

Use these to double-check or for Custom GPT / ChatGPT setup.

**Without key (should be 401 when `MOLT_API_KEY` is set):**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8787/molt/run \
  -H "Content-Type: application/json" \
  -d '{"requestText":"Hello"}'
# Expect: 401
```

**With Bearer (should not be 401; may be 200 or 500 if Sanity not set):**

```bash
curl -s -X POST http://localhost:8787/molt/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-secret-12345" \
  -d '{"requestText":"Hello"}'
```

**With X-API-Key (should not be 401):**

```bash
curl -s -X POST http://localhost:8787/wrangler/ingest \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test-secret-12345" \
  -d '{"userPrompt":"What is Molt?","gptResponse":"Molt is a research assistant."}'
```

---

## Step 6: Production (Cloudflare)

Set the secret in Cloudflare so the **deployed** worker requires the key:

```bash
wrangler secret put MOLT_API_KEY
# Enter your chosen key when prompted (e.g. a long random string)
```

Then in your Custom GPT or bridge, use that key as:

- `Authorization: Bearer <your-key>`, or  
- `X-API-Key: <your-key>`

---

## Summary

| Step | Action | Result |
|------|--------|--------|
| 1 | Start worker | Dev server on :8787 |
| 2 | Run script (no .dev.vars) | authRequired: false; no 401 |
| 3 | Add `.dev.vars` with `MOLT_API_KEY`, **restart worker** | authRequired: true |
| 4 | Run script with `MOLT_API_KEY=...` | No auth → 401; wrong key → 401; correct key → not 401 |
| 5 | Curl examples | Same behavior as script |
| 6 | `wrangler secret put MOLT_API_KEY` | Production uses the key |

## Troubleshooting

- **`/molt/auth-status` shows `authRequired: false`**  
  This repo sets `MOLT_API_KEY = "test-secret-12345"` in `wrangler.toml` under `[vars]`, so local dev should have auth on. Restart the worker (`Ctrl+C`, then `npm run dev`). If you use `.dev.vars` instead, put it next to `wrangler.toml` and restart (Wrangler only reads it at startup).

- **All requests return 500**  
  Auth is working; 500 usually means Sanity (or another service) isn’t configured. For auth-only testing, 401 vs non-401 is what matters.
