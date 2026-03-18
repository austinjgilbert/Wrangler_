# Validation Report

## Golden Entity

- Account: `Vercel`
- Account ID: `account-ca9b477c3c25726c`
- Account Key: `ca9b477c3c25726c`
- Canonical URL: `https://vercel.com`

## Current Proof

- Confirmed the account exists in real snapshot data.
- Confirmed the account detail payload shows incomplete but real Sanity-backed data.
- Reproduced the real `/enrich/queue` failure and captured the exact `500` response body.
- Confirmed the initial root cause was Sanity document quota exhaustion, not a fake frontend error.
- Patched the primary UI trigger and worker status progression path.
- Queued a real full enrichment run for `Vercel` and observed stage progression through:
  - `initial_scan`
  - `discovery`
  - `crawl`
  - `extraction`
  - `linkedin`
  - `brief`
  - `verification`
- Confirmed `/enrich/status?accountKey=ca9b477c3c25726c&advance=1` returned `complete`.
- Confirmed `accountPack-ca9b477c3c25726c` now has `payload.researchSet` with summary data (`pagesDiscovered: 20`, `pagesCrawled: 10`, `evidencePacks: 10`, `hasBrief: true`).
- Confirmed the `account` document updated with:
  - `lastEnrichedAt`
  - `profileCompleteness.score: 71`
  - `profileCompleteness.dimensionFlags.scan: true`
  - `profileCompleteness.dimensionFlags.brief: true`
  - `profileCompleteness.dimensionFlags.verification: true`
  - linked `technologies`: `Vercel`, `Cloudflare`

## Remaining Validation Steps

- Remove the final referenced legacy `enrich.job` records that still keep fresh job creation brittle for untouched entities like `sanity.io`.
- Re-run the same click path on a second fresh account once those legacy references are removed.
