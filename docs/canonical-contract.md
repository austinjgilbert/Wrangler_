# Canonical Contract

## Golden Path Contract

### UI Action Payload

Source: `AccountExplorer` gap/stage chip click.

```json
{
  "accountId": "account-ca9b477c3c25726c",
  "accountKey": "ca9b477c3c25726c",
  "canonicalUrl": "https://vercel.com",
  "requestedStages": ["initial_scan"]
}
```

Notes:
- `accountId` is always allowed so the worker can recover missing canonical data.
- `requestedStages` is only sent for real pipeline stage chips.
- Full-gap clicks omit `requestedStages`, which means full pipeline.

### Worker Queue Input

Endpoint: `POST /enrich/queue`

Accepted fields:
- `accountId?: string`
- `accountKey?: string`
- `canonicalUrl?: string`
- `url?: string`
- `stages?: string[]`
- `requestedStages?: string[]`

### Worker Job Shape

Stored as `_type: "enrichmentJob"`.

Key fields:
- `jobId`
- `accountKey`
- `canonicalUrl`
- `status`
- `currentStage`
- `completedStages`
- `failedStages`
- `results`
- `goalKey`

### Raw Research Result Shape

Produced by `buildCompleteResearchSet(job)`.

Key fields:
- `accountKey`
- `canonicalUrl`
- `pipelineJobId`
- `status`
- `scan`
- `discovery`
- `crawl`
- `evidence`
- `linkedin`
- `brief`
- `verification`
- `summary`

### Sanity Storage Shape

`accountPack.payload.researchSet`
- full raw pipeline result

`account`
- `profileCompleteness`
- `classification`
- `lastEnrichedAt`
- `technologies[]`
- `leadership[]`
- `painPoints[]`
- `benchmarks`
- `competitors[]`

### Query Shape For UI

Primary reader: `AccountExplorer` `useDocumentProjection()`

Expected fields:
- identity: `_id`, `companyName`, `name`, `canonicalUrl`, `domain`, `rootDomain`, `accountKey`
- progress: `profileCompleteness`, `opportunityScore`
- derived data: `classification`, `benchmarks`, `painPoints`
- linked entities: `leadership`, `crmContacts`, `technologies`, `competitors`, `signals`, `interactions`, `actionCandidates`, `evidencePacks`, `crawlSnapshots`

### UI Render Shape

The account detail screen renders:
- top-level summary cards from `account`
- enrichment chips from `profileCompleteness.gaps` and `profileCompleteness.nextStages`
- detailed sections from linked entities and derived account fields
