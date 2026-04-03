# PLAN.md — Wrangler_ Chat System Coordination Document

> **Read this file before making any changes.** This is the shared coordination doc for all agents (Miriad engineering, Claude Code, Claude workspace). Last updated: 2026-04-03 14:45 UTC by @dev (coordinator).

---

## 1. Project Overview

**Wrangler_** is a 64K-line Cloudflare Worker powering AI-driven SDR (Sales Development Rep) intelligence. It ingests signals, scores accounts, manages actions, and orchestrates outreach — all backed by Sanity CMS.

**What we're building now:** A chat-first conversational interface embedded as a **Sanity Studio Tool plugin**. SDRs ask natural-language questions ("prep me for my Acme meeting", "any new signals?") and get grounded, source-attributed answers from their live CRM data.

**Key facts:**
- The Sanity Studio at sanity.io **IS the app** — there are no separate frontends
- Chat backend is **LIVE on production** at `https://website-scanner.austin-gilbert.workers.dev`
- All chat code lives on the `feature/chat-v1` branch
- The chat module is a clean addition — it does not modify existing Wrangler_ code

---

## 2. Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│  Sanity Studio (sanity.io)                              │
│  └─ Chat Tool Plugin (sanity/plugins/chat-tool/)        │
│     └─ useChat.ts → POST /api/chat/stream (NDJSON)      │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS + X-API-Key
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Cloudflare Worker (src/index.js — 8,200 lines)         │
│  └─ /api/chat/* routes (src/routes/chatRoutes.ts)       │
│     └─ Chat Module (src/chat/ — 8 files, ~3,500 lines)  │
│        ├─ intent.ts    → classify user query             │
│        ├─ retrieval.ts → GROQ queries to Sanity          │
│        ├─ context.ts   → multi-turn state (KV-backed)    │
│        ├─ response.ts  → Claude 3.5 Haiku generation     │
│        ├─ audit.ts     → interaction logging              │
│        └─ bridge.ts    → wraps existing Wrangler_ services│
└──────────────────────┬──────────────────────────────────┘
                       │ GROQ API
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Sanity CMS                                             │
│  Project: nlqb7zmk | Dataset: production                │
│  60+ schema types (accounts, signals, actions, people…) │
└─────────────────────────────────────────────────────────┘
```

| Layer | Technology | Details |
|---|---|---|
| Worker runtime | Cloudflare Workers | Single `src/index.js`, 100+ endpoints |
| Data store | Sanity CMS | 60+ schema types, project `nlqb7zmk`, dataset `production` |
| Chat module | TypeScript | `src/chat/` — 8 files, ~3,500 lines |
| Chat routes | TypeScript | `src/routes/chatRoutes.ts` — 238 lines, 5 endpoints |
| Studio plugin | React/TypeScript | `sanity/plugins/chat-tool/` — 4 files, ~950 lines |
| LLM | Claude 3.5 Haiku | Fast responses (~2-3s), rule-based intent classification |
| Conversation state | Cloudflare KV | `MOLTBOOK_ACTIVITY_KV` binding |
| Auth | API key | `X-API-Key` header validated against `MOLT_API_KEY` |

---

## 3. File Map — What's Where

### Chat Backend (`src/chat/`)

| File | Lines | Purpose |
|---|---|---|
| `types.ts` | 163 | Type definitions — intents, messages, sessions, sources |
| `intent.ts` | 571 | Intent classifier — 5 intents, keyword + entity-aware resolution, no LLM needed |
| `retrieval.ts` | 908 | GROQ queries for each intent — parallel execution, field projections |
| `context.ts` | 399 | Multi-turn conversation state — KV-backed, pronoun resolution, session management |
| `response.ts` | 460 | LLM response generation — Claude 3.5 Haiku, system prompts, source formatting |
| `audit.ts` | 240 | Interaction logging — every query/response logged, feedback capture |
| `bridge.ts` | 216 | Service bridge — wraps existing Wrangler_ services so chat never imports handlers directly |
| `index.ts` | 597 | Pipeline orchestrator — ties intent → retrieval → context → response → audit |

### Chat Routes (`src/routes/`)

| File | Lines | Purpose |
|---|---|---|
| `chatRoutes.ts` | 238 | 5 HTTP endpoints — message, stream, feedback, session, audit |

### Sanity Studio Plugin (`sanity/plugins/chat-tool/`)

| File | Lines | Purpose |
|---|---|---|
| `index.tsx` | 53 | Plugin definition — `definePlugin`, registers Chat as a Studio Tool |
| `ChatTool.tsx` | ~365 | Main chat UI — message list, input, starter prompts, scroll behavior |
| `ChatMessage.tsx` | ~293 | Message bubble — markdown rendering, source attribution, feedback buttons |
| `useChat.ts` | 289 | React hook — NDJSON streaming, state management, feedback submission |

### Tests (`tests/`)

| File | Lines | Purpose |
|---|---|---|
| `tests/unit/chat-module.test.ts` | 863 | 69 Vitest tests — intent classification, retrieval, context, response, audit |

### Eval (`src/chat/eval/`)

| File | Lines | Purpose |
|---|---|---|
| `run-intent-eval.mjs` | 556 | Intent accuracy eval harness — runs against live worker |
| `intent-test-set.json` | 402 | 50 test queries with expected intents and entities |

### Docs (on Miriad board, NOT in repo)

| Path | Purpose |
|---|---|
| `/docs/chat-app/00-master-plan.md` | Full 641-line master plan — phases, architecture, decisions |
| `/docs/sanity-schema-audit.md` | Schema audit results — field mismatches found |

---

## 4. Current Status

| Component | Status | Notes |
|---|---|---|
| Chat backend (5 intents) | ✅ LIVE | Deployed to production, real Sanity data flowing |
| Intent classifier | ✅ 90% accuracy | 45/50 test queries, entity-aware resolution |
| Multi-turn conversations | ✅ Built | KV-backed, pronoun resolution |
| Streaming responses | ✅ Real NDJSON | Token-by-token from Haiku |
| Source attribution | ✅ Built | Every response includes sources |
| Audit log + feedback | ✅ Built | Full interaction logging |
| Sanity Studio Chat Tool | ✅ Built | 4 files, ~950 lines, committed |
| Deploy prep | ✅ Done | .env, scripts, gitignore, validation |
| UI polish | ✅ Done | Starters, keyboard, auto-focus |
| Schema audit | ✅ Done | Found field mismatches, fix in progress |
| Retrieval field fixes | ✅ Done | GROQ queries aligned with actual schema fields (commit `5a2a15d`) |
| Studio deploy | ⏳ Next | Austin deploys with `cd sanity && npm run deploy` |

---

## 5. Known Issues / Active Concerns

1. **retrieval.ts field mismatches** — ✅ FIXED (commit `5a2a15d`). GROQ queries now aligned with actual Sanity schema fields. Note: fix is on `feature/chat-v1` only — production worker still has older retrieval code until merge + redeploy.

2. **`sanity build` needs more RAM** — The dev sandbox doesn't have enough memory for the Sanity Studio build. Deploy from a local machine instead.

3. **Worker bundle size** — 385KB gzip. Well within Cloudflare's limits. Not a concern.

4. **CORS — needs live verification** — Worker CORS is set to `*`, which should allow Studio at `sanity.io` to call `website-scanner.austin-gilbert.workers.dev`. Needs verification on actual deploy.

5. **GROQ dereference validation** — Queries use patterns like `account->companyName`. These need to be confirmed against live production Sanity data (not just schema definitions).

---

## 6. Five Core Intents

| Intent | Trigger Examples | What It Does |
|---|---|---|
| `morning_briefing` | "good morning", "what should I do today?", "daily briefing" | Top actions, overnight signals, priorities |
| `account_lookup` | "tell me about Acme", "what's happening with DataFlow?" | Account overview, signals, actions, people |
| `signal_check` | "any new signals?", "what's changed?", "latest activity" | Recent signals ranked by strength |
| `person_lookup` | "who is Sarah Chen?", "who should I call?" | Contact details, role, associated signals |
| `meeting_prep` | "prep me for my meeting with Acme", "meeting brief for DataFlow" | Account brief, key people, talking points |

Intent classification is **rule-based** (keyword matching + entity extraction in `intent.ts`). No LLM call needed — fast and deterministic.

---

## 7. API Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/chat/message` | Send message, get full JSON response |
| `POST` | `/api/chat/stream` | Send message, get NDJSON streaming response |
| `POST` | `/api/chat/feedback` | Submit thumbs up/down on a response |
| `GET` | `/api/chat/session/:id` | Get conversation history for a session |
| `GET` | `/api/chat/audit` | Get audit log of all interactions |

**Auth:** Every request requires `X-API-Key` header matching the `MOLT_API_KEY` environment variable.

**Request body** (for message/stream):
```json
{
  "message": "tell me about Acme Corp",
  "sessionId": "optional-session-id-for-multi-turn"
}
```

---

## 8. Streaming Protocol

The `/api/chat/stream` endpoint returns NDJSON (newline-delimited JSON). Each line is a complete JSON object:

```
{"type":"token","text":"Based on "}
{"type":"token","text":"the latest "}
{"type":"token","text":"signals, "}
{"type":"sources","data":[{"fact":"Revenue grew 23% YoY","source":"account:acme-corp","observedAt":"2025-06-28"}]}
{"type":"suggestions","data":["What actions are pending for Acme?","Who are the key contacts?"]}
{"type":"done","meta":{"intent":"account_lookup","totalTimeMs":2847}}
```

**Line types:**
| Type | Payload | When |
|---|---|---|
| `token` | `{ text: string }` | Each token as it streams from Haiku |
| `sources` | `{ data: Source[] }` | After response completes — facts with attribution |
| `suggestions` | `{ data: string[] }` | Follow-up question suggestions |
| `done` | `{ meta: { intent, totalTimeMs } }` | Final line — signals stream end |

---

## 9. Key Architectural Decisions

| Decision | Rationale |
|---|---|
| All chat code under `src/chat/` | Clean module boundary — easy to find, test, and reason about |
| `bridge.ts` wraps existing services | Chat never imports from `src/handlers/` directly — decoupled from legacy code |
| One routing block in `src/index.js` at line ~7959 | Minimal touch on the 8,200-line main file |
| KV binding: `MOLTBOOK_ACTIVITY_KV` | Existing KV namespace, not `env.KV` — matches wrangler.toml config |
| Feature flag: `/api/chat/` in `KNOWN_PATH_PREFIXES` | Worker recognizes chat routes without modifying core routing logic |
| Claude 3.5 Haiku for responses | Fast (~2-3s) vs Sonnet (~7-10s). Speed matters for chat UX |
| Rule-based intent classification | Deterministic, fast, no LLM latency. 90% accuracy is sufficient for 5 intents |
| Sanity Studio IS the interface | No separate React app, no operator console. SDRs already live in Studio |

---

## 10. Coordination Rules

> **Every agent must follow these rules.**

### Where to make changes
- **Chat backend** → `src/chat/` or `src/routes/chatRoutes.ts`
- **Studio plugin** → `sanity/plugins/chat-tool/`
- **DO NOT** modify `src/index.js` except the routing block at line ~7959
- **DO NOT** modify existing files in `src/handlers/`, `src/services/`, `src/lib/`

### After making changes
```bash
# Type-check (always)
npx tsc --noEmit

# Run tests (after any chat module change)
npx vitest run

# Run intent eval (after intent.ts or retrieval.ts changes)
node src/chat/eval/run-intent-eval.mjs
```

### Branch discipline
- All work on `feature/chat-v1` branch
- Commit messages: `feat:`, `fix:`, `docs:`, `test:` prefixes
- Austin merges to `main` when ready

---

## 11. What's Next (Priority Order)

| # | Task | Owner | Status |
|---|---|---|---|
| 1 | Fix retrieval.ts field mismatches | Engineering | ✅ Done (commit `5a2a15d`) |
| 2 | Deploy Studio with Chat Tool to sanity.io | Austin | ⏳ Waiting — `cd sanity && npm install && npm run deploy` |
| 3 | Live smoke test chat in actual Studio | Austin + Engineering | ⏳ Blocked on #2 |
| 4 | CORS verification — Studio (sanity.io) → Worker (workers.dev) | Engineering | ⏳ Blocked on #2 — CORS is `*` but needs live verification |
| 5 | Live data validation — confirm GROQ dereferences (`account->companyName`) resolve in production Sanity | Engineering | ⏳ Blocked on #2 |
| 6 | Merge `feature/chat-v1` to `main` | Austin | ⏳ Blocked on #3, #4, #5 |
| 7 | Redeploy worker from `main` with retrieval fixes | Austin | ⏳ Blocked on #6 — production worker has older retrieval code |
| 8 | V2 planning: action execution, persistent history, semantic search | Engineering | ⏳ Future |

---

## 12. Environment & Credentials

| Variable | Value |
|---|---|
| Sanity project ID | `nlqb7zmk` |
| Sanity dataset | `production` |
| Worker URL | `https://website-scanner.austin-gilbert.workers.dev` |
| KV namespace | `MOLTBOOK_ACTIVITY_KV` |

### Deploy commands

```bash
# Deploy Sanity Studio (from local machine — needs RAM)
cd sanity && npm run deploy

# Deploy Cloudflare Worker
npx wrangler deploy
```

### Studio environment variables (in `sanity/.env`)

```
SANITY_STUDIO_WORKER_URL=https://website-scanner.austin-gilbert.workers.dev
SANITY_STUDIO_WORKER_API_KEY=<the MOLT_API_KEY value>
```

### Worker environment variables (in wrangler.toml / CF dashboard)

```
MOLT_API_KEY=<api key for X-API-Key auth>
ANTHROPIC_API_KEY=<for Claude 3.5 Haiku>
SANITY_API_TOKEN=<for GROQ queries>
```

---

## Quick Reference

**"I want to understand the chat system"** → Read `src/chat/index.ts` first, then `intent.ts` → `retrieval.ts` → `response.ts`

**"I want to fix a GROQ query"** → Edit `src/chat/retrieval.ts`, check field names against Sanity schemas, run `npx vitest run`

**"I want to change the UI"** → Edit files in `sanity/plugins/chat-tool/`, test locally with `cd sanity && npm run dev`

**"I want to add a new intent"** → Add to `intent.ts` (classifier), `retrieval.ts` (GROQ query), `response.ts` (system prompt), `types.ts` (type union), then add eval cases to `intent-test-set.json`

**"I want to test the live API"** →
```bash
curl -X POST https://website-scanner.austin-gilbert.workers.dev/api/chat/message \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $MOLT_API_KEY" \
  -d '{"message": "good morning"}'
```
