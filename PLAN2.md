# PLAN2.md — Operator Console & UI Coordination

> **Read PLAN.md first** for the chat module context. This document covers the **operator console rebuild** and broader UI architecture. Last updated: 2026-04-03.

---

## 1. My Role

I am the **operator console builder** — responsible for turning the operator console from a broken monolith into a working, modern power-user interface. I work in parallel with the chat module agent (who owns `src/chat/`, `src/routes/chatRoutes.ts`, and `sanity/plugins/chat-tool/`).

### What I own
- `apps/operator-console/app/(dashboard)/` — all dashboard route pages
- `apps/operator-console/app/(dashboard)/layout.tsx` — shared layout with SnapshotContext
- Design system (`globals.css`) — dark theme tokens, card/badge/pill classes
- Route architecture — App Router route groups, navigation, state management

### What I don't touch
- `src/chat/` — chat backend module (other agent)
- `src/routes/chatRoutes.ts` — chat HTTP endpoints (other agent)
- `sanity/plugins/chat-tool/` — Studio chat plugin (other agent)
- `src/index.js` — main worker file (coordination required)
- `src/handlers/`, `src/services/`, `src/lib/` — existing Wrangler_ code

---

## 2. Project Understanding

### The Big Picture

Wrangler_ is a **64K-line Cloudflare Worker** that powers AI-driven SDR intelligence: signal ingestion, account scoring, action generation, and outreach orchestration, all backed by **Sanity CMS** (project `nlqb7zmk`, dataset `production`, 60+ schema types).

There are two UI surfaces:

| Surface | Purpose | Primary users |
|---|---|---|
| **Sanity Studio** | Chat-first conversational interface for SDRs | SDRs doing daily work |
| **Operator Console** | Full dashboard for power users / ops | Admins, ops, builders |

Per PLAN.md, the Studio is positioned as "THE app." The operator console is the **complementary power-user dashboard** — it shows everything the chat can't: system health, pattern engine internals, autopilot state, bulk operations, diagnostics, and full entity browsing with filters and sorting.

### Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Operator Console (Next.js 16 / App Router)                │
│  └─ app/(dashboard)/ — route group with shared layout      │
│     ├─ layout.tsx     → SnapshotContext, sidebar, cmd bar   │
│     ├─ overview/      → KPIs, top actions, signals, health  │
│     ├─ accounts/      → searchable account list              │
│     ├─ accounts/[id]/ → account detail (signals, people…)    │
│     ├─ signals/       → filterable signal feed               │
│     ├─ pipeline/      → action candidates (list + board)     │
│     ├─ chat/          → chat UI wired to copilot/stream      │
│     ├─ patterns/      → pattern discovery cards              │
│     ├─ research/      → briefs + drafts                      │
│     └─ system/        → engine, patterns, autopilot, diag    │
│                                                              │
│  lib/api.ts    → client-side API (fetchSnapshot, etc.)       │
│  lib/types.ts  → ConsoleSnapshot, AccountDetail, etc.        │
│  lib/server-proxy.ts → proxy requests to CF Worker           │
│  app/api/console/*   → Next.js API routes → Worker           │
│  app/api/chat/*      → proxy to Worker /api/chat/*           │
└────────────────────┬─────────────────────────────────────────┘
                     │ HTTPS
                     ▼
┌────────────────────────────────────────────────────────────┐
│  Cloudflare Worker                                         │
│  └─ /api/console/* → snapshot, accounts, commands, etc.    │
│  └─ /api/chat/*    → chat module (5 endpoints)             │
└────────────────────┬─────────────────────────────────────────┘
                     │ GROQ
                     ▼
┌────────────────────────────────────────────────────────────┐
│  Sanity CMS (nlqb7zmk / production)                        │
│  60+ schema types                                          │
└────────────────────────────────────────────────────────────┘
```

### Key Technical Details

- **SnapshotContext**: All dashboard pages share a single `ConsoleSnapshot` fetched every 60s via React Context in the layout. No prop drilling, no duplicate fetches.
- **Design system**: Dark theme with CSS custom properties — `--background: #0b0b0c`, `--panel: #121214`, `--card: #1a1a1d`. Accents: `--accent: #f03e2f` (Sanity red), `--accent-secondary: #7c5cff`, `--highlight: #3da9fc`.
- **4-tier source trust**: salesforce=0.90, linkedin=0.75, g2=0.65, inferred=0.25.
- **Confidence-wrapped fields**: Every enriched field has `{value, confidence, certain, source, sources[], updated, conflictingValues[]}`.

---

## 3. What I've Built

### Dashboard Route Architecture (10 files, ~2,900 lines)

Replaced the old 2,000-line monolithic `<OperatorConsole>` component (20+ useState hooks, tab switching, no routing, mock data) with a proper App Router route group.

| Route | File | What it does |
|---|---|---|
| `/overview` | `(dashboard)/overview/page.tsx` | KPI cards, top actions, signal feed, system health, completeness, jobs |
| `/accounts` | `(dashboard)/accounts/page.tsx` | Searchable/sortable account table with completion bars, tech tags |
| `/accounts/[id]` | `(dashboard)/accounts/[id]/page.tsx` | Account detail: signals timeline, people, actions, research, patterns, enrichment button |
| `/signals` | `(dashboard)/signals/page.tsx` | Signal feed with type/source dropdowns, search, sort toggle |
| `/pipeline` | `(dashboard)/pipeline/page.tsx` | Action candidates: list view (sortable) + kanban board (by draft status) |
| `/chat` | `(dashboard)/chat/page.tsx` | Chat UI with SSE streaming via `streamCopilotQuery`, starter chips, message history |
| `/patterns` | `(dashboard)/patterns/page.tsx` | Pattern discovery cards with lifecycle badges, conversion metrics, recommended moves |
| `/research` | `(dashboard)/research/page.tsx` | Tabbed briefs/drafts with expandable markdown content |
| `/system` | `(dashboard)/system/page.tsx` | 4-tab lab: overview (engine, health, capabilities, batch ops, jobs), patterns, autopilot, diagnostics |

### Layout (`(dashboard)/layout.tsx`)

- **SnapshotContext** with `useSnapshot()` hook — global state for all pages
- **Sidebar navigation**: 8 items with icons, active state, signal/pipeline badge counts
- **Command bar**: search, refresh button, last-refresh timestamp, assistant panel toggle
- **Assistant panel**: slide-out right panel (placeholder for copilot integration)
- **Keyboard**: Cmd+K handler stub for command palette
- **Polling**: 60s interval for snapshot refresh

---

## 4. What Exists (Not Mine)

The other agent built these on `feature/chat-v1`:

| Component | Status | Location |
|---|---|---|
| Chat backend (5 intents) | ✅ LIVE | `src/chat/` |
| Chat routes | ✅ LIVE | `src/routes/chatRoutes.ts` |
| Sanity Studio Chat Tool | ✅ Built | `sanity/plugins/chat-tool/` |
| Operator console chat components | ✅ Built | `components/chat/` |
| Chat API proxy | ✅ Built | `app/api/chat/[...path]/route.ts` |
| retrieval.ts field fixes | ✅ Fixed | `src/chat/retrieval.ts` |
| PLAN.md | ✅ Published | repo root |

I also preserved these existing files untouched:

| File | Purpose |
|---|---|
| `lib/api.ts` (162 lines) | Client-side API layer — all pages use this |
| `lib/types.ts` (582 lines) | TypeScript types — ConsoleSnapshot, AccountDetail, etc. |
| `lib/server-proxy.ts` (38 lines) | Server-side proxy to Worker |
| `app/api/console/*` (16 route files) | Next.js API routes proxying to Worker |
| `globals.css` (161 lines) | Dark theme design system |
| `app/layout.tsx` | Root layout (Inter font, metadata) |
| `app/draft/[id]/page.tsx` | Draft detail page (standalone) |
| `app/job/[id]/page.tsx` | Job detail page (standalone) |
| `app/research/[id]/page.tsx` | Research brief detail page (standalone) |
| `components/operator-console.tsx` | Old monolith (kept for reference, no longer used) |

---

## 5. Known Issues

1. **Git lock file**: The Mac-mounted repo has a stale `.git/index.lock` that prevents git operations from the sandbox. Austin needs to run `rm .git/index.lock` locally then commit/push.

2. **Root page.tsx conflict**: Can't delete `app/page.tsx` from the sandbox due to mount permissions. It's been modified to `redirect('/overview')` but ideally should be deleted once git lock is cleared.

3. **Old monolith still in tree**: `components/operator-console.tsx` is no longer imported but still exists. Can be deleted in a cleanup commit.

4. **Chat page dual implementations**: My `(dashboard)/chat/page.tsx` uses `streamCopilotQuery` from `lib/api.ts` (proxying to `/api/console/copilot/stream`), while the other agent's `components/chat/` uses `useChat.ts` (proxying to `/api/chat/stream`). These are different endpoints. The chat page in the dashboard should eventually be consolidated to use the newer `/api/chat/stream` NDJSON protocol.

5. **Type gaps**: Some dashboard views (patterns, research) rely on shape assumptions from `ConsoleSnapshot` that may not match what the Worker actually returns. Need end-to-end testing once both surfaces are deployed.

---

## 6. Coordination Rules

### Where I make changes
- `apps/operator-console/app/(dashboard)/` — all dashboard pages
- `apps/operator-console/globals.css` — design tokens
- `apps/operator-console/components/dashboard/` — dashboard-specific components (future)
- `apps/operator-console/components/shared/` — shared UI components (future)

### Where I DON'T make changes
- `src/chat/` or `src/routes/chatRoutes.ts` — chat backend
- `sanity/plugins/` — Studio plugins
- `src/index.js` — main worker
- `src/handlers/`, `src/services/`, `src/lib/` — existing Wrangler_ code
- `lib/api.ts`, `lib/types.ts` — only modify with coordination

### After making changes
```bash
# Verify TypeScript compiles
cd apps/operator-console && npx tsc --noEmit

# Dev server
npm run dev

# Visual check
# Open http://localhost:3000/overview
```

### Branch discipline
- All work on `feature/chat-v1`
- Commit messages: `feat(operator-console):`, `fix(operator-console):`, `docs:`
- Austin merges to `main`

---

## 7. What's Next (Priority Order)

| # | Task | Status |
|---|---|---|
| 1 | Clear git lock + commit/push dashboard rebuild | ⏳ Needs Austin to run `rm .git/index.lock` |
| 2 | Delete old monolith `components/operator-console.tsx` | ⏳ After push |
| 3 | Consolidate chat page to use `/api/chat/stream` NDJSON | ⏳ After chat module is stable |
| 4 | Build shared UI components (`components/shared/`) | ⏳ As needed |
| 5 | End-to-end testing: Console ↔ Worker ↔ Sanity | ⏳ After both surfaces deployed |
| 6 | Command palette (Cmd+K) | ⏳ Future |
| 7 | Action execution from pipeline/account detail | ⏳ Future |
| 8 | Real-time WebSocket updates (replace polling) | ⏳ Future |

---

## 8. Design Philosophy

The operator console should feel like **CommonRoom meets Linear** — information-dense but clean. Key principles:

- **Dark-first**: Enterprise ops tools are used in dark rooms. No light mode needed yet.
- **Data-dense, not cluttered**: Every pixel earns its place. Small text (11-13px), tight spacing, high information density.
- **Confidence-aware**: Show uncertainty states, strength bars, completion percentages everywhere. Never pretend data is more certain than it is.
- **Action-oriented**: Every view should answer "what should I do next?" — top actions, enrichment buttons, quick commands.
- **Progressive disclosure**: Tables and lists on the overview → detail pages on click → expandable sections within detail pages.
- **Real data only**: No mock data, no placeholder content. If the Worker returns empty arrays, show clean empty states.

---

## Quick Reference

**"I want to add a new dashboard page"** → Create `app/(dashboard)/newpage/page.tsx`, import `useSnapshot` from `../layout`, add nav entry to `NAV` array in `layout.tsx`

**"I want to modify the sidebar"** → Edit `NAV` array in `(dashboard)/layout.tsx`

**"I want to change the design tokens"** → Edit `globals.css` `:root` block

**"I want to add a new API call"** → Add to `lib/api.ts`, add corresponding route in `app/api/console/`

**"I want to change the snapshot shape"** → Update `lib/types.ts` (ConsoleSnapshot), coordinate with Worker team
