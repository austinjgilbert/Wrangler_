# Senior engineer delivery review

Review of recent work and delivery readiness for the website-scanner-worker project.

---

## Executive summary

**Verdict: Ready for delivery with a few fixes and one doc correction.**

- **Build & tests:** TypeScript and unit tests pass; wrangler build (dry-run) succeeds.
- **OpenAPI (GPT):** Spec is 3.1.0, 30 operations, nullable in 3.1 form; YAML and JSON generated.
- **GPT instructions:** Under 8k characters; core flows (query → wranglerIngest, gmail draft-then-send, enrich) preserved.
- **Tracking & Gmail:** Pixel, opens API, device/geo/read-receipt, and extension Email tab are wired; Gmail injects pixel and stores tracking id in KV.
- **Docs:** Single user checklist exists; one production-secrets instruction is wrong and should be fixed before handoff.

---

## 1. What was reviewed

| Area | Status | Notes |
|------|--------|------|
| **Typecheck** | ✅ Pass | `npm run typecheck` (tsc --noEmit) |
| **Unit tests** | ✅ 45 passed | Vitest, 12 files |
| **Build** | ✅ Pass | `npm run build` (wrangler deploy dry-run) |
| **openapi-gpt.yaml** | ✅ | 3.1.0, 30 ops, block-style schemas, no `nullable` (uses `type: [string, "null"]`) |
| **openapi-gpt.json** | ✅ | Generated from YAML; ~34KB |
| **gpt-instructions.md** | ✅ | ~4.7k chars (< 8k); condensed, critical behavior kept |
| **.dev.vars.example** | ✅ | No placeholder secrets; Gmail, Sanity, MOLT, tracking (KV) covered |
| **Track routes** | ✅ | `/track/pixel`, `/track/opens` in index; skipBaseEnv for `/track/`; KV binding |
| **Gmail + pixel** | ✅ | trackingId, KV `email_track:<id>`, pixel URL in HTML part |
| **Chrome extension** | ✅ | Email tab polls `/track/opens`; shows opens, device, location, read receipt |
| **USER-SETUP-CHECKLIST** | ✅ | Single place for .dev.vars, secrets, YAML, GPT instructions, extension, webhook, Gmail |
| **PROJECT-STATUS.md** | ✅ | Repo, deployed URLs, local setup, CI, tests, key docs |
| **PRODUCTION-READINESS.md** | ✅ | Pre-deploy, security, reliability, post-deploy checks |

---

## 2. Critical fix required before delivery

### Production secrets: wrong env in checklist

**Issue:** The project deploys with **`wrangler deploy --env=production`** (see `package.json`). Secrets must be set for **that** environment. In [docs/USER-SETUP-CHECKLIST.md](USER-SETUP-CHECKLIST.md), the section "Production secrets (Wrangler)" says:

> "Use **default** env … do **not** use `--env=production`"

That would set secrets on the **default** env, not on **production**. So after `npm run deploy`, the production worker would not have those secrets.

**Fix:** Set production secrets with the same env you deploy with:

```bash
npx wrangler secret put SANITY_PROJECT_ID --env=production
npx wrangler secret put SANITY_TOKEN --env=production
npx wrangler secret put MOLT_API_KEY --env=production
# ... etc.
```

Update USER-SETUP-CHECKLIST.md to say: *"Set secrets for the env you deploy to. This project uses `npm run deploy` which runs `wrangler deploy --env=production`, so use `--env=production` when setting production secrets."* and show the commands with `--env=production`.

---

## 3. Recommendations (non-blocking)

1. **PRODUCTION-READINESS.md**  
   - Add an explicit step: "Set production secrets with `wrangler secret put VAR --env=production` (since deploy uses --env=production)."

2. **SETUP.md**  
   - Already shows `--env=production` for secrets; no change needed. Optionally add one line: "Use the same env as your deploy (this repo deploys with --env=production)."

3. **openapi-gpt.json**  
   - Keep regenerating from YAML when the spec changes: `npx js-yaml openapi-gpt.yaml > openapi-gpt.json`. Consider adding an `npm run openapi:gpt` script that does that so it’s repeatable.

4. **Post-deploy smoke**  
   - After first deploy, run: `curl -sSf https://<worker-url>/health` and, if using GPT, one call to the worker from the Custom GPT to confirm schema and auth.

5. **Tracking privacy**  
   - Document in USER-SETUP-CHECKLIST or a short privacy note what is stored for email opens (IP, user-agent, geo, etc.) and that it’s for product analytics; consider retention (e.g. "recent" list capped at 100 in code).

---

## 4. Delivery checklist (for assignee)

- [ ] Fix production-secrets instructions in **docs/USER-SETUP-CHECKLIST.md** (use `--env=production` when deploy uses production env).
- [ ] Optionally add `npm run openapi:gpt` to regenerate `openapi-gpt.json` from `openapi-gpt.yaml`.
- [ ] Confirm deploy: `npm run deploy` and then `curl -sSf https://website-scanner.austin-gilbert.workers.dev/health`.
- [ ] Confirm Custom GPT: paste latest `openapi-gpt.yaml` (or `.json`), paste `gpt-instructions.md`, set Auth to Bearer with same value as `MOLT_API_KEY`, test one scan or enrich request.
- [ ] If Gmail is used: confirm Gmail vars/secrets and send one test email; confirm open shows in extension Email tab with device/geo.
- [ ] Hand off with: SETUP.md, USER-SETUP-CHECKLIST.md, PROJECT-STATUS.md, CUSTOM-GPT-UPDATE.md, and PRODUCTION-READINESS.md.

---

## 5. Summary

Recent work is in good shape: OpenAPI 3.1.0 and 30-operation limit satisfied, GPT instructions under 8k characters, tracking and Gmail pixel integrated, and a single user-facing checklist. The only **must-fix** before delivery is correcting the production Wrangler secrets instructions so they use `--env=production` when that’s the deploy target. After that, the project is deliverable.
