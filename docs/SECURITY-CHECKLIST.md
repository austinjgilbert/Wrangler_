# Security checklist

Use this to verify secrets and sensitive config are handled safely.

## 1. Secrets not in repo

- [ ] **`.dev.vars`** is in `.gitignore` and never committed (contains `MOLT_API_KEY`, `SANITY_TOKEN`, etc.).
- [ ] **`.env`** and **`.env.local`** are in `.gitignore`.
- [ ] **`wrangler.toml`** has no secret values; only `wrangler secret put` is used for production.
- [ ] **`.env.example`** has empty placeholders only (no real keys).

## 2. Production secrets

- [ ] Production API key: `npx wrangler secret put MOLT_API_KEY --env production`
- [ ] Sanity: `SANITY_PROJECT_ID`, `SANITY_TOKEN` set via secrets for production.
- [ ] Telegram: `TELEGRAM_BOT_TOKEN` set via secret if using the bot.
- [ ] Optional: `MOLTBOOK_API_KEY` if you want to protect POST `/moltbook/api/activity`.

## 3. Auth on sensitive routes

- [ ] **`/molt/*`** and **`/wrangler/ingest`** require `MOLT_API_KEY` (Bearer or X-API-Key) when set.
- [ ] **POST `/moltbook/api/activity`** can be protected with `MOLTBOOK_API_KEY` (optional).
- [ ] Admin/write operations can use `ADMIN_TOKEN` (X-Admin-Token) when set.
- [ ] **`/webhooks/telegram`** uses `TELEGRAM_BOT_TOKEN` from env (no auth header; Telegram validates webhook).

## 4. Logging and errors

- [ ] Status/health error details sanitize `Bearer ...` and URLs to `***` (see `src/index.js`).
- [ ] No logging of raw `SANITY_TOKEN`, `MOLT_API_KEY`, or other secrets.

## 5. SSRF and input

- [ ] URL validation and SSRF protection in `src/utils/validation.js` (blocked hosts, private IPs, http/https only).
- [ ] User-controlled URLs are validated before fetch.

## 6. Cursor / IDE

- [ ] **`.cursorignore`** includes `.dev.vars` and `.env*` so they are not sent to AI context.

---

**Quick verify (no secrets in tracked files):**

```bash
git status
git check-ignore -v .dev.vars   # should show .gitignore
```

Never run `git add .dev.vars` or commit files that contain API keys or tokens.
