# Website Scanner Worker

> Production-ready Cloudflare Worker for website intelligence, tech stack detection, and account research.

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare)](https://workers.cloudflare.com)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

This repo is **worker + dashboard together**: the Cloudflare Worker (API) and the Operator Console (Next.js UI) live in one place. Run both for the full stack.

| Part | Location | Run command |
|------|----------|--------------|
| **Worker (API)** | project root | `npm run dev` → http://localhost:8787 |
| **Dashboard (UI)** | `apps/operator-console/` | `npm run console:dev` → http://localhost:3000 |

The dashboard proxies API requests to the worker; point it at your worker URL (see [apps/operator-console/README.md](apps/operator-console/README.md)).

## Deploy in minimal clicks (new users)

**Prerequisites:** Node.js 18+ and a [Cloudflare account](https://dash.cloudflare.com/sign-up).

```bash
git clone https://github.com/YOUR_USERNAME/website-scanner-worker.git
cd website-scanner-worker
npm run setup
```

Then:

1. **Check dependencies:** `npm run check-deps` — fixes any missing tools.
2. **Configure:** Copy `.dev.vars.example` to `.dev.vars` and set `SANITY_PROJECT_ID`, `SANITY_TOKEN`. Full list: [.env.example](.env.example).
3. **Cloudflare login:** `npx wrangler login`
4. **Run locally:** `npm run dev` → http://localhost:8787
5. **Deploy:** `npm run deploy` — set production secrets with `wrangler secret put SANITY_PROJECT_ID --env=production` (and `SANITY_TOKEN`, etc.) before or after first deploy.

Optional: [Chrome extension](CHROME-EXTENSION-SETUP.md), [Telegram bot](TELEGRAM-BOT-SETUP.md), [Custom GPT](CUSTOM-GPT-UPDATE.md). Full details: [SETUP.md](SETUP.md).

### Run the full stack (worker + dashboard)

One repo, two processes:

```bash
# Terminal 1: Worker API
npm run dev
# → http://localhost:8787

# Terminal 2: Operator Console (UI)
npm run console:dev
# → http://localhost:3000
```

Open http://localhost:3000 — the dashboard talks to the worker at 8787 by default (see `apps/operator-console/lib/server-proxy.ts` and `WORKER_BASE_URL`).

### Deploy worker + dashboard (Cloudflare + Vercel)

- **Worker:** `npm run deploy` (Cloudflare). See [SETUP.md](SETUP.md) and `wrangler secret put`.
- **Dashboard:** Deploy `apps/operator-console` to [Vercel](https://vercel.com) with **Root Directory** = `apps/operator-console`, and set **NEXT_PUBLIC_API_URL** to your worker URL (e.g. `https://website-scanner.<your-subdomain>.workers.dev`).  
  Full steps: [docs/DEPLOY-WORKER-AND-DASHBOARD.md](docs/DEPLOY-WORKER-AND-DASHBOARD.md).

### Production URL and custom domain (open source / self-hosted)

By default the worker is served at **`https://<your-worker-name>.<your-subdomain>.workers.dev`** (e.g. `https://website-scanner.austin-gilbert.workers.dev`). You can use this URL for:

- **Telegram webhook:** `https://<your-worker-url>/webhooks/telegram`
- **API base:** All endpoints live under this origin. No custom domain required.

If you control a domain and its **nameservers** (e.g. you own the domain at the registrar), you can attach a custom domain (e.g. `api.yourproject.com`): in `wrangler.toml` under `[env.production]` uncomment the `[env.production.route]` block and set `pattern` and `zone_name`, then set `BASE_URL` / `MOLT_TOOL_BASE_URL` / `MOLTBOOK_BASE_URL` to that origin. For domains you don’t control (e.g. community-owned like miriad.systems), use the workers.dev URL.

## Overview

A comprehensive website scanning and research API built on Cloudflare Workers. Provides tech stack detection, business intelligence, LinkedIn profile analysis, and seamless integration with Sanity CMS for data persistence.

### Key Features

- 🔍 **Website Scanning**: Tech stack detection, performance analysis, business unit identification
- 📊 **Business Intelligence**: AI readiness scoring, opportunity analysis, peer comparison
- 🔗 **LinkedIn Integration**: Profile scraping with work pattern analysis
- 💾 **Sanity CMS Integration**: Automatic data persistence and querying
- 🚀 **Research Tools**: Web search, site discovery, crawling, evidence extraction
- 🎯 **OSINT Pipeline**: Year-ahead company intelligence with timeline tracking and industry benchmarking
- 🏢 **Competitor Research**: Automated competitor discovery and comparative analysis
- 📈 **Account Enrichment**: Multi-stage enrichment pipeline for comprehensive account intelligence
- 🧠 **Learning & Insights**: Job posting analysis and learning extraction
- 🧩 **Intelligence Memory System**: Context-aware briefs with "we said this last time" functionality
- ⚡ **High Performance**: Optimized for Cloudflare Workers with concurrency control
- 🔒 **Security**: SSRF protection, input validation, CORS handling
- 📎 **Chrome extension**: Capture pages from the browser and send to the worker for enrichment (see [CHROME-EXTENSION-SETUP.md](CHROME-EXTENSION-SETUP.md))

## Architecture

```
├── apps/operator-console/   # Dashboard (Next.js) — npm run console:dev
├── src/                     # Worker
│   ├── index.js             # Main router + queue consumer
│   ├── config/
│   ├── utils/
│   ├── services/
│   ├── osint/
│   ├── durable/
│   └── handlers/            # /scan, /scan-batch, OSINT, etc.
└── wrangler.toml
```

## Quick Start

**→ Full setup and update steps:** [SETUP.md](SETUP.md) and [CUSTOM-GPT-UPDATE.md](CUSTOM-GPT-UPDATE.md) — first-time setup, local dev, deploy, and updating the Custom GPT after changes.

### Prerequisites

- Node.js 18+ and npm
- Cloudflare account
- Wrangler is installed automatically via `npm run setup` (devDependency); or use `npx wrangler`

### Installation

```bash
# Clone and one-command setup
git clone https://github.com/YOUR_USERNAME/website-scanner-worker.git
cd website-scanner-worker
npm run setup

# Verify environment (optional)
npm run check-deps

# Copy .dev.vars.example to .dev.vars and set SANITY_PROJECT_ID, SANITY_TOKEN (see .env.example for full list)
# Setup creates .dev.vars from .dev.vars.example if missing.

# Authenticate with Cloudflare
npx wrangler login
```

### Configuration

Set required environment variables:

```bash
# Sanity CMS (optional but recommended for content lake)
wrangler secret put SANITY_PROJECT_ID --env=""
wrangler secret put SANITY_TOKEN --env=""
wrangler secret put SANITY_DATASET  # Optional, defaults to "production"
wrangler secret put SANITY_API_VERSION  # Optional, defaults to "2023-10-01"

# Admin token for write operations (optional)
wrangler secret put ADMIN_TOKEN
wrangler secret put ADMIN_API_KEY  # Optional, for /osint/run endpoint

# OSINT Configuration (optional)
wrangler secret put OSINT_DEFAULT_RECENCY_DAYS  # Optional, defaults to 365
wrangler secret put OSINT_MAX_SOURCES  # Optional, defaults to 25
wrangler secret put OSINT_MAX_EXTRACT  # Optional, defaults to 15
wrangler secret put OSINT_YEAR  # Optional, defaults to current year + 1
```

### Queue and Durable Object Setup

The OSINT pipeline requires Cloudflare Queues and Durable Objects:

```bash
# Create the OSINT queue
wrangler queues create osint-queue

# The Durable Object will be created automatically on first deploy
# Make sure wrangler.toml includes the bindings (already configured)
```

### Development

```bash
# Start local development server
npm run dev

# Deploy to Cloudflare
npm run deploy
```

## API Endpoints

### Core Scanning

- `GET /scan?url=<url>` - Scan a single website
- `GET /scan-batch?urls=<url1,url2,...>` - Batch scan multiple websites

### Research & Extraction

- `POST /extract` - Extract structured evidence pack
- `POST /search` - Web search with ranking
- `POST /discover` - Discover pages on a website
- `POST /crawl` - Crawl discovered pages
- `POST /brief` - Generate research brief
- `POST /verify` - Verify claims against sources

### LinkedIn

- `POST /linkedin-profile` - Scan LinkedIn profile

### Sanity CMS

- `POST /store/{type}` - Store data (scan, linkedin, evidence, brief, person, account, interaction, session, learning)
- `GET /query?type=companies|search|context|quick` - Query stored data or retrieve context
- `POST /query` - Execute custom GROQ query
- `PUT /update/{docId}` - Update document
- `DELETE /delete/{docId}` - Delete document

### Intelligence Memory System

- `GET /query?type=context&contextType=summary|interactions|learnings|followUps` - Retrieve context for GPT
- `POST /store/interaction` - Store Q&A exchange with GPT
- `POST /store/session` - Create or retrieve conversation session
- `POST /store/learning` - Derive and store insights from interactions

**Context Retrieval:**
- `GET /query?type=context&accountKey=xxx&contextType=summary` - Get context summary
- `GET /query?type=context&domain=example.com&contextType=interactions` - Get recent interactions
- `GET /query?type=context&tags=Acme Corp,Q1 FY26&contextType=learnings` - Get relevant learnings

### OSINT (Year-Ahead Intelligence)

- `POST /osint/queue` - Queue an OSINT job for year-ahead company intelligence (rolling 12-month look-ahead)
- `GET /osint/status?accountKey=...` - Get OSINT job status
- `GET /osint/report?accountKey=...` - Get generated OSINT report with timeline tracking and benchmarking
- `POST /osint/run` - Run OSINT pipeline synchronously (admin/debug)

### Competitor Research

- `POST /competitors/research` - Research competitors for a given account
- `GET /competitors/research?accountKey=...` - Get competitor research results
- `GET /competitors/opportunities` - Get prospecting opportunities based on competitor analysis

### Account Enrichment

- `POST /enrich/queue` - Queue an enrichment job for an account
- `GET /enrich/status?accountKey=...` - Get enrichment job status
- `GET /enrich/research?accountKey=...` - Get enrichment research set
- `POST /enrich/execute` - Execute a specific enrichment stage
- `GET /enrich/jobs` - List all enrichment jobs

### Account Intelligence

- `GET /research/intelligence?accountKey=...` - Get comprehensive account intelligence

### Learning & Insights

- `POST /learning/analyze` - Analyze job postings and extract insights
- `GET /learning/insights?accountKey=...` - Get learning insights for an account

### Utility

- `GET /health` - Health check
- `GET /schema` - API documentation
- `GET /cache/status?url=<url>` - Cache status

See [docs/api/endpoints.md](docs/api/endpoints.md) for detailed API documentation.

## Usage Examples

### Scan a Website

```bash
curl "https://website-scanner.austin-gilbert.workers.dev/scan?url=https://example.com"
```

### Store Scan Results in Sanity

```bash
curl -X POST "https://website-scanner.austin-gilbert.workers.dev/store/scan" \
  -H "Content-Type: application/json" \
  -d '{
    "account": {
      "companyName": "Example Inc",
      "canonicalUrl": "https://example.com"
    },
    "data": { /* scan result */ }
  }'
```

### Generate Research Brief

```bash
curl -X POST "https://website-scanner.austin-gilbert.workers.dev/brief" \
  -H "Content-Type: application/json" \
  -d '{
    "companyOrSite": "Example Inc",
    "seedUrl": "https://example.com"
  }'
```

**Note**: Brief generation automatically includes context from previous interactions (see Intelligence Memory System below).

### Generate Person Brief with Context

```bash
curl -X POST "https://website-scanner.austin-gilbert.workers.dev/person/brief" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "companyName": "Example Inc",
    "profileUrl": "https://linkedin.com/in/johndoe"
  }'
```

The response includes `previousContext` and `previousInteractions` fields for GPT to reference ("we said this last time").

### Queue OSINT Year-Ahead Intelligence

```bash
# Queue an OSINT job (rolling 12-month look-ahead)
curl -X POST "https://website-scanner.austin-gilbert.workers.dev/osint/queue" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "companyName": "Example Inc",
    "recencyDays": 365
  }'

# Check job status
curl "https://website-scanner.austin-gilbert.workers.dev/osint/status?accountKey=example.com"

# Get the report once complete (includes timeline tracking and benchmarking)
curl "https://website-scanner.austin-gilbert.workers.dev/osint/report?accountKey=example.com"
```

## Integration with ChatGPT

This Worker is designed to work with ChatGPT Custom GPT Actions. See [gpt-instructions.md](gpt-instructions.md) for GPT behavior and [CUSTOM-GPT-UPDATE.md](CUSTOM-GPT-UPDATE.md) for how to update the Custom GPT after API or code changes.

### OpenAPI Schema

**Custom GPT (30-operation limit):** Use **`openapi-gpt.yaml`** when configuring your Custom GPT Actions. It contains exactly 30 operations. The full `openapi.yaml` exceeds ChatGPT’s limit.

**Full API docs:** The worker serves the complete schema at `GET /openapi.yaml` (from `openapi.yaml`). Use it for reference or other tools.

Update the `servers` URL in the schema to your deployment if needed:

```yaml
servers:
  - url: https://your-worker.your-subdomain.workers.dev
```

## Development

### Project Structure

- `src/` - Source code (modular architecture)
- `docs/` - Documentation
- `tests/` - Test files
- `scripts/` - Utility scripts
- `schemas/` - Sanity schema definitions

### Code Style

- ES6+ JavaScript (ES modules)
- JSDoc comments for type hints
- Consistent error handling
- Comprehensive input validation

### Testing

```bash
# Run tests
npm test

# Test specific endpoint
curl http://localhost:8787/health
```

## Intelligence Memory System

The Intelligence Memory System enables GPT (WRANGLER) to reference past conversations, learnings, and context when generating briefs and responses. This creates a "we said this last time" functionality that makes interactions more context-aware and valuable over time.

### Core Components

- **Interaction**: Captures every Q&A exchange between user and GPT
- **Session**: Groups multiple interactions into one continuous conversation
- **Learning**: Derived insights and takeaways from interactions

### Automatic Context Retrieval

When generating person briefs, the system automatically:
1. Retrieves context for the account (previous interactions, learnings, follow-ups)
2. Includes context in brief output (`previousContext`, `previousInteractions`)
3. Enables GPT to reference past decisions and learnings

### Manual Context Retrieval

```bash
# Get context summary for an account
curl "https://website-scanner.austin-gilbert.workers.dev/query?type=context&contextType=summary&accountKey=account-abc123"

# Get recent interactions
curl "https://website-scanner.austin-gilbert.workers.dev/query?type=context&contextType=interactions&accountKey=account-abc123&contextLimit=5"

# Get relevant learnings
curl "https://website-scanner.austin-gilbert.workers.dev/query?type=context&contextType=learnings&accountKey=account-abc123&minRelevanceScore=0.8"

# Get unresolved follow-ups
curl "https://website-scanner.austin-gilbert.workers.dev/query?type=context&contextType=followUps&accountKey=account-abc123"
```

### Store Interaction

```bash
curl -X POST "https://website-scanner.austin-gilbert.workers.dev/store/interaction" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "userPrompt": "Generate a person brief for John Doe at Acme Corp",
      "gptResponse": "Here is the brief for John Doe...",
      "sessionId": "session-123",
      "referencedAccounts": ["account-abc123"],
      "contextTags": ["Acme Corp", "Q1 FY26"],
      "importance": 0.8
    }
  }'
```

### Store Learning

```bash
curl -X POST "https://website-scanner.austin-gilbert.workers.dev/store/learning" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "title": "Acme Corp prefers modern tech stack",
      "summary": "Based on our conversation, Acme Corp shows strong preference for modern, cloud-native solutions.",
      "derivedFrom": ["interaction-abc123"],
      "applicableToAccounts": ["account-abc123"],
      "relevanceScore": 0.9,
      "contextTags": ["Acme Corp", "Tech Stack"],
      "memoryPhrase": "Acme prefers modern tech"
    }
  }'
```

### Usage in GPT

GPT can now reference past context in responses:

```
Based on our previous conversation about Acme Corp (see interaction from Jan 15),
we noted that they prefer modern tech stacks over legacy systems. 

Given this context, I recommend focusing on their cloud-native transformation
initiative rather than legacy modernization, which aligns with their stated
preferences.

Last time, we said: "Acme Corp's CTO John Doe emphasized the importance of
modern, scalable infrastructure for their growth plans."
```

For detailed examples and best practices, see [Intelligence Memory System Examples](docs/INTELLIGENCE-MEMORY-EXAMPLES.md).

## OSINT Pipeline

The OSINT (Open Source Intelligence) pipeline automatically generates year-ahead company intelligence reports. It runs asynchronously via Cloudflare Queues and tracks job state using Durable Objects.

### Pipeline Stages

1. **Stage 0**: Load or create account context in Sanity
2. **Stage 1**: Discover pages on the company website
3. **Stage 1.5**: Crawl common pages (investor relations, sustainability, etc.) and extract insights
4. **Stage 2**: Search web for company news, roadmaps, and initiatives (rolling 12-month look-ahead)
5. **Stage 3**: Select top sources using ranking algorithm
6. **Stage 4**: Extract evidence from top sources
7. **Stage 5**: Optional verification of top claims
8. **Stage 6**: Synthesize year-ahead report with:
   - Initiatives with timeline tracking (compare with historical 12-month data)
   - Industry and competitor benchmarking
   - Timeline analysis (completion rates, status changes)
   - Executive summary with benchmarking insights
9. **Stage 7**: Store results in Sanity (osintJob and osintReport documents)

### Ranking Algorithm

Sources are scored using:
- **Recency boost**: <= 90 days (100), <= 180 days (70), <= 365 days (40)
- **First-party boost**: +30 for sources from the company's own domain
- **Numeric/timeline boost**: +5-20 for content containing dates, years, roadmap keywords
- **Quality score**: Penalizes spammy hosts, rewards substantial content
- **Corroboration boost**: +3-15 per additional source mentioning the same initiative

Initiatives are scored by:
- Evidence count (up to +20)
- Multi-source corroboration (up to +15)
- First-party evidence presence (up to +15)

### Report Structure

Each OSINT report includes:
- **Executive Summary**: High-level overview with benchmarking insights
- **Initiatives**: Ranked list of company initiatives with:
  - Importance score (0-100)
  - Confidence level (low/medium/high)
  - Time horizon (0-3mo, 3-12mo, 12mo+)
  - Status (happening, being_decided, needing_execution, historical)
  - Progress percentage (for active initiatives)
  - Expected completion date
  - Evidence citations
- **Historical Initiatives**: Initiatives from 12 months ago for comparison
- **Timeline Analysis**: Progress tracking, completion rates, and status changes
- **Industry Benchmarking**: 
  - Industry averages (initiative count, completion rate)
  - Competitor benchmarks (top 10 competitors)
  - Company position relative to industry
  - Common industry goals and trends
  - Actionable insights
- **Risks**: Identified challenges or concerns
- **Hiring Signals**: Job postings and recruitment indicators
- **Digital Signals**: Technology transformation indicators
- **Page Insights**: Insights from crawled common pages (investor, sustainability, etc.)
- **Recommended Next Steps**: Actionable recommendations based on timeline and benchmarking

### Idempotency

Jobs are idempotent per `accountKey + mode + dateRange`. If a complete report exists for the current rolling 12-month period, `/osint/queue` will return the existing job unless `force: true` is specified.

### Timeline Tracking

The OSINT system tracks initiative progress over time:
- **Historical Comparison**: Compares current initiatives with those from 12 months ago
- **Status Detection**: Determines if initiatives are completed, in-progress, delayed, or cancelled
- **Progress Tracking**: Monitors completion rates and identifies new/delayed initiatives
- **Timeline Analysis**: Provides insights into execution capabilities and initiative lifecycle

### Industry Benchmarking

The OSINT report includes comprehensive benchmarking:
- **Industry Averages**: Calculates average initiative count, completion rate, and in-progress count from competitor reports
- **Competitor Benchmarks**: Compares top 10 competitors across key metrics
- **Company Position**: Ranks the company relative to competitors and industry
- **Common Goals**: Identifies industry-standard goals and trends
- **Actionable Insights**: Provides recommendations based on benchmarking data

## Performance

- **Concurrency**: Controlled via `mapWithConcurrency`
- **Timeouts**: All fetch operations have timeouts
- **Memory**: HTML size limits (250KB default)
- **Caching**: KV-based caching with 24h TTL
- **Batch Limits**: Configurable to prevent resource exhaustion
- **Queue Processing**: OSINT jobs process asynchronously with retry on failure

## Security

- ✅ SSRF protection (blocks localhost, private IPs)
- ✅ URL validation and sanitization
- ✅ CORS headers configured
- ✅ Input size limits
- ✅ Admin token for write operations (optional)

## Repository and CI

- **GitHub:** Clone or fork from your repo. Push via HTTPS (use a [Personal Access Token](https://github.com/settings/tokens) with **repo** + **workflow** scopes) or SSH — see [GITHUB-PUSH.md](GITHUB-PUSH.md).
- **CI (optional):** Pushes to `main` run tests; deploy to Cloudflare runs if repo secrets are set. To enable deploy from GitHub Actions, add **Settings → Secrets and variables → Actions**:
  - `CLOUDFLARE_API_TOKEN` — Cloudflare API token (with Workers permissions)
  - `CLOUDFLARE_ACCOUNT_ID` — Your Cloudflare account ID  
  Then pushes to `main` will run tests and deploy with `wrangler deploy --env=production`. Health check workflow runs every 30 minutes if configured.

## Deployment

### Cloudflare Workers

```bash
# Deploy to production (default for this project)
npm run deploy

# Deploy default env only
npm run deploy:default
```

Production URL: **https://website-scanner.austin-gilbert.workers.dev**

### Environment Variables

All secrets are managed via `wrangler secret put`. Use `--env=""` for the default environment, e.g. `wrangler secret put SANITY_TOKEN --env=""`. See [SANITY-CONNECTIONS.md](SANITY-CONNECTIONS.md) and [docs/SANITY-SETUP.md](docs/SANITY-SETUP.md) for Sanity setup.

### Telegram Bot (Optional)

Free agentic control layer via Telegram:

1. **Create a bot**: Message [@BotFather](https://t.me/BotFather) on Telegram → `/newbot` → follow prompts → copy the token.
2. **Set secret**: `wrangler secret put TELEGRAM_BOT_TOKEN` (paste the token).
3. **Set webhook** (replace `YOUR_TOKEN` and `YOUR_WORKER_URL`):
   ```bash
   curl "https://api.telegram.org/botYOUR_TOKEN/setWebhook" \
     -d "url=https://website-scanner.austin-gilbert.workers.dev/webhooks/telegram"
   ```
4. **Message the bot** on Telegram with commands or natural language.

**Commands:** `/start` `/help` `/patterns` `/status`

**Natural language (just say it):**
- "what do we know about example.com" — account summary
- "enrich fleetfeet.com" — run enrichment
- "competitors of Acme" — competitor research
- "compare X and Y" — side-by-side comparison
- "accounts using React" — tech lookup
- "people at example.com" — leadership / contacts
- "patterns" — tech & pain point correlations
- "good morning" — daily SDR briefing
- "recent captures" — latest extension captures

## Documentation

- [**CUSTOM-GPT-UPDATE.md**](CUSTOM-GPT-UPDATE.md) - Update Custom GPT schema and instructions
- [**SETUP.md**](SETUP.md) - Get everything working: setup, deploy
- [**PROJECT-STATUS.md**](PROJECT-STATUS.md) - What’s connected (GitHub, worker, Sanity, CI)
- [**GITHUB-PUSH.md**](GITHUB-PUSH.md) - Push to GitHub (PAT, workflow scope)
- [API Reference](docs/api/)
- [Intelligence Memory System Examples](docs/INTELLIGENCE-MEMORY-EXAMPLES.md) - Usage examples and best practices
- [Sanity Setup Guide](docs/SANITY-SETUP.md) - Sanity CMS configuration
- [Sanity Connections](SANITY-CONNECTIONS.md) - Env vars and connection checks
- [GPT Instructions](gpt-instructions.md) - ChatGPT integration guide
- [Architecture](docs/development/architecture.md) - System architecture (if exists)
- [Deployment Guide](docs/deployment/setup.md) - Deployment instructions (if exists)
- [Development Guide](docs/development/contributing.md) - Development guide (if exists)

## Contributing

1. Follow the existing code structure
2. Add JSDoc comments for new functions
3. Update tests for new features
4. Update documentation

## License

MIT

## Support

For issues and questions, please open an issue on the repository.

---

**Built with ❤️ using Cloudflare Workers**
