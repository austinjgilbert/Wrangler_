# Account stack-rank (bulk prioritization)

The worker can **stack-rank a large account list** one-by-one using intent and key insights, then return a prioritized list for focus.

## Endpoint

**POST** `/accounts/stack-rank`

Requires Sanity (`SANITY_PROJECT_ID`, `SANITY_TOKEN`). No auth beyond base env.

## Request body

| Field | Type | Description |
|-------|------|-------------|
| `accountKeys` | `string[]` | Explicit account keys to rank (from Sanity `account.accountKey`). |
| `domains` | `string[]` | Domains to resolve to accounts and rank (e.g. `["example.com", "acme.com"]`). |
| `limit` | `number` | When **neither** `accountKeys` nor `domains` is set: fetch this many accounts from Sanity (by `_updatedAt` desc). Default `50`. |
| `maxAccounts` | `number` | Cap total accounts processed per request (default `200`, max `500`). |
| `storeResult` | `boolean` | If `true`, store the ranked list in KV (requires `ACCOUNT_RANKING_KV` binding). Default `false`. |
| `listName` | `string` | Optional name for the list when `storeResult` is true. |

You must provide **one** of:

- `accountKeys` — rank these accounts.
- `domains` — resolve to accounts and rank.
- Neither — rank the most recently updated accounts in Sanity (up to `limit`).

## Scoring (intent and key insights)

Each account is scored using the same logic as the SDR good-morning flow:

- **Intent (0–3)** — Pricing/enterprise signals, migration/modernization, product usage, ICP fit.
- **Proximity (0–3)** — Economic buyer / technical owner / influencer (from linked person).
- **Freshness (0–2)** — Activity in last 7 days / 30 days.
- **Fit (0–2)** — Opportunity score, business scale, tech signals.
- **Conversation leverage (0–2)** — Contacts, LinkedIn, exec claims, team map, brief.

**Total** = sum of the five dimensions (max 12). Accounts are sorted by total descending, then returned with rank, breakdown, and a short “why now” reason.

## Response

```json
{
  "ok": true,
  "data": {
    "ranked": [
      {
        "rank": 1,
        "accountKey": "...",
        "companyName": "Acme Inc",
        "canonicalUrl": "https://acme.com",
        "total": 9,
        "breakdown": {
          "intent": 2,
          "proximity": 3,
          "freshness": 1,
          "fit": 2,
          "conversationLeverage": 1
        },
        "whyNow": "Active product evaluation (migration/modernization); Economic buyer or technical owner identified"
      }
    ],
    "total": 25,
    "stored": { "listId": "stack-rank-1234567890", "kvKey": "accountRanking:stack-rank-1234567890" }
  },
  "requestId": "..."
}
```

`stored` is only present when `storeResult: true` and `ACCOUNT_RANKING_KV` is configured.

## Using an Excel list of accounts

To stack-rank from an Excel file (e.g. "My Primary Named Accounts"):

1. **Deploy** the worker so `POST /accounts/stack-rank` is live:  
   `npm run deploy`
2. From the project root, run:  
   `npm run stack-rank-accounts`  
   or with an explicit path:  
   `node scripts/stack-rank-from-xlsx.mjs "/path/to/My Primary Named Accounts.xlsx"`  
   The script reads `.dev.vars` for `BASE_URL`, extracts domains from the first sheet (any column), and POSTs them to `/accounts/stack-rank`. Ranked output is printed and written to `stack-rank-result.json`.

## Examples

Rank by explicit account keys:

```bash
curl -X POST "https://website-scanner.austin-gilbert.workers.dev/accounts/stack-rank" \
  -H "Content-Type: application/json" \
  -d '{"accountKeys": ["abc123", "def456"], "maxAccounts": 100}'
```

Rank by domains:

```bash
curl -X POST "https://website-scanner.austin-gilbert.workers.dev/accounts/stack-rank" \
  -H "Content-Type: application/json" \
  -d '{"domains": ["example.com", "acme.com", "other.com"], "maxAccounts": 50}'
```

Rank the 100 most recently updated accounts (no list in body):

```bash
curl -X POST "https://website-scanner.austin-gilbert.workers.dev/accounts/stack-rank" \
  -H "Content-Type: application/json" \
  -d '{"limit": 100, "maxAccounts": 200}'
```

## Optional: persist rankings (KV)

To save the ranked list for later (e.g. for a “focus list” view):

1. Create a KV namespace:  
   `npx wrangler kv namespace create ACCOUNT_RANKING`
2. Add the binding in `wrangler.toml` under `kv_namespaces`:  
   `{ binding = "ACCOUNT_RANKING_KV", id = "<id>" }`
3. Send `storeResult: true` (and optionally `listName`) in the request body.

Stored entries use key `accountRanking:{listId}` and expire after 7 days (configurable in code).
