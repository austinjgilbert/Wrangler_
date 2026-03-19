# Data Pipeline Cleanup — Unified Normalization Layer

**Date:** 2026-03-19  
**Author:** @datanerd  
**Status:** Ready for integration

## Summary

A complete data quality audit and normalization pipeline that:
1. **Rejects garbage data** before it enters the system (IPs, stock tickers, state names, revenue buckets)
2. **Normalizes all field names** to a single canonical schema
3. **Adds timeseries buckets** (`eventDate`, `eventWeek`, `eventMonth`) to every entity for pattern recognition
4. **Unifies tech stack fields** (3 different representations → 1 canonical + 1 breakdown)
5. **Fixes LinkedIn URL casing** (`linkedInUrl` vs `linkedinUrl` → always `linkedinUrl`)
6. **Tracks data provenance** (every field knows where it came from)
7. **Eliminates normalizer drift** (Sanity scripts now import from shared module)

## Data Quality Audit Results

### primary-named-accounts.json

| Category | Count | % | Examples |
|----------|-------|---|----------|
| **Valid domains** | **320** | **66.0%** | hashicorp.com, disney.com |
| Stock tickers | 81 | 16.7% | nvda, pypl, sbux |
| Region names | 33 | 6.8% | california, texas, ontario |
| Generic words | 24 | 4.9% | count, total, website |
| IP addresses | 12 | 2.5% | 0.0.0.1 through 0.0.0.12 |
| Revenue buckets | 7 | 1.4% | $100m-$250m, $10b+ |
| Too short | 4 | 0.8% | a10, arc, gap |
| Bare TLDs | 4 | 0.8% | au, ca, in |

### Field Inconsistencies Fixed

| Issue | Before | After |
|-------|--------|-------|
| LinkedIn URL casing | `linkedInUrl` (some), `linkedinUrl` (others) | Always `linkedinUrl` |
| Tech stack fields | `techStack[]`, `technologyStack{}`, `technologies[]` | `techStack[]` + `techBreakdown{}` + `technologyRefs[]` |
| Account ID format | `account.{key}` or `account-{key}` | Always `account.{key}` |
| Display name fields | `name`, `companyName` (sometimes different) | `displayName` (single source) |
| Normalizer duplication | Copy-pasted OVERRIDES in 2 files | Single import from `shared/` |

## New Files

| File | Purpose |
|------|---------|
| `shared/canonical-schema.ts` | Single source of truth for all entity types |
| `shared/pipeline-normalizer.ts` | Master normalizer — every source flows through this |
| `scripts/audit-data-quality.ts` | Audit script with `--fix` flag |
| `data/primary-named-accounts-clean.json` | Cleaned account list (320 valid domains) |
| `data/data-quality-report.json` | Full audit report with breakdown |

## Integration Points

### 1. Chrome Extension Capture → Worker

In `src/routes/extension.ts`, wrap incoming data:

```typescript
import { normalizeBatch } from '../../shared/pipeline-normalizer.ts';

// Before storing:
const result = normalizeBatch({
  accounts: payload.accounts,
  people: payload.people,
  signals: payload.signals,
  origin: 'chrome_extension',
});

// Use result.accounts.accepted, result.people.accepted, etc.
// Log result.stats for monitoring
```

### 2. Enrichment Pipeline

In `src/services/enrichment-service.js`:

```typescript
import { normalizeAccount } from '../../shared/pipeline-normalizer.ts';

// Before storing enrichment results:
const normalized = normalizeAccount(enrichedData, 'enrichment_pipeline');
if (!normalized.valid) {
  console.warn('Enrichment produced invalid data:', normalized.issues);
  return;
}
// Store normalized.data
```

### 3. Signal Ingestion

In `src/lib/signalIngestion.ts`, the existing `normalizeSignal` function should delegate to the new pipeline normalizer for consistency:

```typescript
import { normalizeSignalEvent } from '../../shared/pipeline-normalizer.ts';

// The new normalizer adds timeseries buckets automatically
const result = normalizeSignalEvent(input, 'website_scan');
```

### 4. XLSX Import

In `scripts/upload-accounts-to-sanity.mjs`:

```typescript
import { normalizeAccount, isValidDomain } from '../shared/pipeline-normalizer.ts';

// Filter before upload:
const validAccounts = domains
  .filter(d => isValidDomain(d))
  .map(d => normalizeAccount({ domain: d }, 'xlsx_import'))
  .filter(r => r.valid)
  .map(r => r.data);
```

## Timeseries Pattern Recognition

Every entity now carries:

```typescript
{
  eventDate: "2026-03-19",      // Daily bucketing
  eventWeek: "2026-W12",        // Weekly trends
  eventMonth: "2026-03",        // Monthly patterns
  observedAt: "2026-03-19T...", // Exact timestamp
}
```

This enables queries like:
- "Signal volume by week for account X"
- "New accounts per month by source"
- "Decay curve of intent signals over time"
- "Pattern: accounts with 3+ signals in same week convert 2x"

## Running the Audit

```bash
# View report only
npx tsx scripts/audit-data-quality.ts

# Generate cleaned file
npx tsx scripts/audit-data-quality.ts --fix

# Normalize Sanity account names (dry run)
cd sanity && npx sanity exec scripts/normalize-account-names.ts --dry-run
```

## Next Steps

1. **Wire normalizer into ingest endpoints** (extension, wrangler, calls, molt)
2. **Backfill existing Sanity data** through the normalizer
3. **Add monitoring** for rejection rates (alert if > 10% of ingest is rejected)
4. **Build timeseries dashboard** using the new `eventDate`/`eventWeek`/`eventMonth` fields
