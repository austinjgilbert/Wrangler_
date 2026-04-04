# CLAUDEPLANS.md — Tasks for Claude Code Agent

> **Context:** You are Agent B working on the `Wrangler_` repo, branch `feature/chat-v1`. Read `PLAN.md` at repo root first — it defines ownership boundaries. You own `apps/operator-console/`. Do NOT touch `src/chat/`, `src/routes/chatRoutes.ts`, or `sanity/plugins/`.

---

## Task 1: Make Chat the Default Route (Priority: HIGH)

**Goal:** When a user opens the app, they land on Chat — not Overview. Chat is the command center.

**Steps:**
1. Edit `apps/operator-console/app/page.tsx` — change `redirect('/overview')` to `redirect('/chat')`
2. In `apps/operator-console/app/(dashboard)/layout.tsx`, reorder the `NAV` array so Chat is first:
   ```typescript
   const NAV = [
     { href: '/chat', label: 'Chat', icon: MessageSquare },
     { href: '/overview', label: 'Overview', icon: LayoutDashboard },
     { href: '/accounts', label: 'Accounts', icon: Building2 },
     // ... rest unchanged
   ] as const;
   ```
3. Verify the app loads to `/chat` by default

**Files to change:**
- `apps/operator-console/app/page.tsx` (1 line change)
- `apps/operator-console/app/(dashboard)/layout.tsx` (reorder NAV array)

**Commit:** `feat(operator-console): make chat the default route`

---

## Task 2: Add Chat API Proxy Route

**Goal:** The app needs a Next.js API route that proxies to the Worker's `/api/chat/*` endpoints, so the chat UI can work in both local dev (via proxy) and deployed (direct to Worker) modes.

**Steps:**
1. Create `apps/operator-console/app/api/chat/[...path]/route.ts`
2. It should proxy requests to the Worker's `/api/chat/*` endpoints
3. Use the same pattern as the existing console proxy in `app/api/console/`
4. Reference `lib/server-proxy.ts` for the `proxyToWorker` helper

**Example implementation:**
```typescript
import { NextRequest } from 'next/server';
import { proxyToWorker } from '@/lib/server-proxy';

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = `/api/chat/${params.path.join('/')}`;
  return proxyToWorker(req, path);
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = `/api/chat/${params.path.join('/')}`;
  return proxyToWorker(req, path);
}
```

**Files to create:**
- `apps/operator-console/app/api/chat/[...path]/route.ts`

**Commit:** `feat(operator-console): add chat API proxy route`

---

## Task 3: Update App Metadata for Chat-First Identity

**Goal:** The app's title and description should reflect that it's a chat-first intelligence tool, not just a dashboard.

**Steps:**
1. Edit `apps/operator-console/app/layout.tsx`:
   ```typescript
   export const metadata: Metadata = {
     title: 'Wrangler_ Intelligence',
     description: 'Chat-first command center for SDR intelligence — ask anything about your accounts, signals, and pipeline.',
   };
   ```

**Files to change:**
- `apps/operator-console/app/layout.tsx` (metadata only)

**Commit:** `chore(operator-console): update app metadata for chat-first identity`

---

## Task 4: Ensure resolveEndpoint Handles Chat Routes

**Goal:** The `resolveEndpoint()` function in `lib/api.ts` needs to support chat endpoints so the UI can call `/api/chat/stream`, `/api/chat/feedback`, etc.

**Steps:**
1. Check `lib/api.ts` — the `resolveEndpoint(proxyPath, workerPath)` function already handles dual-mode (proxy vs direct). Verify it works for chat paths.
2. Add chat-specific API functions if they don't exist:
   ```typescript
   export function chatStreamEndpoint(): string {
     return resolveEndpoint('/api/chat/stream', '/api/chat/stream');
   }
   
   export function chatFeedbackEndpoint(): string {
     return resolveEndpoint('/api/chat/feedback', '/api/chat/feedback');
   }
   ```
3. These will be used by the `useChat` hook that Agent A is porting into the app.

**Files to change:**
- `apps/operator-console/lib/api.ts` (add chat endpoint helpers)

**Commit:** `feat(operator-console): add chat endpoint helpers to api.ts`

---

## Coordination Rules

1. **Always pull before starting:** `git pull --rebase origin feature/chat-v1`
2. **Always push after committing:** `git push origin feature/chat-v1`
3. **Stay in your lane:** Only modify files under `apps/operator-console/`
4. **Do NOT touch:** `src/chat/`, `src/routes/`, `sanity/plugins/`, `src/index.js`
5. **Commit prefixes:** `feat(operator-console):`, `fix(operator-console):`, `chore(operator-console):`
6. **If you need changes to shared files** (`lib/api.ts`, `lib/types.ts`), make them but note what you changed at the bottom of this file under "Changes Made"

---

## Changes Made
<!-- Claude Code: log your changes here so the Miriad agents know what happened -->
- `95b271f` — Task 1 (default route to /chat), Task 2 (entity links), Task 3 (nav-aware suggestions) — all done in one commit

---

# Phase 2 Tasks — SDK App Conversion + Hardening

> **Context:** The app needs to become a Sanity App SDK application. Meanwhile, there are hardening tasks that don't conflict with the backend bug fixes @engineering is working on. These are all in `apps/operator-console/` — Agent B territory.

---

## Task 5: Research Sanity App SDK Architecture

**Goal:** Understand what's needed to convert the Operator Console from plain Next.js to a Sanity App SDK app that deploys to `sanity.io`.

**Research questions:**
1. What does a Sanity App SDK project structure look like? (`sanity.cli.ts`, entry point, build system)
2. Can an App SDK app use Next.js App Router, or does it need a different framework?
3. How does auth work? (SDK apps get Sanity auth for free — how do we access the token?)
4. How do we call the Cloudflare Worker from inside an SDK app? (direct fetch with auth headers?)
5. What's the deploy command and config? (`npx sanity deploy` with `app.id`)

**Steps:**
1. Read https://www.sanity.io/docs/app-sdk/sdk-quickstart
2. Read https://www.sanity.io/docs/app-sdk/sdk-deployment
3. Read https://github.com/sanity-io/sdk
4. Check if there are example apps that use a chat/dashboard pattern
5. Write a summary at the bottom of this file under "SDK Research Findings"

**Do NOT create any files yet.** Just research and document findings.

**Commit:** None — research only, document in this file.

---

## Task 6: Build Self-Contained Card Component Library

**Goal:** Create the card component scaffolding that will render rich data cards in chat responses. These must be pure components with no dependency on the app shell.

**Reference:** Read `/docs/design/card-protocol-spec.md` and `/docs/design/00-design-vision.md` in the repo (these are on the Miriad board, not in the repo — ask Austin or check the design specs below).

**Card protocol:** Each card receives:
```typescript
type CardProps = {
  cardType: 'account' | 'person' | 'signal' | 'action' | 'briefing';
  data: Record<string, any>;
  _meta?: {
    display: 'inline' | 'expanded' | 'summary';
    navigable?: boolean;
    href?: string;
  };
};
```

**Steps:**
1. Create `apps/operator-console/components/cards/` directory with this structure:
   ```
   /components/cards/
     CardRenderer.tsx       ← Takes {type, cardType, _meta, data} → dispatches to correct card
     AccountCard.tsx        ← Pure component: AccountCardData → JSX
     PersonCard.tsx
     SignalCard.tsx
     ActionCard.tsx
     BriefingCard.tsx
     ConfirmationCard.tsx   ← Phase 4 stub (empty for now)
     ResultCard.tsx         ← Phase 4 stub (empty for now)
     shared/
       OpportunityGauge.tsx  ← Segmented bar, reused in Account + Action cards
       ConfidenceDot.tsx     ← Color-coded dot, reused everywhere
       SignalBadge.tsx       ← Signal type icon + strength, reused in Signal + Briefing
       SeniorityBadge.tsx    ← Color-coded pill for person seniority level
       TechPill.tsx          ← Individual tech stack pill
       PriorityIndicator.tsx ← Left border + icon for action priority
       EntityLink.tsx        ← Clickable entity name with hover preview
       CardSkeleton.tsx      ← Shimmer loading placeholder
     types.ts               ← TypeScript interfaces matching card protocol spec
     tokens.css             ← Card-specific CSS custom properties
   ```
2. **Key rules:**
   - Every card component is a **pure function**: `(data: AccountCardData, meta: CardMeta) => JSX.Element`. No hooks depending on router, no global state, no context providers.
   - Use **token names** from the design system: `var(--surface-raised)` not `#1a1a1d`. If tokens aren't in `globals.css` yet, add them from the design spec below.
   - `CardRenderer` is the **only component the chat layer imports**. It dispatches to the right card type.
   - **Graceful degradation is inline**: `{data.industry && <span>{data.industry}</span>}`. No separate "has data" / "no data" branches.
   - TypeScript interfaces in `types.ts` must match the card protocol spec exactly.
3. Create stub components for each card type:
   - `AccountCard.tsx` — name, domain, opportunityScore (required), industry/techStack/completeness (enhanced)
   - `PersonCard.tsx` — name, title (required), company/seniority/linkedin (enhanced)
   - `SignalCard.tsx` — signalType, strength, timestamp (required), summary/source (enhanced)
   - `ActionCard.tsx` — actionType, whyNow, urgency (required), evidence/account (enhanced)
   - `BriefingCard.tsx` — date, topActions, overnightSignals (required)
   - `ConfirmationCard.tsx` — empty stub with TODO comment
   - `ResultCard.tsx` — empty stub with TODO comment
4. Each card should handle missing enhanced fields gracefully (collapse, don't show "Unknown")
5. Add a `_meta.navigable` check — if true, wrap the card in a clickable link to `_meta.href`

**Design tokens to use:**
```css
--surface-raised: #1a1a1d    /* card background */
--border-subtle: #ffffff0d    /* card border */
--text-primary: #f0f0f0       /* main text */
--text-secondary: #a0a0a8     /* labels */
--text-tertiary: #6b6b76      /* metadata */
--accent-primary: #f03e2f     /* primary actions */
--status-success: #22c55e     /* high confidence, complete */
--status-warning: #f59e0b     /* medium confidence, partial */
--status-error: #ef4444       /* low confidence, needs attention */
```

**Commit prefix:** `feat(operator-console):`

---

## Task 7: Add Error States and Loading Skeletons to Chat

**Goal:** The chat page needs proper error handling — not fake fallback responses that look like real answers.

**Steps:**
1. In `apps/operator-console/app/(dashboard)/chat/page.tsx`:
   - Add a timeout (10s) — if no real tokens arrive, show an error state
   - Error state text: "I couldn't retrieve that information. Try again or rephrase your question."
   - Style in `--text-tertiary` color
   - Add a "Retry" chip below the error message
2. Add a streaming skeleton/shimmer animation while waiting for first token
3. If the NDJSON stream returns an error event, display it clearly — don't hide it

**Commit prefix:** `feat(operator-console):`

---

## Task 8: Sanity App SDK Conversion (after Task 5 research)

**Goal:** Convert the Operator Console to a Sanity App SDK application.

**Prerequisites:** Task 5 research must be complete first.

**Steps:** (will be defined based on Task 5 findings)

**Commit prefix:** `feat(operator-console):`

---

## SDK Research Findings

### 1. Project Structure
- Config: `sanity.cli.ts` with `organizationId` and `entry: './src/App.tsx'`
- Entry: `src/App.tsx` wraps app in `<SanityApp />` context provider
- Build: Standard npm/pnpm. Dev on port 3333 via `npm run dev`

### 2. Framework
- SDK apps are **NOT Next.js** — standalone React apps running inside Sanity Dashboard as iframes
- No SSR, no API routes, no App Router
- **Implication:** Full conversion means stripping Next.js → pure React with `@sanity/sdk-react`

### 3. Auth
- Automatic via Dashboard iframe token hash (`#token=…`)
- `<SanityApp />` handles token lifecycle — all SDK hooks auto-include auth
- No manual token handling for Sanity API calls

### 4. Worker Integration
- SDK auth tokens are Sanity-only — NOT included in cross-origin fetch
- For Worker: use `X-API-Key` header (current approach), or proxy through Sanity backend functions

### 5. Deploy
- `npx sanity deploy` → deploys to Sanity Dashboard
- First deploy saves `app.id` in `sanity.cli.ts`
- Requires org admin or Developer role

### Recommendation
Keep the operator console as Next.js deployed to Vercel/CF Pages. If Studio integration needed, create a lightweight SDK app for the chat widget only.

---

## Changes Made (Phase 2)
- Tasks 3+4: metadata → "Wrangler_ Intelligence"; chat endpoint helpers + authHeaders export in api.ts
- Task 6: Card component library (19 files) — CardRenderer, 5 card types, 8 shared components
- Task 7: ErrorState with retry, StreamingSkeleton shimmer in chat page

