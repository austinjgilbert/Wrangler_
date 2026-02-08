# Repo Map - Person Intelligence Mode Implementation

## Entry Point & Routing

- **Entrypoint**: `src/index.js` line 8282 - `export default { async fetch(request, env, ctx) }`
- **Routing**: Custom `routeRequest()` function (line 8414) using if/else chains
- **Response Format**: `createSuccessResponse(data, requestId)` / `createErrorResponse(code, message, details, status, requestId)` from `src/utils/response.js`

## Existing Endpoints (DO NOT MODIFY)

All handlers are inline in `src/index.js`:
- `handleScan()` - line 6377 - GET `/scan`
- `handleSearch()` - line 3779 - POST `/search`  
- `handleExtract()` - line 4056 - POST `/extract`
- `handleVerify()` - line 4351 - POST `/verify`
- `handleDiscover()` - line 3858 - POST `/discover`
- `handleCrawl()` - line 3933 - POST `/crawl`
- `handleBrief()` - line 4663 - POST `/brief`
- `handleStore()` - line 7779 - POST `/store/{type}` - whitelist: ['scan', 'linkedin', 'evidence', 'brief']

## Internal Functions (CAN BE CALLED DIRECTLY)

Located in `src/index.js`:
- `discoverPages(baseUrl, budget)` - line 3499 - Returns `[{url, type, reason}]`
- `crawlWithConcurrency(urls, concurrency, fn, timeoutMs)` - line 3653
- `searchProvider(query, limit)` - Mock implementation, returns search results
- Extract utilities: `cleanMainText()`, `extractExcerpts()`, `detectSignals()`, `extractTitle()`, etc.

## Services & Modules

- `src/sanity-client.js`:
  - `groqQuery(client, query, params)` 
  - `upsertDocument(client, doc)`
  - `patchDocument(client, docId, patch)`
  - `assertSanityConfigured(env)`
  - `generateAccountKey(canonicalUrl)`

- `src/services/enhanced-storage-service.js`:
  - `storePersonWithRelationships()` - Already exists!
  - `generatePersonKey()` - Already exists!

- Scoring services:
  - `src/services/ai-readiness.js` - `calculateAIReadinessScore()`
  - `src/services/business-analyzer.js` - `analyzeBusinessScale()`, `detectBusinessUnits()`
  - `src/services/performance-analyzer.js` - `analyzePerformance()`
  - `src/services/tech-detector.js` - `detectTechnologyStack()`

## New Code Locations

### 1. Handler (NEW)
- **Location**: `src/handlers/person-intelligence.js` (NEW FILE)
- **Function**: `handlePersonBrief(request, requestId, env, ...)`
- **Why**: Keep modular, follows pattern of other handlers in `/handlers` directory

### 2. Orchestration Service (NEW)
- **Location**: `src/services/person-intelligence-service.js` (NEW FILE)
- **Function**: `generatePersonBriefInternal(params, context)` - Internal orchestrator
- **Why**: Separates orchestration logic from HTTP handler

### 3. Internal Function Wrappers
- **Location**: Inline in `person-intelligence-service.js`
- **Functions**: Internal versions that take direct params instead of Request objects
- **Why**: Avoid HTTP overhead when calling internally

### 4. Route Addition
- **Location**: `src/index.js` - `routeRequest()` function, add new `/person/brief` route
- **Line**: ~8714 (after webhooks, before final else)
- **Why**: Standard routing location

### 5. Store Type Addition
- **Location**: `src/index.js` - `handleStore()` function, line 7799
- **Change**: Add 'person' to whitelist: `['scan', 'linkedin', 'evidence', 'brief', 'person']`
- **Why**: Allow storing person documents

### 6. OpenAPI Schema
- **Location**: `openapi.yaml`
- **Add**: `/person/brief` path, `PersonBriefRequest`, `PersonBriefResponse` schemas
- **Why**: API documentation

## Risk Areas

1. **Tight Coupling**: Handlers currently take `Request` objects. Internal calls should use direct params to avoid overhead.
2. **Response Format**: Must use `createSuccessResponse()` / `createErrorResponse()` consistently.
3. **Store Type Whitelist**: Must add 'person' to handleStore whitelist.
4. **Sanity Schema**: Person schema already exists in `schemas/person.js` - verify it matches needs.
5. **Bounded Responses**: All responses must be bounded per requirements (max array lengths, char limits).

## Implementation Strategy

1. Create internal orchestration service that calls functions directly (not via HTTP)
2. Create handler that wraps orchestration and handles HTTP concerns
3. Add route to routeRequest()
4. Update handleStore to accept 'person' type
5. Add OpenAPI schema
6. Add tests

## File Dependencies

- `src/index.js` - Handlers, routing, internal functions
- `src/utils/response.js` - Response utilities
- `src/sanity-client.js` - Sanity operations
- `src/services/enhanced-storage-service.js` - Person storage (already exists!)
- `src/services/*.js` - Scoring and analysis services
- `openapi.yaml` - API schema

---

**Next Steps**: Proceed with Phase 1 implementation.

