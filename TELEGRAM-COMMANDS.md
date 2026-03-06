# Telegram bot — complete command reference

Use these with your Molt Content OS bot. You can use **slash commands** or **natural language**; both do the same thing.

---

## Slash commands

| Command | Description | Example |
|--------|-------------|--------|
| `/start` | Welcome and command list | `/start` |
| `/help` | Full help (commands + phrases) | `/help` |
| `/status` | Worker and Sanity health | `/status` |
| `/account <domain>` | What we know about an account | `/account example.com` |
| `/enrich <domain>` | Queue enrichment for that domain | `/enrich example.com` |
| `/competitors <domain>` | Competitor research for company | `/competitors example.com` |
| `/compare <d1> <d2>` | Compare two accounts | `/compare a.com b.com` |
| `/people <domain>` | People/contacts at that company | `/people example.com` |
| `/tech <name>` | Accounts using this technology | `/tech React` |
| `/patterns` | Tech & pain point patterns from Sanity | `/patterns` |
| `/captures` | Recent extension captures | `/captures` |
| `/briefing` | Daily SDR briefing (good morning) | `/briefing` |
| `/jobs` | Recent enrichment jobs | `/jobs` |
| `/network` | Moltbook & network updates (what bots are doing) | `/network` |
| `/teach` | Research the network and explain what's on the cutting edge | `/teach` |
| `/trends` | Rising/falling themes in the network (last 7d vs 7–14d) | `/trends` |
| `/moltbook` | Moltbook feed (same as /network) | `/moltbook` |
| `/moltbook post <message>` | Post a message to Moltbook / the network | `/moltbook post Just enriched acme.com` |

---

## Inline buttons (after account or enrich)

When you ask about a **single account** (e.g. `/account example.com` or “what do we know about example.com”), the bot replies with two inline buttons:

- **📄 View account** — opens the account page in the browser.
- **⏳ Enrich** — runs enrichment for that domain (same as typing “enrich example.com”). The bot shows “typing…” then the enrichment result.

---

## Natural language (just say it)

Talk in plain language — the bot maps your message to the right action.

**Account / lookup**
- "What do we know about example.com" / "Look up Stripe" / "Tell me about acme.com"
- "Info on example.com" / "Details for X" / "Brief on example.com"
- "Can you look up example.com" / "Get me details on Stripe"
- Just a domain or company name: `example.com` or `Stripe` → account lookup

**Enrich**
- "Enrich example.com" / "Run enrichment on X" / "Update profile for example.com" / "Refresh example.com"

**Competitors**
- "Competitors of Acme" / "Who are example.com's competitors" / "Who competes with X" / "Rivals of X"

**Compare**
- "Compare a.com and b.com" / "a.com vs b.com" / "Difference between X and Y"

**People**
- "People at example.com" / "Leadership at X" / "Who works at X" / "Team at example.com" / "Contacts at X"

**Tech**
- "Accounts using React" / "Who uses Shopify" / "Which companies use React"

**Jobs**
- "Jobs" / "List jobs" / "Recent jobs" / "Enrichment jobs"

**Network / Moltbook (what the bots are doing)**
- "What's happening in the network" / "Moltbook updates" / "What are the bots doing"
- "Network insights" / "Latest from Moltbook" / "Any network updates"

**Understand the network (research / cutting edge)**
- "/teach" — bot researches Moltbook + stored insights and teaches you: themes, key takeaways, and how to go deeper
- "What's on the cutting edge" / "Teach me what the network knows" / "Explain the network" / "What is the network learning" / "Research the network"

**Network trends (crawl and learn)**
- "/trends" — rising and falling themes comparing last 7 days vs previous 7 days (data gathered by cron every 6h)
- "Network trends" / "What are the trends" / "Show me trends" / "What's trending in the network"

**Post to Moltbook**
- "/moltbook post &lt;message&gt;" — post to the network feed
- "Post to Moltbook: your message" / "Share with the network: ..." / "Moltbook post ..."

**Other**
- "Recent captures" / "What did we capture" / "Show me captures"
- "Good morning" / "Daily brief" / "What's my briefing"
- "Patterns" / "Show patterns"
- "Status" / "How are we doing" / "Are you there" / "Ping"
- "Help" / "What can you do" / "How does this work"

If the bot doesn’t understand, it will suggest example phrases.

---

## Register commands in Telegram (optional)

So the command list appears in the bot’s menu (next to the input):

```bash
TELEGRAM_BOT_TOKEN=your_token ./scripts/set-telegram-commands.sh
```

Or with curl (replace `YOUR_TOKEN`):

```bash
curl -X POST "https://api.telegram.org/botYOUR_TOKEN/setMyCommands" \
  -H "Content-Type: application/json" \
  -d '{"commands":[
    {"command":"start","description":"Start the bot"},
    {"command":"help","description":"List all commands"},
    {"command":"status","description":"System health"},
    {"command":"account","description":"Account summary (/account example.com)"},
    {"command":"enrich","description":"Run enrichment (/enrich example.com)"},
    {"command":"competitors","description":"Competitor research"},
    {"command":"compare","description":"Compare two accounts"},
    {"command":"people","description":"People at company"},
    {"command":"tech","description":"Accounts by tech (/tech React)"},
    {"command":"patterns","description":"Tech & pain patterns"},
    {"command":"captures","description":"Recent captures"},
    {"command":"briefing","description":"Daily SDR briefing"},
    {"command":"jobs","description":"Recent enrichment jobs"},
    {"command":"network","description":"Moltbook & network updates"}
  ]}'
```

---

## How research and enrichment work

- **Telegram** sends your message to the worker (`POST /webhooks/telegram`). The worker parses the intent (e.g. `/enrich example.com` → `enrich_account`).
- **Enrichment** (`/enrich` or “enrich example.com”): The worker ensures an **account** and **accountPack** exist in Sanity for that domain (creating stubs if needed), then **queues an enrichment job** and **kickstarts the first stage** (scan). A **cron** runs every 15 minutes (`/enrich/process`) to advance pipeline stages (discovery → crawl → extraction → brief → verification). Results are written into **Sanity** (account, accountPack, pattern matching, etc.).
- **Other commands** (e.g. `/account`, `/competitors`, `/people`) read from Sanity and/or run research once; results are returned in the chat and a “View” link points to the account page when relevant.
- **Network updates** (`/network` or “what’s happening in the network”): The bot fetches live activity from Moltbook (if `MOLTBOOK_BASE_URL` is set and the API exposes `/api/activity` or `/api/feed`), stores new posts in Sanity, and also returns recent stored community insights from the last 7 days. So the bot both learns from the network and brings those updates back when you ask.
- **Post to Moltbook** (`/moltbook post <message>` or "post to moltbook: ..."): The bot appends your message to the worker's Moltbook activity feed (KV). Other bots or the same bot via `/network` can see it. Requires `MOLTBOOK_ACTIVITY_KV` to be bound in wrangler.
- **Crawl and learn**: The worker runs **GET /moltbook/crawl** every 6 hours (cron). That fetches activity from Moltbook (KV or MOLTBOOK_BASE_URL) and stores it in Sanity as community posts. So the network is gathered automatically; use **/trends** to see rising/falling themes (last 7d vs 7–14d) and **/teach** for a cutting-edge summary.
- All replies are sent back to you in Telegram. The bot shows **“typing…”** while work runs, then a progress line, then “Done” and (when relevant) a view link. For single-account lookups or enrichments, **inline buttons** (View account, Enrich) are shown under the message.
- **Callback buttons**: Pressing **⏳ Enrich** sends a callback to the worker, which runs enrichment for that domain and replies in the same chat.

---

## Summary

- **17 slash commands** (including `start`, `help`, `jobs`, `network`, `teach`, `trends`, `moltbook` [feed/post], `status`) with optional args where needed.
- **Same intents** available via natural language (including “jobs”, “list jobs”, “recent jobs”).
- **Inline buttons** on single-account replies: View account (URL) and Enrich (callback).
- Use **TELEGRAM-BOT-SETUP.md** for webhook and token setup; use this file as the command reference.
