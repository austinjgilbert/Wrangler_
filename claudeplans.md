# Claude Code Plans

> **Read PLAN.md first.** This file contains specific tasks for Claude Code (Agent B).
> Miriad agents (Agent A) are handling Phase 1 (chat NDJSON wiring). You handle Phase 2+.
> **Do NOT modify files owned by Agent A** — see PLAN.md §3 for ownership boundaries.

---

## Phase 2: Make Chat the Home Screen + Navigation Links

**Priority:** HIGH — start immediately after Phase 1 lands
**Branch:** `feature/chat-v1`
**Always pull before starting:** `git pull --rebase origin feature/chat-v1`

### Task 2.1: Make Chat the Default Route

The app currently lands on `/overview`. Chat should be the home screen.

**Files to change:**
- `apps/operator-console/app/(dashboard)/layout.tsx` — Change the default redirect from `/overview` to `/chat`
- `apps/operator-console/app/page.tsx` — If this redirects to `/overview`, change to `/chat`
- `apps/operator-console/app/(dashboard)/layout.tsx` — In the `NAV` array, move Chat to the first position

**Verify:** When the app loads at `/`, it should show the chat page.

**Commit:** `feat(operator-console): make chat the default home screen`

---

### Task 2.2: Entity Links in Chat Responses

When the chat mentions an account, person, or signal, those mentions should be clickable links that navigate to the corresponding app page.

**How it works:**
1. The chat backend returns `sources` with each response, containing entity references like `"source": "account:acme-corp"` or `"source": "signal:signal-123"`
2. In the chat message rendering, detect entity patterns in the response text and wrap them in `<Link>` components
3. Account names → `/accounts/[id]`
4. Signal references → `/signals` (with filter)
5. Person names → future person detail page (for now, just bold them)

**Pattern matching approach:**
- The response text often contains patterns like "**Acme Corp**" or "Buc Ees" — these are account names
- Cross-reference with the `sources` array to find the entity ID
- Wrap matched text in Next.js `<Link href="/accounts/[id]">` components

**Files to create/modify:**
- `apps/operator-console/lib/entity-linker.ts` — Utility that takes response text + sources array, returns React nodes with links
- `apps/operator-console/app/(dashboard)/chat/page.tsx` — Use entity-linker in message rendering

**Commit:** `feat(operator-console): add entity navigation links in chat responses`

---

### Task 2.3: Suggestion Chips as Navigation

Follow-up suggestions from the chat can include navigation hints. When a suggestion starts with "View " or "Go to ", it should navigate instead of sending a message.

**Examples:**
- "View full Acme brief →" → navigate to `/accounts/acme-id`
- "Show all signals" → navigate to `/signals`
- "Tell me more about their tech stack" → send as chat message (normal)

**Files to modify:**
- `apps/operator-console/app/(dashboard)/chat/page.tsx` — In suggestion chip click handler, check if it's a navigation suggestion

**Commit:** `feat(operator-console): navigation-aware suggestion chips`

---

## Coordination Rules

1. **Do NOT modify these files** (Agent A owns them):
   - `apps/operator-console/lib/use-chat.ts` — Agent A is creating this
   - `apps/operator-console/app/api/chat/` — Agent A may create proxy routes here
   - `src/chat/` — chat backend
   - `sanity/plugins/` — Studio plugin

2. **You CAN modify:**
   - `apps/operator-console/app/(dashboard)/chat/page.tsx` — BUT wait for Agent A's Phase 1 commit first, then build on top
   - `apps/operator-console/app/(dashboard)/layout.tsx` — NAV order, default route
   - `apps/operator-console/app/page.tsx` — redirect target
   - `apps/operator-console/lib/entity-linker.ts` — new file, yours

3. **Before pushing:**
   ```bash
   git pull --rebase origin feature/chat-v1
   cd apps/operator-console && npx tsc --noEmit
   ```

4. **Wait for Phase 1 to land before starting Task 2.2 and 2.3** — Task 2.1 (default route) can start immediately since it only touches layout.tsx and page.tsx.
