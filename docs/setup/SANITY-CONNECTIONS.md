# Sanity CMS connection

The worker uses **Sanity** as the content lake for account/context recall, storage, and OSINT data. All Sanity access goes through `src/sanity-client.js`.

## Required environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SANITY_PROJECT_ID` | Yes | Sanity project ID (e.g. from sanity.io project settings). |
| `SANITY_TOKEN` or `SANITY_API_TOKEN` | Yes | API token with read/write access to the dataset. |
| `SANITY_DATASET` | No | Dataset name; default `production`. |
| `SANITY_API_VERSION` | No | API version; default `2023-10-01`. |

Set secrets in production with (required for the deployed worker to use Sanity):

```bash
wrangler secret put SANITY_PROJECT_ID
wrangler secret put SANITY_TOKEN
```

If you deploy with `wrangler deploy` and do not set these secrets, the worker will run but content lake and Sanity-dependent endpoints will report Sanity as not configured or unreachable.

For local dev, put the same keys in `.dev.vars` (not committed).

## Checking the connection

- **Health**  
  `GET /health` includes `dependencies.sanity.configured` and `dependencies.sanity.reachable`. Both use `sanity-client.js`.

- **Sanity-only status**  
  `GET /sanity/status` returns:
  - `configured` – env vars present
  - `reachable` – GROQ test query succeeded
  - `projectId` – masked (`***`)
  - `dataset` – dataset name

- **Local script**  
  From the **project root** (the folder that contains `package.json` and `wrangler.toml`):
  ```bash
  cd /path/to/website-scanner-worker   # or cd ~/website-scanner-worker
  npm run sanity:check
  ```
  Or: `node scripts/check-sanity.js` (must be run from project root).  
  Loads `.dev.vars` and runs the same GROQ check as the worker. Exit 0 = reachable, non‑zero = not configured or unreachable.

## Test token with curl (debug 401)

If `sanity:check` returns 401, test the token outside the app. From project root (token and project ID from `.dev.vars`):

```bash
# Replace YOUR_TOKEN and kvxbss3j if different
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  "https://kvxbss3j.api.sanity.io/v2023-10-01/data/query/production?query=count(*[])"
```

- **200** → token is valid; the issue may be how `.dev.vars` is read (e.g. truncation, wrong variable name).
- **401** → token is invalid: create a new token in [Sanity Manage](https://www.sanity.io/manage) → project **kvxbss3j** → API → Tokens (use the copy button, put it on one line in `.dev.vars`). If the project is under an organization, open the project from the org and create the token there.

## Building your database

Sanity is the **single source of truth** for your account/context database. To have it always work:

1. **Use production secrets**  
   Set `SANITY_PROJECT_ID` and `SANITY_TOKEN` with `wrangler secret put ... --env=""`. The deployed worker uses these; local `.dev.vars` is for dev only.

2. **Confirm connection before heavy use**  
   - `GET /health` → `dependencies.sanity.configured` and `dependencies.sanity.reachable` both `true`  
   - `GET /sanity/status` → `configured: true`, `reachable: true`  
   - `POST /sanity/verify-write` → `ok: true`, `wrote: true` (confirms mutations work)

3. **How the worker fills the dataset**  
   All writes use `src/sanity-client.js` (with retry). Key flows:
   - **Scan + store:** `GET /scan?url=...` (and optional store), or `POST /store/scan` with body  
   - **Context/recall:** `POST /query` with `type: "context"` reads and can trigger enrichment  
   - **Store:** `POST /store/scan`, `POST /store/brief`, `POST /store/evidence`, `POST /store/linkedin`, etc.  
   - **OSINT, enrichment, interactions:** their handlers write via sanity-client

4. **Reliability**  
   GROQ and mutations in `sanity-client.js` use `retrySanityOperation` (exponential backoff). All `storeAccountPack` and store flows now go through sanity-client so transient Sanity errors are retried.

## Single implementation

Connection checks and all Sanity calls should use `src/sanity-client.js`:

- `initSanityClient(env)` – build client config (or `null` if not configured)
- `assertSanityConfigured(env)` – throw if not configured
- `groqQuery(client, query, params)` – run GROQ (with retry)
- Document helpers: `upsertDocument`, `patchDocument`, `getDocument`, `storeAccountPack`, etc.

The worker’s `/health` and `/sanity/status` handlers import these from `sanity-client.js` so there is a single place for connectivity and query behavior.

## Sanity systems and pattern matching

These systems consume Sanity data and maximize pattern matching from account briefs, tech stack, people, and goals:

| System | Sanity data used | How it helps pattern matching |
|--------|------------------|-------------------------------|
| **Context retrieval** (`GET /query?type=context`) | `account` (signals, tech stack, scores), `accountPack.payload` (scan, researchSet, brief) | `buildContextSummary` and `getAccountIntelligenceForContext` surface opportunity score, CMS/frameworks, signals, research summary, key facts, and brief so GPT/recall get full account intelligence. |
| **Learning / suggestions** (`POST /learn/suggest`) | Interactions, learnings, account context | `extractQueryPatterns` and `matchHistoricalPatterns` use account context (domain, tech mentions); passing `accountKey`/account context improves suggestions. |
| **Similar accounts** (`quickFindSimilarAccounts`) | `account.signals`, `account.technologyStack.cms`, `account.aiReadiness.score` | Pattern matching for “accounts like this one”; richer scan + enrichment data on the account document improves similarity. |
| **Enrichment pipeline** | Writes `accountPack.payload.researchSet` (scan, discovery, crawl, evidence, brief, verification) and `enrichmentCompletedAt` | Full research pipeline fills tech stack, people, goals, and brief; context retrieval then surfaces them. Cron `*/15 * * * *` runs `POST /enrich/process` to advance jobs. |
| **Scan auto-store** | Writes `account` and `accountPack` from `GET /scan?url=...` | Ensures account exists and gets technologyStack/signals so context and similar-accounts have data. |

**To maximize pattern matching:**

1. **Ensure accounts exist and are scanned** – Use `GET /scan?url=https://example.com` (and optional store) so `account` has technologyStack, signals, opportunityScore.
2. **Trigger enrichment** – Use `GET /query?type=context&domain=example.com` or `POST /enrich/queue` with `canonicalUrl`; cron or manual `POST /enrich/process` runs the research pipeline and fills `accountPack.payload.researchSet` (brief, key facts, evidence).
3. **Use context in conversations** – Call `GET /query?type=context&domain=...` (or with `accountKey`) so GPT gets the stored account intelligence and learnings.
4. **Single source of truth** – All reads/writes go through `sanity-client.js`; GROQ single-value results are normalized in context-retrieval, enrichment-service, and sanity-quick-query so `[0]` queries behave correctly.
