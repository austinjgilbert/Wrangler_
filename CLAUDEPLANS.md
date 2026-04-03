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

