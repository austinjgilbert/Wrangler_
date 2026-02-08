# Cursor Build Instructions: Website Scanner Worker Improvements

## System Overview

This is a **Cloudflare Worker** that provides comprehensive website intelligence and research capabilities:

### Core Capabilities
1. **Website Scanning**: Tech stack detection, performance analysis, business intelligence
2. **Account Research**: Complete research pipelines with enrichment
3. **Competitor Analysis**: Multi-strategy competitor discovery and comparative analysis
4. **LinkedIn Integration**: Profile scraping with work pattern analysis
5. **Sanity CMS Integration**: Automatic data persistence and querying
6. **Research Tools**: Web search, site discovery, crawling, evidence extraction, brief generation
7. **Learning System**: Pattern matching and self-improvement (partially implemented)
8. **Account Orchestration**: Automatic complete research from single input

### Architecture
- **Main Router**: `src/index.js` (8,000+ lines - needs refactoring)
- **Services**: Business logic in `src/services/`
- **Handlers**: API endpoints in `src/handlers/`
- **Utils**: Shared utilities in `src/utils/`
- **Config**: Constants in `src/config/`

---

## Critical Improvements Required

### 🔴 CRITICAL PRIORITY

#### 1. Update OpenAPI Schema
**Problem**: New endpoints (`/research`, `/enrich/*`, `/competitors/*`) are missing from `openapi.yaml`, blocking ChatGPT integration.

**Action**:
```bash
# Add these endpoints to openapi.yaml:
- POST /research
- GET /research/intelligence
- POST /enrich/queue
- GET /enrich/status
- GET /enrich/research
- POST /enrich/execute
- GET /enrich/jobs
- POST /competitors/research
- GET /competitors/research
- GET /competitors/opportunities
```

**Files to Update**:
- `openapi.yaml` - Add all missing endpoint definitions with full request/response schemas

---

### 🟡 HIGH PRIORITY

#### 2. Refactor Monolithic index.js
**Problem**: `src/index.js` is 8,000+ lines, making it hard to maintain and test.

**Action**:
```bash
# Extract handlers to separate files:
src/handlers/
  ├── scan.js          # handleScan
  ├── batch.js         # handleBatchScan
  ├── extract.js       # handleExtract
  ├── search.js        # handleSearch
  ├── discover.js      # handleDiscover
  ├── crawl.js         # handleCrawl
  ├── brief.js         # handleBrief
  ├── verify.js        # handleVerify
  ├── linkedin.js      # handleLinkedInProfile
  ├── cache.js         # handleCacheStatus
  ├── store.js         # handleStore
  ├── query.js         # handleQuery
  ├── update.js        # handleUpdate
  ├── delete.js        # handleDelete
  └── health.js        # handleHealth, handleSchema
```

**Steps**:
1. Create handler files in `src/handlers/`
2. Move handler functions from `index.js` to respective files
3. Export handlers from each file
4. Import handlers in `index.js`
5. Update router to use imported handlers

**Files to Create/Update**:
- `src/handlers/scan.js` - Extract `handleScan` function
- `src/handlers/batch.js` - Extract `handleBatchScan` function
- `src/handlers/extract.js` - Extract `handleExtract` function
- `src/handlers/search.js` - Extract `handleSearch` function
- `src/handlers/discover.js` - Extract `handleDiscover` function
- `src/handlers/crawl.js` - Extract `handleCrawl` function
- `src/handlers/brief.js` - Extract `handleBrief` function
- `src/handlers/verify.js` - Extract `handleVerify` function
- `src/handlers/linkedin.js` - Extract `handleLinkedInProfile` function
- `src/handlers/cache.js` - Extract `handleCacheStatus` function
- `src/handlers/store.js` - Extract `handleStore` function
- `src/handlers/query.js` - Extract `handleQuery` function
- `src/handlers/update.js` - Extract `handleUpdate` function
- `src/handlers/delete.js` - Extract `handleDelete` function
- `src/handlers/health.js` - Extract `handleHealth`, `handleSchema` functions
- `src/index.js` - Update to import and use handlers

#### 3. Add Rate Limiting
**Problem**: No rate limiting, allowing potential abuse.

**Action**:
```javascript
// Create src/utils/rate-limit.js
export class RateLimiter {
  constructor(env) {
    this.kv = env.RATE_LIMIT_KV; // KV namespace for rate limiting
    this.limits = {
      '/scan': { requests: 100, window: 3600 }, // 100 per hour
      '/scan-batch': { requests: 10, window: 3600 }, // 10 per hour
      '/research': { requests: 50, window: 3600 }, // 50 per hour
      default: { requests: 200, window: 3600 }, // 200 per hour
    };
  }
  
  async checkLimit(ip, endpoint) {
    // Implementation using KV
  }
}
```

**Files to Create**:
- `src/utils/rate-limit.js` - Rate limiting utility
- Update `src/index.js` - Add rate limiting middleware

**Configuration**:
- Add KV namespace to `wrangler.toml`:
```toml
kv_namespaces = [
  { binding = "RATE_LIMIT_KV", id = "your-kv-namespace-id" }
]
```

#### 4. Integrate Learning System
**Problem**: Learning system exists but not integrated into orchestration flow.

**Action**:
```javascript
// Update src/services/account-orchestrator.js
import { extractQueryPatterns, generateSuggestions } from './learning-service.js';

// After account creation:
const patterns = extractQueryPatterns({
  input,
  inputType,
  accountKey,
  timestamp: new Date().toISOString(),
});

// Store patterns
await storeInteraction(groqQuery, upsertDocument, client, {
  accountKey,
  interactionType: 'research_initiated',
  patterns,
});

// Generate suggestions
const suggestions = await generateSuggestions(groqQuery, client, accountKey);
```

**Files to Update**:
- `src/services/account-orchestrator.js` - Integrate learning system
- `src/handlers/orchestrator.js` - Include learning in responses

---

### 🟢 MEDIUM PRIORITY

#### 5. Add Automated Tests
**Problem**: No automated tests, increasing risk of regressions.

**Action**:
```bash
# Create test structure:
tests/
  ├── unit/
  │   ├── utils/
  │   │   ├── validation.test.js
  │   │   ├── response.test.js
  │   │   └── text.test.js
  │   └── services/
  │       ├── account-orchestrator.test.js
  │       └── competitor-discovery.test.js
  ├── integration/
  │   ├── scan.test.js
  │   ├── enrichment.test.js
  │   └── competitors.test.js
  └── e2e/
      └── research-flow.test.js
```

**Files to Create**:
- `tests/unit/utils/validation.test.js`
- `tests/unit/utils/response.test.js`
- `tests/integration/scan.test.js`
- `tests/integration/enrichment.test.js`
- `package.json` - Add test scripts and dependencies

**Dependencies to Add**:
```json
{
  "devDependencies": {
    "vitest": "^1.0.0",
    "@cloudflare/workers-types": "^4.20241106.0"
  },
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration"
  }
}
```

#### 6. Add Retry Logic for External APIs
**Problem**: No retry logic for Sanity API or external fetches, causing failures under load.

**Action**:
```javascript
// Create src/utils/retry.js
export async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
  } = options;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      const delay = Math.min(
        initialDelay * Math.pow(backoffFactor, attempt),
        maxDelay
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

**Files to Create**:
- `src/utils/retry.js` - Retry utility with exponential backoff
- Update `src/sanity-client.js` - Use retry for all Sanity operations
- Update `src/utils/http.js` - Use retry for fetch operations

#### 7. Extract Analysis Functions to Services
**Problem**: Analysis functions (detectTechnologyStack, analyzeBusinessScale, etc.) are in `index.js`.

**Action**:
```bash
# Create service files:
src/services/
  ├── tech-detector.js      # detectTechnologyStack
  ├── business-analyzer.js   # analyzeBusinessScale, detectBusinessUnits
  ├── performance-analyzer.js # analyzePerformance
  ├── ai-readiness.js       # calculateAIReadinessScore
  └── job-analyzer.js       # analyzeJobPostings
```

**Files to Create**:
- `src/services/tech-detector.js` - Extract `detectTechnologyStack`
- `src/services/business-analyzer.js` - Extract business analysis functions
- `src/services/performance-analyzer.js` - Extract `analyzePerformance`
- `src/services/ai-readiness.js` - Extract `calculateAIReadinessScore`
- `src/services/job-analyzer.js` - Extract `analyzeJobPostings`
- `src/index.js` - Import and use services

#### 8. Add Monitoring and Observability
**Problem**: No metrics, logging, or error tracking.

**Action**:
```javascript
// Create src/utils/monitoring.js
export class Metrics {
  constructor(env) {
    this.analytics = env.ANALYTICS_ENDPOINT; // Optional analytics endpoint
  }
  
  async trackRequest(endpoint, duration, status) {
    // Track request metrics
  }
  
  async trackError(error, context) {
    // Track errors
  }
}
```

**Files to Create**:
- `src/utils/monitoring.js` - Metrics and logging utility
- Update `src/index.js` - Add monitoring middleware

**Optional Integrations**:
- Cloudflare Analytics
- Sentry for error tracking
- Custom analytics endpoint

#### 9. Complete TypeScript Migration
**Problem**: TypeScript types incomplete, using JSDoc comments.

**Action**:
```bash
# Convert to TypeScript:
src/
  ├── index.ts
  ├── services/
  │   └── *.ts
  ├── handlers/
  │   └── *.ts
  └── utils/
      └── *.ts
```

**Files to Update**:
- Convert all `.js` files to `.ts`
- Add proper TypeScript types
- Update `tsconfig.json` with strict settings
- Update `wrangler.toml` to use `.ts` entry point

#### 10. Add Input Validation Middleware
**Problem**: Validation scattered throughout handlers.

**Action**:
```javascript
// Create src/utils/validation-middleware.js
export function validateRequest(schema) {
  return async (request, handler) => {
    // Validate request against schema
    const body = await request.json();
    const validation = validateSchema(body, schema);
    if (!validation.valid) {
      return createErrorResponse('VALIDATION_ERROR', validation.errors);
    }
    return handler(request);
  };
}
```

**Files to Create**:
- `src/utils/validation-middleware.js` - Request validation middleware
- Update handlers to use validation middleware

---

### 🔵 LOW PRIORITY

#### 11. Add Caching Strategy
**Problem**: Caching exists but could be more aggressive.

**Action**:
- Increase cache TTL for stable data (tech stack, business info)
- Add cache warming for frequently accessed accounts
- Implement cache invalidation strategy

**Files to Update**:
- `src/utils/cache.js` - Enhance caching logic
- `src/config/constants.js` - Add cache TTL constants

#### 12. Add Request Batching
**Problem**: No batching for multiple requests.

**Action**:
```javascript
// Create src/utils/batch.js
export class RequestBatcher {
  constructor(batchSize = 10, batchDelay = 100) {
    // Batch requests together
  }
}
```

**Files to Create**:
- `src/utils/batch.js` - Request batching utility

#### 13. Add Webhook Support
**Action**:
```javascript
// Create src/utils/webhooks.js
export async function sendWebhook(url, payload) {
  // Send webhook notification
}
```

**Files to Create**:
- `src/utils/webhooks.js` - Webhook utility
- Update services to send webhooks on completion

#### 14. Add Documentation Generation
**Action**:
- Use JSDoc to generate API documentation
- Add Swagger UI for interactive API docs
- Generate TypeScript types from OpenAPI schema

**Files to Create**:
- `scripts/generate-docs.js` - Documentation generator
- `docs/api/` - Generated API documentation

#### 15. Add Health Check Endpoints
**Action**:
- Add `/health/detailed` with system status
- Add `/health/dependencies` to check Sanity, KV, etc.
- Add readiness and liveness probes

**Files to Update**:
- `src/handlers/health.js` - Add detailed health checks

---

## Implementation Order

### Phase 1: Critical (Week 1)
1. ✅ Update OpenAPI schema
2. ✅ Add rate limiting
3. ✅ Integrate learning system

### Phase 2: High Priority (Week 2-3)
4. ✅ Refactor index.js (extract handlers)
5. ✅ Extract analysis functions to services
6. ✅ Add retry logic

### Phase 3: Medium Priority (Week 4-5)
7. ✅ Add automated tests
8. ✅ Add monitoring
9. ✅ Add input validation middleware

### Phase 4: Low Priority (Ongoing)
10. ✅ Enhance caching
11. ✅ Add webhook support
12. ✅ Complete TypeScript migration
13. ✅ Add documentation generation

---

## Code Quality Improvements

### 1. Error Handling
**Current**: Good error handling, but could be more consistent.

**Improvements**:
- Standardize error codes
- Add error context to all errors
- Create error hierarchy

### 2. Code Organization
**Current**: Modular structure exists but `index.js` is too large.

**Improvements**:
- Complete handler extraction
- Extract all analysis functions
- Create service layer for business logic

### 3. Performance
**Current**: Good performance optimizations.

**Improvements**:
- Add request batching
- Optimize database queries
- Add response compression

### 4. Security
**Current**: Good security measures.

**Improvements**:
- Add rate limiting (HIGH PRIORITY)
- Add request signing
- Add IP whitelisting option

### 5. Testing
**Current**: No automated tests.

**Improvements**:
- Add unit tests for utilities
- Add integration tests for endpoints
- Add E2E tests for complete flows

---

## File Structure After Improvements

```
src/
├── index.ts                    # Main router (simplified)
├── config/
│   └── constants.ts
├── utils/
│   ├── headers.ts
│   ├── validation.ts
│   ├── http.ts
│   ├── response.ts
│   ├── cache.ts
│   ├── text.ts
│   ├── rate-limit.ts          # NEW
│   ├── retry.ts                # NEW
│   ├── monitoring.ts           # NEW
│   └── validation-middleware.ts # NEW
├── services/
│   ├── account-orchestrator.ts
│   ├── enrichment-service.ts
│   ├── research-pipeline.ts
│   ├── competitor-discovery.ts
│   ├── competitor-research.ts
│   ├── comparative-analysis.ts
│   ├── learning-service.ts
│   ├── learning-storage.ts
│   ├── sanity-account.ts
│   ├── sanity-storage.ts
│   ├── tech-detector.ts        # NEW (extracted)
│   ├── business-analyzer.ts     # NEW (extracted)
│   ├── performance-analyzer.ts  # NEW (extracted)
│   ├── ai-readiness.ts         # NEW (extracted)
│   └── job-analyzer.ts         # NEW (extracted)
├── handlers/
│   ├── scan.ts                 # NEW (extracted)
│   ├── batch.ts                # NEW (extracted)
│   ├── extract.ts              # NEW (extracted)
│   ├── search.ts               # NEW (extracted)
│   ├── discover.ts             # NEW (extracted)
│   ├── crawl.ts                # NEW (extracted)
│   ├── brief.ts                # NEW (extracted)
│   ├── verify.ts               # NEW (extracted)
│   ├── linkedin.ts             # NEW (extracted)
│   ├── cache.ts                # NEW (extracted)
│   ├── store.ts                # NEW (extracted)
│   ├── query.ts                # NEW (extracted)
│   ├── update.ts               # NEW (extracted)
│   ├── delete.ts               # NEW (extracted)
│   ├── health.ts               # NEW (extracted)
│   ├── orchestrator.ts         # EXISTS
│   ├── competitors.ts          # EXISTS
│   ├── enrichment.ts           # EXISTS
│   └── learning.ts             # EXISTS
└── types/
    └── index.ts                # TypeScript type definitions

tests/
├── unit/
│   ├── utils/
│   └── services/
├── integration/
└── e2e/
```

---

## Testing Strategy

### Unit Tests
- Test all utility functions
- Test service functions in isolation
- Mock external dependencies

### Integration Tests
- Test endpoint handlers
- Test service integrations
- Test Sanity operations

### E2E Tests
- Test complete research flows
- Test enrichment pipelines
- Test competitor research

---

## Deployment Checklist

Before deploying improvements:

- [ ] Update OpenAPI schema
- [ ] Add rate limiting
- [ ] Integrate learning system
- [ ] Extract handlers from index.js
- [ ] Add retry logic
- [ ] Add automated tests
- [ ] Update documentation
- [ ] Test all endpoints
- [ ] Verify Sanity integration
- [ ] Check error handling
- [ ] Verify CORS headers
- [ ] Test rate limiting
- [ ] Monitor performance

---

## Notes

- All improvements maintain backward compatibility
- Existing functionality is preserved
- New features are additive
- Breaking changes are documented
- Migration guides provided where needed

---

**Priority**: Start with CRITICAL items, then HIGH, then MEDIUM, then LOW.

**Estimated Time**: 
- Critical: 1 week
- High: 2-3 weeks
- Medium: 2-3 weeks
- Low: Ongoing

**Total**: ~6-8 weeks for complete improvement cycle

