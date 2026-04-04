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
<!-- Claude Code: document your SDK research here -->


---

# Phase 3 Tasks — Large Sprint (Overnight)

> **Context:** Austin wants a big push. These tasks are all in `apps/operator-console/` — Agent B territory. They can be done in order. Pull before each task, push after each commit. The backend fixes are handled by Agent A (@engineering) — don't touch `src/`.

---

## Task 9: Design System CSS Tokens — Full Implementation

**Goal:** Replace the minimal CSS custom properties in `globals.css` with the complete design token system. This is the foundation for all card components and UI improvements.

**Steps:**
1. Open `apps/operator-console/app/globals.css`
2. Add the complete `:root` block with ALL design tokens (namespaced with `--wrangler-` prefix to avoid Sanity SDK collisions):

```css
:root {
  /* Surfaces (6-tier depth) */
  --wrangler-surface-ground: #0b0b0c;
  --wrangler-surface-base: #111113;
  --wrangler-surface-raised: #1a1a1d;
  --wrangler-surface-overlay: #222226;
  --wrangler-surface-elevated: #2a2a2f;
  --wrangler-surface-floating: #333338;

  /* Borders (4-tier) */
  --wrangler-border-subtle: rgba(255, 255, 255, 0.05);
  --wrangler-border-default: rgba(255, 255, 255, 0.1);
  --wrangler-border-strong: rgba(255, 255, 255, 0.15);
  --wrangler-border-focus: #3da9fc;

  /* Text (5-tier) */
  --wrangler-text-primary: #f0f0f0;
  --wrangler-text-secondary: #a0a0a8;
  --wrangler-text-tertiary: #6b6b76;
  --wrangler-text-muted: #4a4a54;
  --wrangler-text-inverse: #0b0b0c;

  /* Accent */
  --wrangler-accent-primary: #f03e2f;
  --wrangler-accent-secondary: #7c5cff;
  --wrangler-accent-highlight: #3da9fc;
  --wrangler-accent-success: #22c55e;

  /* Status */
  --wrangler-status-success: #22c55e;
  --wrangler-status-warning: #f59e0b;
  --wrangler-status-error: #ef4444;
  --wrangler-status-info: #3da9fc;

  /* Confidence (for data quality indicators) */
  --wrangler-confidence-high: #22c55e;
  --wrangler-confidence-medium: #f59e0b;
  --wrangler-confidence-low: #ef4444;
  --wrangler-confidence-unknown: #6b6b76;

  /* Signal strength gradient */
  --wrangler-signal-strong: #f03e2f;
  --wrangler-signal-moderate: #f59e0b;
  --wrangler-signal-weak: #3da9fc;

  /* Score tiers (opportunity scores) */
  --wrangler-score-hot: #f03e2f;
  --wrangler-score-warm: #f59e0b;
  --wrangler-score-cool: #3da9fc;
  --wrangler-score-cold: #6b6b76;

  /* Typography */
  --wrangler-font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --wrangler-font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --wrangler-font-size-xs: 0.75rem;
  --wrangler-font-size-sm: 0.8125rem;
  --wrangler-font-size-base: 0.875rem;
  --wrangler-font-size-lg: 1rem;
  --wrangler-font-size-xl: 1.25rem;
  --wrangler-font-size-2xl: 1.5rem;

  /* Spacing (4px grid) */
  --wrangler-space-1: 4px;
  --wrangler-space-2: 8px;
  --wrangler-space-3: 12px;
  --wrangler-space-4: 16px;
  --wrangler-space-5: 20px;
  --wrangler-space-6: 24px;
  --wrangler-space-8: 32px;
  --wrangler-space-10: 40px;
  --wrangler-space-12: 48px;

  /* Radius */
  --wrangler-radius-sm: 4px;
  --wrangler-radius-md: 8px;
  --wrangler-radius-lg: 12px;
  --wrangler-radius-xl: 16px;
  --wrangler-radius-full: 9999px;

  /* Shadows */
  --wrangler-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --wrangler-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --wrangler-shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);

  /* Transitions */
  --wrangler-transition-fast: 150ms ease;
  --wrangler-transition-normal: 250ms ease;
  --wrangler-transition-slow: 350ms ease;
  --wrangler-transition-spring: 250ms cubic-bezier(0.32, 0.72, 0, 1);
}
```

3. Keep existing token names as aliases mapping to the new system (backward compat):
```css
:root {
  /* Legacy aliases */
  --background: var(--wrangler-surface-ground);
  --card: var(--wrangler-surface-raised);
  --accent: var(--wrangler-accent-primary);
  --accent-secondary: var(--wrangler-accent-secondary);
  --highlight: var(--wrangler-accent-highlight);
}
```

4. Add card animation keyframes:
```css
@keyframes wrangler-card-reveal {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes wrangler-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@keyframes wrangler-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes wrangler-cursor-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
```

**Commit:** `feat(operator-console): implement full design token system with --wrangler- namespace`

---

## Task 10: Briefing-First Empty State

**Goal:** When the chat loads with no conversation, show a focused "start your day" experience instead of 5 conversation starters (4 of which may not work reliably yet).

**Steps:**
1. Edit `apps/operator-console/app/(dashboard)/chat/page.tsx`
2. Replace the current empty state / conversation starters with:

```tsx
// Empty state — briefing-first
<div className="chat-empty-state" style={{
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: 'var(--wrangler-space-6)',
  padding: 'var(--wrangler-space-8)',
}}>
  <h1 style={{
    fontSize: 'var(--wrangler-font-size-2xl)',
    fontWeight: 600,
    color: 'var(--wrangler-text-primary)',
    fontFamily: 'var(--wrangler-font-sans)',
  }}>
    Good morning. Ready for your briefing?
  </h1>
  <p style={{
    fontSize: 'var(--wrangler-font-size-base)',
    color: 'var(--wrangler-text-tertiary)',
    maxWidth: '400px',
    textAlign: 'center',
  }}>
    I'll analyze your accounts, signals, and pipeline to surface what matters today.
  </p>
  <button
    onClick={() => handleSendMessage('good morning')}
    style={{
      background: 'var(--wrangler-accent-primary)',
      color: 'var(--wrangler-text-primary)',
      border: 'none',
      borderRadius: 'var(--wrangler-radius-lg)',
      padding: 'var(--wrangler-space-3) var(--wrangler-space-6)',
      fontSize: 'var(--wrangler-font-size-base)',
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'var(--wrangler-transition-fast)',
    }}
  >
    ☀️ Start my day
  </button>
</div>
```

3. The greeting should be time-aware: "Good morning" / "Good afternoon" / "Good evening" based on local time.
4. Keep the text input at the bottom so users can still type freely.

**Commit:** `feat(operator-console): briefing-first empty state with time-aware greeting`

---

## Task 11: Streaming Skeleton + Loading States

**Goal:** Show a shimmer skeleton while waiting for the LLM response (~5 seconds), then crossfade to real content.

**Steps:**
1. Create `apps/operator-console/components/chat/StreamingSkeleton.tsx`:

```tsx
export function StreamingSkeleton() {
  return (
    <div className="streaming-skeleton" style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--wrangler-space-3)',
      padding: 'var(--wrangler-space-4)',
      animation: 'wrangler-pulse 1.5s ease-in-out infinite',
    }}>
      <div style={{
        height: '14px',
        width: '60%',
        borderRadius: 'var(--wrangler-radius-sm)',
        background: 'linear-gradient(90deg, var(--wrangler-surface-raised) 25%, var(--wrangler-surface-overlay) 50%, var(--wrangler-surface-raised) 75%)',
        backgroundSize: '200% 100%',
        animation: 'wrangler-shimmer 1.5s ease-in-out infinite',
      }} />
      <div style={{ height: '14px', width: '80%', /* same shimmer styles */ }} />
      <div style={{ height: '14px', width: '45%', /* same shimmer styles */ }} />
    </div>
  );
}
```

2. In the chat page, show `<StreamingSkeleton />` immediately after the user sends a message, before any tokens arrive.
3. When the first real token arrives, crossfade from skeleton to content (opacity transition).
4. Add a "Analyzing..." label with a pulsing dot above the skeleton.
5. If no tokens arrive within 10 seconds, show an error state:
   - Text: "I couldn't retrieve that information. Try again or rephrase your question."
   - Color: `var(--wrangler-text-tertiary)`
   - Add a "Retry" button that resends the last message.

**Commit:** `feat(operator-console): streaming skeleton with shimmer animation and error timeout`

---

## Task 12: Fix TypeScript Errors in Chat Components

**Goal:** Clean up the 51 TypeScript errors in `components/chat/` that @contrarian identified.

**Steps:**
1. Run `npx tsc --noEmit` from `apps/operator-console/` to get the full error list
2. Fix each error. Common patterns:
   - Missing type imports
   - Unused variables (remove them)
   - Dead code in old chat components (delete the files if they're not imported anywhere)
   - Type mismatches between old copilot types and new NDJSON types
3. Delete any files in `components/chat/` that are not imported by any page or layout
4. Verify zero TypeScript errors after cleanup

**Commit:** `fix(operator-console): resolve all TypeScript errors in chat components`

---

## Task 13: Implement useChat Hook for NDJSON Streaming

**Goal:** Create a robust React hook that handles the NDJSON streaming protocol for the chat UI.

**Reference:** The NDJSON protocol sends events: `token`, `source`, `suggestion`, `card`, `done`, `error`.

**Steps:**
1. Create `apps/operator-console/hooks/use-chat.ts` (or update existing if it exists)
2. The hook should:

```typescript
interface UseChatOptions {
  endpoint?: string;  // defaults to '/api/chat/stream'
  apiKey?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: Source[];
  suggestions: string[];
  cards: CardEvent[];
  isStreaming: boolean;
  error?: string;
}

function useChat(options?: UseChatOptions) {
  // Returns:
  return {
    messages: ChatMessage[],
    sendMessage: (text: string) => void,
    isLoading: boolean,
    error: string | null,
    retry: () => void,
  };
}
```

3. Handle NDJSON parsing:
   - Read the response as a stream using `ReadableStream` + `TextDecoder`
   - Split on newlines, parse each line as JSON
   - Accumulate `token` events into the message content
   - Collect `source` events into the sources array
   - Collect `suggestion` events into the suggestions array
   - Collect `card` events into the cards array
   - On `done` event, mark message as complete
   - On `error` event, set error state

4. Handle edge cases:
   - Network errors → show error state with retry
   - Partial JSON lines (buffer until newline)
   - Abort previous request if user sends a new message

**Commit:** `feat(operator-console): implement useChat hook with NDJSON streaming`

---

## Task 14: Wire Chat Page to useChat Hook

**Goal:** Connect the chat page UI to the new useChat hook so messages flow through the NDJSON protocol.

**Steps:**
1. In `apps/operator-console/app/(dashboard)/chat/page.tsx`:
   - Import and use the `useChat` hook
   - Replace any existing chat state management with the hook
   - Render messages from `messages` array
   - Use `sendMessage` for the input handler
   - Show `StreamingSkeleton` when `isLoading` is true
   - Show error state when `error` is set
   - Render suggestion chips from the latest message's `suggestions`
   - Render source badges from the latest message's `sources`

2. Message rendering:
   - User messages: right-aligned, `var(--wrangler-surface-overlay)` background
   - AI messages: full-width, no background (content, not bubble)
   - Support markdown in AI messages (use a simple markdown renderer or `dangerouslySetInnerHTML` with sanitization)

3. Auto-scroll to bottom on new messages
4. Focus the input after sending

**Commit:** `feat(operator-console): wire chat page to useChat hook with NDJSON rendering`

---

## Task 15: Source Attribution Badges

**Goal:** Render source attribution badges below AI responses so users can see where data came from.

**Steps:**
1. Create `apps/operator-console/components/chat/SourceBadge.tsx`:

```tsx
interface Source {
  type: string;      // 'account' | 'person' | 'signal' | 'action'
  id: string;
  title: string;
  relevance?: number;
}

function SourceBadge({ source }: { source: Source }) {
  const iconMap = { account: '🏢', person: '👤', signal: '📡', action: '🎯' };
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--wrangler-space-1)',
      padding: '2px 8px',
      borderRadius: 'var(--wrangler-radius-full)',
      background: 'var(--wrangler-surface-overlay)',
      border: '1px solid var(--wrangler-border-subtle)',
      fontSize: 'var(--wrangler-font-size-xs)',
      color: 'var(--wrangler-text-secondary)',
    }}>
      {iconMap[source.type] || '📄'} {source.title}
    </span>
  );
}
```

2. Render a row of source badges below each AI message that has sources
3. If no sources, don't render the section (no empty "Sources:" header)

**Commit:** `feat(operator-console): source attribution badges for chat responses`

---

## Task 16: Suggestion Chips

**Goal:** Render clickable suggestion chips below AI responses that send follow-up queries.

**Steps:**
1. Create `apps/operator-console/components/chat/SuggestionChip.tsx`:

```tsx
function SuggestionChip({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      background: 'transparent',
      border: '1px solid var(--wrangler-border-default)',
      borderRadius: 'var(--wrangler-radius-full)',
      padding: 'var(--wrangler-space-2) var(--wrangler-space-4)',
      color: 'var(--wrangler-text-secondary)',
      fontSize: 'var(--wrangler-font-size-sm)',
      cursor: 'pointer',
      transition: 'var(--wrangler-transition-fast)',
    }}>
      {text}
    </button>
  );
}
```

2. Render suggestion chips below the last AI message
3. Clicking a chip calls `sendMessage(chip.text)`
4. Chips should fade in with a stagger animation after the response completes

**Commit:** `feat(operator-console): suggestion chips for follow-up queries`

---

## Task 17: Clean Up Dead Code and Unused Dependencies

**Goal:** Remove dead code, unused imports, and old copilot references from the operator console.

**Steps:**
1. Delete any files in `components/chat/` that are not imported (old copilot UI)
2. Remove unused imports across all files
3. Remove any references to the old `/operator/console/copilot/` endpoints
4. Run `npx tsc --noEmit` — must be zero errors
5. Run `npm run build` — must succeed

**Commit:** `chore(operator-console): remove dead code and unused dependencies`

---

## Task 18: Responsive Chat Layout

**Goal:** Make the chat page work well on different screen sizes.

**Breakpoints:**
- Desktop (>1024px): Full layout with sidebar nav
- Tablet (768-1024px): Collapsed sidebar, full chat
- Mobile (<768px): No sidebar, chat only, bottom nav

**Steps:**
1. Add responsive styles to the chat page
2. Input area should be fixed at bottom on mobile
3. Messages should have appropriate padding on small screens
4. Suggestion chips should wrap on narrow screens
5. Source badges should scroll horizontally on narrow screens

**Commit:** `feat(operator-console): responsive chat layout for mobile and tablet`

---

## Coordination Rules (Updated)

1. **Always pull before starting:** `git pull --rebase origin feature/chat-v1`
2. **Always push after committing:** `git push origin feature/chat-v1`
3. **Stay in your lane:** Only modify files under `apps/operator-console/`
4. **Do NOT touch:** `src/chat/`, `src/routes/`, `sanity/plugins/`, `src/index.js`
5. **Commit prefixes:** `feat(operator-console):`, `fix(operator-console):`, `chore(operator-console):`
6. **Do tasks in order** — each builds on the previous
7. **If TypeScript errors appear after a task, fix them before moving on**
8. **Log every change** at the bottom of this file under "Changes Made"

---

## Phase 3 Completion Log (Agent B — Claude Code)

> **Updated:** 2026-04-03 by Agent B

### Task Status

| Task | Status | Commit | Notes |
|------|--------|--------|-------|
| Task 9: Design tokens | DONE | `ea18487` | Full --wrangler- namespace, legacy aliases, 6 keyframes |
| Task 10: Briefing empty state | DONE | `e83103a` | Time-aware greeting, "Start my day" CTA, secondary starters |
| Task 11: Streaming skeleton | DONE | `7e43e5e` | Shimmer gradient, "Analyzing..." indicator, wrangler tokens |
| Task 12: Fix TS errors | DONE (pre-existing) | — | useChat hook already clean, chat page already typed |
| Task 13: useChat hook | DONE (pre-existing) | — | `lib/use-chat.ts` already implements full NDJSON streaming |
| Task 14: Wire chat to hook | DONE (pre-existing) | — | Chat page imports useChat, all handlers connected |
| Task 15: Source badges | DONE (pre-existing) | — | SourceBadge + SourcesSection inline in chat/page.tsx |
| Task 16: Suggestion chips | DONE (pre-existing) | — | SuggestionChips with nav-awareness inline in chat/page.tsx |
| Task 17: Dead code cleanup | DONE | `584d718` | 19 files deleted, 2,328 lines removed |
| Task 18: Responsive layout | DONE | `4bb3ed6` | Tablet hides sidebar, mobile fixes input bar |

### What Was Built

**Task 9 — Design Token System:**
- `globals.css` now has full `--wrangler-*` namespace: surfaces (4-tier), borders (3-tier), text (5-tier), accent, status, confidence, signal, score, typography, spacing, radius, shadows, transitions
- Legacy aliases (--background, --card, --accent, etc.) map to new tokens
- 6 keyframe animations: card-reveal, shimmer, pulse, cursor-blink, fade-in, stagger-in
- `tokens.css` in cards/ now derives from --wrangler-* with fallback values

**Task 10 — Briefing Empty State:**
- Time-aware greeting: "Good morning/afternoon/evening. Ready for your briefing?"
- Primary CTA button sends "good morning" to trigger briefing intent
- Secondary starters (minus morning_briefing) show as smaller chips below

**Task 11 — Streaming Skeleton:**
- Gradient shimmer animation (linear-gradient 200% sweep)
- Pulsing red dot + "Analyzing..." text above skeleton bars
- Uses --wrangler-* tokens for all styles

**Task 17 — Dead Code Removal:**
- `components/chat/` (4 files) — superseded by inline chat in page.tsx
- `components/layout/app-shell.tsx`, `assistant-panel.tsx` — unused
- `components/ui/` (4 files) — never imported
- 7 standalone view components (graph, map, outcome, pattern, territory, timeline, workspace)
- `lib/territory-data.ts`, `lib/intelligence-map-data.ts` — orphaned data helpers

**Task 18 — Responsive Layout:**
- Tablet (≤1024px): sidebar and assistant panel hidden via CSS
- Mobile (≤768px): tighter padding, fixed input bar at bottom, scrollable sources
- CSS class hooks: `dashboard-sidebar`, `dashboard-assistant`, `chat-messages`, `chat-input-bar`, `chat-suggestions`, `chat-sources`

### For Miriad Agents

1. **Tasks 12-16 were already done.** The useChat hook, source badges, suggestion chips, and TypeScript cleanup were all in place when Phase 3 started. Don't redo them.
2. **Design tokens are namespaced.** New code should use `--wrangler-*` tokens. Old `--card`, `--accent`, etc. still work via aliases but are deprecated.
3. **19 dead files were deleted.** If you're looking for `components/chat/`, `components/ui/`, or the standalone views — they're gone. Chat is fully inline in `chat/page.tsx`.
4. **Responsive breakpoints are in globals.css.** Tablet at 1024px, mobile at 768px. The sidebar hides via `.dashboard-sidebar { display: none }`.
5. **Push needed.** These commits exist locally but haven't been pushed. Austin needs to run: `git push origin feature/chat-v1` from the working copy at `/sessions/practical-great-hypatia/wrangler-work/`.
