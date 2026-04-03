# PLAN.md — Wrangler_ Coordination Document

> **Read this file before making any changes.** Single source of truth for all agents working on this repo. Last updated: 2026-04-03 16:00 UTC by @dev (coordinator).

---

## 1. Project Overview

**Wrangler_** is a 64K-line Cloudflare Worker powering AI-driven SDR intelligence. It ingests signals, scores accounts, manages actions, and orchestrates outreach — all backed by Sanity CMS.

**Two UI surfaces:**

| Surface | Purpose | Users | Status |
|---|---|---|---|
| **SDK App (Operator Console)** | Chat-first command center — THE product | SDRs doing daily work | ✅ Chat as home screen, entity links, nav suggestions |
| **Sanity Studio** | Backend data management + AI overlay (future) | Admins, ops, builders | Chat Tool plugin built, lower priority |

> **Key decision (2026-04-03):** Austin directed that the SDK App is the product. Users can't access Studio. Everything must be in the app. Chat is the home screen and command center.

**Key facts:**
- Chat backend is **LIVE on production** at `https://website-scanner.austin-gilbert.workers.dev`
- All work is on the `feature/chat-v1` branch
- Sanity CMS: project `nlqb7zmk`, dataset `production`, 60+ schema types
- The chat module is a clean addition — it does not modify existing Wrangler_ code
- The operator console is a complementary power-user dashboard — it does not modify chat or worker code

---

## 2. Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Sanity Studio (sanity.io)                                 │
│  └─ Chat Tool Plugin (sanity/plugins/chat-tool/)           │
│     └─ useChat.ts → POST /api/chat/stream (NDJSON)         │
└──────────────────────┬─────────────────────────────────────┘
                       │ HTTPS + X-API-Key
                       ▼
┌────────────────────────────────────────────────────────────┐
│  Cloudflare Worker (src/index.js — 8,200 lines)            │
│  ├─ /api/chat/* routes (src/routes/chatRoutes.ts)          │
│  │  └─ Chat Module (src/chat/ — 8 files, ~3,500 lines)    │
│  └─ /api/console/* routes (existing handler endpoints)     │
└──────────────────────┬─────────────────────────────────────┘
                       │ GROQ API
                       ▼
┌────────────────────────────────────────────────────────────┐
│  Sanity CMS                                                │
│  Project: nlqb7zmk | Dataset: production                   │
│  60+ schema types (accounts, signals, actions, people…)    │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  Operator Console (Next.js 16 / App Router)                │
│  └─ app/(dashboard)/ — route group with shared layout      │
│     ├─ layout.tsx     → SnapshotContext, sidebar, cmd bar   │
│     ├─ overview/      → KPIs, top actions, signals, health  │
│     ├─ accounts/      → searchable account list              │
│     ├─ accounts/[id]/ → account detail                       │
│     ├─ signals/       → filterable signal feed               │
│     ├─ pipeline/      → action candidates (list + board)     │
│     ├─ chat/          → chat UI (copilot streaming)          │
│     ├─ patterns/      → pattern discovery cards              │
│     ├─ research/      → briefs + drafts                      │
│     └─ system/        → engine, patterns, autopilot, diag    │
│  lib/api.ts           → client-side API layer                │
│  lib/types.ts         → ConsoleSnapshot, AccountDetail, etc. │
│  app/api/console/*    → Next.js API routes → Worker proxy    │
│  app/api/chat/*       → proxy to Worker /api/chat/*          │
└────────────────────────────────────────────────────────────┘
```

| Layer | Technology | Details |
|---|---|---|
| Worker runtime | Cloudflare Workers | Single `src/index.js`, 100+ endpoints |
| Data store | Sanity CMS | 60+ schema types, project `nlqb7zmk`, dataset `production` |
| Chat module | TypeScript | `src/chat/` — 8 files, ~3,500 lines |
| Chat routes | TypeScript | `src/routes/chatRoutes.ts` — 238 lines, 5 endpoints |
| Studio plugin | React/TypeScript | `sanity/plugins/chat-tool/` — 4 files, ~950 lines |
| Operator console | Next.js 16 / React 19 | `apps/operator-console/` — App Router, Tailwind, Radix UI |
| LLM | Claude 3.5 Haiku | Fast responses (~2-3s), rule-based intent classification |
| Conversation state | Cloudflare KV | `MOLTBOOK_ACTIVITY_KV` binding |
| Auth | API key | `X-API-Key` header validated against `MOLT_API_KEY` |

---

## 3. Ownership Boundaries

> **Critical: each agent must stay in its lane.**

### Agent A — Chat Module & Studio Plugin

**Owns:**
- `src/chat/` — chat backend (intent, retrieval, context, response, audit, bridge)
- `src/routes/chatRoutes.ts` — chat HTTP endpoints
- `sanity/plugins/chat-tool/` — Studio chat plugin (4 files)
- `tests/unit/chat-module.test.ts` — chat tests
- `src/chat/eval/` — intent evaluation harness

**Does NOT touch:**
- `apps/operator-console/app/(dashboard)/` — dashboard pages
- `apps/operator-console/globals.css` — design system
- `src/handlers/`, `src/services/`, `src/lib/` — existing Wrangler_ code (except via bridge.ts)
- `src/index.js` — main worker (except the routing block at line ~7959)

### Agent B — Operator Console

**Owns:**
- `apps/operator-console/app/(dashboard)/` — all dashboard route pages and layout
- `apps/operator-console/globals.css` — design tokens
- `apps/operator-console/components/dashboard/` — dashboard-specific components (future)
- `apps/operator-console/components/shared/` — shared UI components (future)

**Does NOT touch:**
- `src/chat/` or `src/routes/chatRoutes.ts` — chat backend
- `sanity/plugins/` — Studio plugins
- `src/index.js` — main worker
- `src/handlers/`, `src/services/`, `src/lib/` — existing Wrangler_ code

### Shared (coordinate before changing)
- `apps/operator-console/lib/api.ts` — client-side API layer
- `apps/operator-console/lib/types.ts` — TypeScript types
- `apps/operator-console/lib/server-proxy.ts` — server-side proxy
- `apps/operator-console/app/api/` — Next.js API routes
- `PLAN.md` — this file

---

## 4. File Map

### Chat Backend (`src/chat/`)

| File | Lines | Purpose |
|---|---|---|
| `types.ts` | 163 | Type definitions — intents, messages, sessions, sources |
| `intent.ts` | 571 | Intent classifier — 5 intents, keyword + entity-aware resolution |
| `retrieval.ts` | 908 | GROQ queries for each intent — parallel execution, field projections |
| `context.ts` | 399 | Multi-turn conversation state — KV-backed, pronoun resolution |
| `response.ts` | 460 | LLM response generation — Claude 3.5 Haiku, system prompts |
| `audit.ts` | 240 | Interaction logging — every query/response logged, feedback capture |
| `bridge.ts` | 216 | Service bridge — wraps existing Wrangler_ services |
| `index.ts` | 597 | Pipeline orchestrator — intent → retrieval → context → response → audit |

### Chat Routes (`src/routes/`)

| File | Lines | Purpose |
|---|---|---|
| `chatRoutes.ts` | 238 | 5 HTTP endpoints — message, stream, feedback, session, audit |

### Sanity Studio Plugin (`sanity/plugins/chat-tool/`)

| File | Lines | Purpose |
|---|---|---|
| `index.tsx` | 53 | Plugin definition — `definePlugin`, registers Chat as a Studio Tool |
| `ChatTool.tsx` | ~365 | Main chat UI — message list, input, starter prompts |
| `ChatMessage.tsx` | ~293 | Message bubble — markdown, source attribution, feedback |
| `useChat.ts` | 289 | React hook — NDJSON streaming, state management, feedback |

### Operator Console Dashboard (`apps/operator-console/app/(dashboard)/`)

| Route | File | Purpose |
|---|---|---|
| `/overview` | `overview/page.tsx` | KPI cards, top actions, signal feed, system health, jobs |
| `/accounts` | `accounts/page.tsx` | Searchable/sortable account table, completion bars, tech tags |
| `/accounts/[id]` | `accounts/[id]/page.tsx` | Account detail: signals, people, actions, research, enrichment |
| `/signals` | `signals/page.tsx` | Signal feed with type/source filters, sort toggle |
| `/pipeline` | `pipeline/page.tsx` | Action candidates: list view + kanban board (by draft status) |
| `/chat` | `chat/page.tsx` | Chat UI with SSE streaming, starter chips, message history |
| `/patterns` | `patterns/page.tsx` | Pattern cards with lifecycle badges, conversion metrics |
| `/research` | `research/page.tsx` | Tabbed briefs/drafts with expandable content |
| `/system` | `system/page.tsx` | 4-tab lab: overview, patterns, autopilot, diagnostics |
| (layout) | `layout.tsx` | SnapshotContext, sidebar nav, command bar, assistant panel |

### Operator Console Support Files

| File | Lines | Purpose |
|---|---|---|
| `lib/api.ts` | 162 | Client-side API — fetchSnapshot, fetchAccountDetail, runCommand, streamCopilotQuery, etc. |
| `lib/types.ts` | 582 | ConsoleSnapshot, AccountDetail, CopilotState, patterns, clusters, outcomes |
| `lib/server-proxy.ts` | 38 | Server-side proxy to CF Worker (workerBaseUrl, workerHeaders, proxyToWorker) |
| `globals.css` | 161 | Dark theme design system — surfaces, accents, semantic colors, layout tokens |
| `components/chat/` | ~4 files | Chat components from Agent A (chat-panel, chat-message, chat-input, suggestion-chips) |
| `components/operator-console.tsx` | ~2000 | Old monolith (DEPRECATED — kept for reference, no longer imported) |

### Tests & Eval

| File | Lines | Purpose |
|---|---|---|
| `tests/unit/chat-module.test.ts` | 863 | 69 Vitest tests — intent, retrieval, context, response, audit |
| `src/chat/eval/run-intent-eval.mjs` | 556 | Intent accuracy eval harness |
| `src/chat/eval/intent-test-set.json` | 402 | 50 test queries with expected intents/entities |

---

## 5. Current Status

| Component | Status | Owner | Notes |
|---|---|---|---|
| Chat backend (5 intents) | ✅ LIVE | Agent A | Deployed, real Sanity data flowing |
| Intent classifier | ✅ 90% accuracy | Agent A | 45/50 test queries pass |
| Multi-turn conversations | ✅ Built | Agent A | KV-backed, pronoun resolution |
| Streaming responses | ✅ Real NDJSON | Agent A | Token-by-token from Haiku |
| Source attribution | ✅ Built | Agent A | Every response includes sources |
| Audit log + feedback | ✅ Built | Agent A | Full interaction logging |
| Sanity Studio Chat Tool | ✅ Built | Agent A | 4 files, ~950 lines |
| Retrieval field fixes | ✅ Fixed | Agent A | GROQ aligned with actual schema |
| Deploy prep | ✅ Done | Agent A | .env, scripts, gitignore |
| Operator console rebuild | ✅ Built | Agent B | 10 pages, ~2,900 lines, route-based |
| Dashboard layout + context | ✅ Built | Agent B | SnapshotContext, sidebar, command bar |
| Studio deploy | ⏳ Next | Austin | `cd sanity && npm run deploy` |
| End-to-end testing | ⏳ Pending | Both | Console ↔ Worker ↔ Sanity |

---

## 6. Five Core Chat Intents

| Intent | Trigger Examples | What It Does |
|---|---|---|
| `morning_briefing` | "good morning", "daily briefing" | Top actions, overnight signals, priorities |
| `account_lookup` | "tell me about Acme" | Account overview, signals, actions, people |
| `signal_check` | "any new signals?" | Recent signals ranked by strength |
| `person_lookup` | "who is Sarah Chen?" | Contact details, role, associated signals |
| `meeting_prep` | "prep me for my Acme meeting" | Account brief, key people, talking points |

Intent classification is **rule-based** (keyword matching + entity extraction). No LLM needed — fast and deterministic.

---

## 7. API Endpoints

### Chat API (Worker-direct)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/chat/message` | Send message, get full JSON response |
| `POST` | `/api/chat/stream` | Send message, get NDJSON streaming response |
| `POST` | `/api/chat/feedback` | Submit thumbs up/down |
| `GET` | `/api/chat/session/:id` | Get conversation history |
| `GET` | `/api/chat/audit` | Get audit log |

### Console API (Next.js → Worker proxy)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/console/snapshot` | Full dashboard snapshot |
| `GET` | `/api/console/account/:id` | Account detail |
| `POST` | `/api/console/command` | Run a command |
| `POST` | `/api/console/simulate` | Run scenario simulation |
| `POST` | `/api/console/diagnostics` | Run diagnostic |
| `GET` | `/api/console/copilot` | Get copilot state |
| `POST` | `/api/console/copilot/query` | Query copilot |
| `POST` | `/api/console/copilot/stream` | Stream copilot response |
| `POST` | `/api/console/copilot/action` | Execute copilot action |
| `POST` | `/api/console/copilot/explain` | Get explanation |
| `GET` | `/api/console/functions` | Function registry |
| `GET` | `/api/console/agents` | Agent registry |

**Auth:** `X-API-Key` header matching `MOLT_API_KEY` environment variable.

---

## 8. Streaming Protocol (Chat NDJSON)

```
{"type":"token","text":"Based on "}
{"type":"token","text":"the latest "}
{"type":"sources","data":[{"fact":"Revenue grew 23%","source":"account:acme-corp","observedAt":"2025-06-28"}]}
{"type":"suggestions","data":["What actions are pending for Acme?"]}
{"type":"done","meta":{"intent":"account_lookup","totalTimeMs":2847}}
```

| Type | Payload | When |
|---|---|---|
| `token` | `{ text: string }` | Each token streaming from Haiku |
| `sources` | `{ data: Source[] }` | After response completes |
| `suggestions` | `{ data: string[] }` | Follow-up suggestions |
| `done` | `{ meta: { intent, totalTimeMs } }` | Stream end |

---

## 9. Key Architectural Decisions

| Decision | Rationale |
|---|---|
| All chat code under `src/chat/` | Clean module boundary — easy to find, test, reason about |
| `bridge.ts` wraps existing services | Chat never imports from `src/handlers/` — decoupled from legacy |
| One routing block in `src/index.js` (~line 7959) | Minimal touch on 8,200-line main file |
| KV binding: `MOLTBOOK_ACTIVITY_KV` | Existing namespace, matches wrangler.toml |
| `/api/chat/` in `KNOWN_PATH_PREFIXES` | Worker recognizes chat routes without modifying core routing |
| Claude 3.5 Haiku for chat responses | Fast (~2-3s) vs Sonnet (~7-10s). Speed matters for chat UX |
| Rule-based intent classification | Deterministic, fast, no LLM latency. 90% accuracy sufficient |
| Sanity Studio = primary SDR interface | SDRs already live in Studio — no context switching |
| Operator console = power-user dashboard | Route-based App Router, SnapshotContext for shared state |
| Dashboard route group `(dashboard)` | Transparent route group — shared layout without URL prefix |
| 60s snapshot polling | Single fetch for all pages via React Context |
| Dark-first design system | Enterprise ops tool — CSS custom properties, no light mode yet |
| Confidence-aware UI | Show uncertainty states, strength bars, completion % everywhere |

---

## 10. Coordination Rules

> **Every agent must follow these.**

### After making changes

```bash
# Agent A — chat module changes
npx tsc --noEmit                              # type-check
npx vitest run                                 # run tests
node src/chat/eval/run-intent-eval.mjs         # intent eval (if intent/retrieval changed)

# Agent B — operator console changes
cd apps/operator-console && npx tsc --noEmit   # type-check
npm run dev                                    # visual check at localhost:3000

# Both — before pushing
git fetch origin feature/chat-v1
git pull --rebase origin feature/chat-v1
git push origin feature/chat-v1
```

### Branch discipline
- All work on `feature/chat-v1`
- Commit prefixes: `feat:`, `fix:`, `docs:`, `test:`, `chore:`
- Scope: `(chat)`, `(operator-console)`, `(sanity)`, or none for cross-cutting
- Austin merges to `main` when ready

### Resolving conflicts
- If both agents need to change a shared file (`lib/api.ts`, `lib/types.ts`), coordinate via PLAN.md comments
- The agent who pushed first wins — the other rebases on top

---

## 11. Known Issues

1. **Chat page dual implementations** — The operator console has two chat paths: `(dashboard)/chat/page.tsx` uses `streamCopilotQuery` (→ `/api/console/copilot/stream`), while `components/chat/` uses `useChat.ts` (→ `/api/chat/stream` NDJSON). These should be consolidated to use the NDJSON protocol once stable.

2. **Old monolith in tree** — `components/operator-console.tsx` (~2,000 lines) is no longer imported. Delete in a cleanup commit.

3. **Root page.tsx redirect** — `app/page.tsx` redirects to `/overview` because it can't be deleted (was conflicting with route group). Can be cleaned up by deleting the file.

4. **`sanity build` needs RAM** — Dev sandbox doesn't have enough memory. Deploy from local machine.

5. **Chat routes 404 on production** — ✅ RESOLVED. Worker redeployed from `feature/chat-v1`, chat endpoints now live. Verified with real query returning data in ~1s.

---

## 12. What's Next (Priority Order)

> **Critical discovery (2026-04-03):** Chat endpoints return 404 on production. The Worker was redeployed from `main` which doesn't have chat code. Austin must deploy Worker from `feature/chat-v1` (or merge first).

| # | Task | Owner | Status |
|---|---|---|---|
| 1 | **Deploy Worker from feature/chat-v1** | Austin | ✅ Done — chat routes live, verified ~1s response |
| 2 | Deploy Studio with Chat Tool | Austin | ✅ Done — Chat Tool should be visible in Studio |
| 3 | Austin verifies Chat tab appears in Studio | Austin | ⏳ Next |
| 4 | Live smoke test chat in actual Studio UI | Austin + Agent A | ⏳ Blocked on #3 |
| 5 | CORS verification — Studio (sanity.io) → Worker (workers.dev) | Agent A | ✅ Done — all origins work, headers correct |
| 6 | Live data validation — confirm GROQ dereferences resolve | Agent A | ✅ Done — real data flowing (Buc Ees, BDA Inc) |
| 7 | Merge `feature/chat-v1` to `main` | Austin | ⏳ After smoke test |
| 8 | Redeploy worker from `main` with all fixes | Austin | ⏳ Blocked on #7 |
| 9 | V2 planning: action execution, persistent history, semantic search | Agent A | ⏳ Future |

---

## 13. Environment & Credentials

| Variable | Value |
|---|---|
| Sanity project ID | `nlqb7zmk` |
| Sanity dataset | `production` |
| Worker URL | `https://website-scanner.austin-gilbert.workers.dev` |
| KV namespace | `MOLTBOOK_ACTIVITY_KV` |

### Deploy commands

```bash
# Sanity Studio (from local machine — needs RAM)
cd sanity && npm run deploy

# Cloudflare Worker
npx wrangler deploy

# Operator Console (dev)
cd apps/operator-console && npm run dev
```

### Environment variables

```bash
# sanity/.env
SANITY_STUDIO_WORKER_URL=https://website-scanner.austin-gilbert.workers.dev
SANITY_STUDIO_WORKER_API_KEY=<MOLT_API_KEY value>

# Worker (wrangler.toml / CF dashboard)
MOLT_API_KEY=<api key>
ANTHROPIC_API_KEY=<for Claude 3.5 Haiku>
SANITY_API_TOKEN=<for GROQ queries>
```

---

## 14. Design System (Operator Console)

Dark-first enterprise design. CSS custom properties in `globals.css`:

| Token | Value | Usage |
|---|---|---|
| `--background` | `#0b0b0c` | Page background |
| `--panel` | `#121214` | Sidebar, command bar |
| `--card` | `#1a1a1d` | Card surfaces |
| `--accent` | `#f03e2f` | Sanity red — primary actions |
| `--accent-secondary` | `#7c5cff` | Purple — secondary elements |
| `--highlight` | `#3da9fc` | Blue — links, focus, highlights |
| `--success` | `#22c55e` | Green — confirmed, healthy |
| `--warning` | `#f59e0b` | Amber — speculative, degraded |
| `--error` | `#ef4444` | Red — errors, quarantined |

Layout: `--sidebar-width: 260px`, `--command-bar-height: 64px`, `--assistant-width: 360px`

Principles: data-dense not cluttered, confidence-aware everywhere, action-oriented (every view answers "what should I do next?"), progressive disclosure (table → detail → expandable sections).

---

## Quick Reference

**"I want to understand the chat system"** → Read `src/chat/index.ts`, then `intent.ts` → `retrieval.ts` → `response.ts`

**"I want to fix a GROQ query"** → Edit `src/chat/retrieval.ts`, check fields against Sanity schemas, run `npx vitest run`

**"I want to change the Studio chat UI"** → Edit `sanity/plugins/chat-tool/`, test with `cd sanity && npm run dev`

**"I want to add a new chat intent"** → Add to `intent.ts`, `retrieval.ts`, `response.ts`, `types.ts`, then eval cases

**"I want to add a dashboard page"** → Create `app/(dashboard)/newpage/page.tsx`, import `useSnapshot` from `../layout`, add to `NAV` in `layout.tsx`

**"I want to modify the sidebar"** → Edit `NAV` array in `(dashboard)/layout.tsx`

**"I want to change design tokens"** → Edit `globals.css` `:root` block

**"I want to add a new API call"** → Add to `lib/api.ts`, add route in `app/api/console/`

**"I want to test the live chat API"** →
```bash
curl -X POST https://website-scanner.austin-gilbert.workers.dev/api/chat/message \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $MOLT_API_KEY" \
  -d '{"message": "good morning"}'
```
