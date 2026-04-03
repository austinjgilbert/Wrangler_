# Miriad Agent Swarm — Build Instructions

> **Context:** You are working on the `Wrangler_` repo, branch `feature/chat-v1`. Another agent (Agent B) has rebuilt the operator console UI. Your job is the chat module backend, Sanity Studio plugin, and Worker-level integration. Read `PLAN.md` at repo root first — it is the single source of truth.

---

## Your Ownership (DO NOT touch anything outside this)

```
src/chat/              — chat backend (8 files)
src/routes/chatRoutes.ts — chat HTTP endpoints
sanity/plugins/chat-tool/ — Studio chat plugin (4 files)
sanity/sanity.config.ts   — only the chatTool() registration
tests/unit/chat-module.test.ts — chat tests
src/chat/eval/          — intent evaluation
```

**You do NOT own and must NOT modify:**
- `apps/operator-console/app/(dashboard)/` — Agent B's dashboard pages
- `apps/operator-console/globals.css` — Agent B's design system
- `components/operator-console.tsx` — deprecated, leave it alone
- `src/handlers/`, `src/services/`, `src/lib/` — existing Worker code (use `bridge.ts` to access)
- `src/index.js` — only touch the routing block at ~line 7959

---

## Parallel Tasks — Assign to Separate Agents

### Agent 1: Sanity Studio Deploy Prep

**Goal:** Get `sanity deploy` working so the Chat Tool is live on sanity.io.

**Steps:**
1. `cd sanity && npm install` — ensure deps are current
2. Verify `sanity/.env` exists with:
   ```
   SANITY_STUDIO_PROJECT_ID=nlqb7zmk
   SANITY_STUDIO_DATASET=production
   SANITY_STUDIO_WORKER_URL=https://website-scanner.austin-gilbert.workers.dev
   SANITY_STUDIO_WORKER_API_KEY=<get from Austin or CF dashboard — the MOLT_API_KEY value>
   ```
3. Run `npx sanity build` — fix any TypeScript or dependency errors
4. Verify `sanity/sanity.config.ts` imports and registers `chatTool()` from `./plugins/chat-tool`
5. Verify `sanity/plugins/chat-tool/index.tsx` exports `chatTool` as a `definePlugin`
6. If build succeeds, **do NOT deploy** — flag Austin to run `npx sanity deploy` locally (needs auth + RAM)

**Known issue:** Build may need more RAM than a dev sandbox. If `sanity build` OOMs, document the error and move on — Austin will build locally.

**Commit prefix:** `chore(sanity):`

---

### Agent 2: Chat Retrieval + Response Hardening

**Goal:** Ensure all GROQ queries in `retrieval.ts` return valid data and handle edge cases.

**Steps:**
1. Read `src/chat/retrieval.ts` — this was recently fixed to align with actual Sanity schema fields
2. Cross-reference every GROQ projection against the actual Sanity schema. You can query the schema via:
   ```
   curl -s "https://nlqb7zmk.api.sanity.io/v2024-01-01/data/query/production?query=*[_type=='account'][0..2]" \
     -H "Authorization: Bearer $SANITY_API_TOKEN"
   ```
   Or use the Sanity MCP tools if available.
3. For each intent (`morning_briefing`, `account_lookup`, `signal_check`, `person_lookup`, `meeting_prep`), verify:
   - The GROQ query doesn't reference fields that don't exist
   - NULL handling is correct (use `coalesce()` or default values)
   - Array fields use `[]->` or `[]` correctly
   - Date fields use proper ISO 8601 format
4. In `src/chat/response.ts`, verify the system prompt templates handle empty/null retrieval results gracefully (e.g., "I don't have signal data for that account yet")
5. Run: `npx vitest run` — all 69 tests must pass
6. Run: `node src/chat/eval/run-intent-eval.mjs` — target 90%+ accuracy (currently 45/50)

**Commit prefix:** `fix(chat):`

---

### Agent 3: CORS + Worker Integration

**Goal:** Ensure the Worker properly serves chat routes with correct CORS headers for both Studio (sanity.io domain) and operator console (localhost / deployed domain).

**Steps:**
1. Read `src/index.js` around line ~7959 where chat routes are registered
2. Verify `KNOWN_PATH_PREFIXES` includes `/api/chat/`
3. Check CORS handling — the Worker needs to return proper headers for:
   - `https://*.sanity.studio` (Sanity Studio hosted)
   - `http://localhost:3333` (Sanity Studio dev)
   - `http://localhost:3000` (Operator console dev)
   - The deployed operator console domain (if any)
4. Verify OPTIONS preflight requests return correct `Access-Control-Allow-*` headers
5. Test with:
   ```bash
   curl -X OPTIONS https://website-scanner.austin-gilbert.workers.dev/api/chat/message \
     -H "Origin: https://account-dataset.sanity.studio" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type, X-API-Key" \
     -v 2>&1 | grep -i access-control
   ```
6. If CORS is missing or wrong, fix it in the Worker's routing/middleware layer

**Commit prefix:** `fix:`

---

### Agent 4: End-to-End Smoke Tests

**Goal:** Verify the full pipeline works: Studio plugin → Worker → Sanity CMS → response.

**Steps:**
1. Read `tests/unit/chat-module.test.ts` to understand existing test coverage
2. Check if `src/chat/eval/smoke-test.mjs` exists and run it:
   ```bash
   node src/chat/eval/smoke-test.mjs
   ```
3. Test each of the 5 endpoints against the LIVE Worker:
   ```bash
   export MOLT_API_KEY="<the key>"
   export WORKER_URL="https://website-scanner.austin-gilbert.workers.dev"

   # 1. Non-streaming message
   curl -s -X POST "$WORKER_URL/api/chat/message" \
     -H "Content-Type: application/json" \
     -H "X-API-Key: $MOLT_API_KEY" \
     -d '{"message": "good morning"}' | jq .

   # 2. Streaming (NDJSON)
   curl -s -N -X POST "$WORKER_URL/api/chat/stream" \
     -H "Content-Type: application/json" \
     -H "X-API-Key: $MOLT_API_KEY" \
     -d '{"message": "tell me about our top accounts"}'

   # 3. Feedback
   curl -s -X POST "$WORKER_URL/api/chat/feedback" \
     -H "Content-Type: application/json" \
     -H "X-API-Key: $MOLT_API_KEY" \
     -d '{"interactionId": "test-123", "rating": "positive"}'

   # 4. Session retrieval
   curl -s "$WORKER_URL/api/chat/session/test-session" \
     -H "X-API-Key: $MOLT_API_KEY" | jq .

   # 5. Audit log
   curl -s "$WORKER_URL/api/chat/audit?limit=5" \
     -H "X-API-Key: $MOLT_API_KEY" | jq .
   ```
4. For each test, verify:
   - 200 status (not 500, 404, or 401)
   - Response shape matches the types in `src/chat/types.ts`
   - Sources are present in responses (not empty arrays)
   - Streaming emits `token`, `sources`, `suggestions`, `done` line types
5. Document any failures in a `TEST-RESULTS-CHAT.md` at repo root

**Commit prefix:** `test(chat):`

---

### Agent 5: Cleanup + Code Quality

**Goal:** Remove dead code, fix lint issues, ensure the codebase is clean.

**Steps:**
1. Delete `apps/operator-console/components/operator-console.tsx` — it's the old 2,000-line monolith that is no longer imported anywhere
2. Delete `apps/operator-console/app/page.tsx` — it just contains `redirect('/overview')` as a workaround. With it gone, the `(dashboard)/overview/page.tsx` takes over cleanly. **Verify first** that removing it doesn't break the route group.
3. Run `npx tsc --noEmit` from repo root (or from each app dir) — fix any TypeScript errors
4. Check for unused imports across `src/chat/` files
5. Ensure all files have consistent formatting (no mixed tabs/spaces, trailing whitespace)
6. Verify `.gitignore` includes: `node_modules/`, `.env`, `dist/`, `.next/`

**Commit prefix:** `chore:`

---

## Coordination Protocol

1. **Always `git pull --rebase origin feature/chat-v1` before starting work**
2. **Always `git push origin feature/chat-v1` after committing**
3. If you get a push rejection, rebase and try again — don't force push
4. Commit messages: `feat(chat):`, `fix(chat):`, `test(chat):`, `chore(sanity):`, `docs:`
5. **Do NOT modify files outside your ownership boundary** (see top of this doc)
6. If you need a change to `lib/api.ts` or `lib/types.ts`, document what you need in a comment at the bottom of `PLAN.md` under a `## Coordination Requests` section — Agent B will pick it up

---

## Success Criteria

When all agents are done, we should have:
- [ ] `sanity build` compiles without errors
- [ ] All 69 chat tests pass (`npx vitest run`)
- [ ] Intent eval ≥ 90% (`node src/chat/eval/run-intent-eval.mjs`)
- [ ] All 5 chat endpoints return valid responses against live Worker
- [ ] CORS headers correct for Studio + console origins
- [ ] No TypeScript errors (`npx tsc --noEmit`)
- [ ] Old monolith deleted
- [ ] Clean git history on `feature/chat-v1`

Austin will then deploy Studio (`npx sanity deploy`) and merge to `main`.
