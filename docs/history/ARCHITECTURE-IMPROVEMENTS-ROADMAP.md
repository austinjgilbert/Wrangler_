# Architecture Improvements Roadmap

**Status**: ✅ System is production-ready. These are optimization opportunities for future growth.

---

## 🔴 Critical (Before Adding More Endpoints)

### 1. OpenAPI Operation Limit Strategy

**Issue**: At 30/30 operations limit  
**Impact**: Cannot add new endpoints without removing existing ones

**Options:**
1. **Group Operations** (Recommended)
   - Merge related endpoints: `/analytics/*` → single operation with action param
   - Example: `POST /analytics { action: 'compare' | 'trends' | 'dashboard' | 'export' }`
   - Saves 3 operations (from 4 to 1)

2. **API Versioning**
   - Create `/v2/*` endpoints for new features
   - Keep `/v1/*` for backward compatibility
   - Split operations across versions

3. **Webhook/Async Pattern**
   - Move non-critical endpoints to webhook callbacks
   - Example: `/cache/status` → webhook callback

**Timeline**: Before next feature addition  
**Effort**: 2-4 hours

---

## 🟡 Medium Priority (Next Month)

### 2. Router Refactoring

**Current**: 400+ line `if/else` chain  
**Proposed**: Pattern-based router

**Implementation:**
```javascript
// Option A: Router library (itty-router)
import { Router } from 'itty-router';

const router = Router()
  .get('/health', handleHealth)
  .post('/person/brief', handlePersonBrief)
  // ...

// Option B: Route map pattern
const routes = {
  'GET /health': handleHealth,
  'POST /person/brief': handlePersonBrief,
  // ...
};

function routeRequest(request, url, ...) {
  const key = `${request.method} ${url.pathname}`;
  const handler = routes[key] || routes['*'];
  return handler(request, ...);
}
```

**Benefits:**
- Easier to maintain
- Better performance (O(1) lookup vs O(n) if/else)
- Less error-prone

**Timeline**: Next month  
**Effort**: 4-8 hours

---

### 3. Dependency Injection Refactoring

**Current**: Large `internalFunctions` objects passed manually  
**Proposed**: ServiceContext factory

**Implementation:**
```javascript
// src/services/service-context.js
export class ServiceContext {
  constructor(env, requestId) {
    this.env = env;
    this.requestId = requestId;
    this.groqQuery = groqQuery;
    // ... lazy load services
  }
  
  getSearchProvider() { /* ... */ }
  getScoringFunctions() { /* ... */ }
  // ...
}

// Usage in handlers:
export async function handlePersonBrief(request, context) {
  const searchProvider = context.getSearchProvider();
  // ...
}
```

**Benefits:**
- Cleaner handler signatures
- Better testability
- Easier to mock

**Timeline**: Next month  
**Effort**: 6-12 hours

---

## 🟢 Low Priority (Technical Debt)

### 4. Extract Remaining Handlers

**Current**: Some handlers inline in `index.js`  
**Goal**: All handlers in `src/handlers/`

**Handlers to Extract:**
- `handleScan`
- `handleSearch`
- `handleExtract`
- `handleDiscover`
- `handleCrawl`
- `handleBrief`
- `handleVerify`
- `handleLinkedInProfile`
- `handleStore`
- `handleQuery`
- `handleUpdate`
- `handleDelete`
- `handleHealth`
- `handleCacheStatus`
- `handleBatchScan`

**Timeline**: Incremental (1-2 handlers per sprint)  
**Effort**: 2-4 hours per handler

---

### 5. Remove Duplicate Utilities

**Current**: Response utilities duplicated in `index.js` and `utils/response.js`  
**Fix**: Remove from `index.js`, import from `utils/response.js`

**Timeline**: Next cleanup sprint  
**Effort**: 1 hour

---

## 📊 Priority Matrix

| Task | Priority | Effort | Impact | Timeline |
|------|----------|--------|--------|----------|
| OpenAPI Strategy | 🔴 Critical | 2-4h | High | Before next feature |
| Router Refactor | 🟡 Medium | 4-8h | Medium | Next month |
| Dependency Injection | 🟡 Medium | 6-12h | Medium | Next month |
| Extract Handlers | 🟢 Low | 2-4h each | Low | Incremental |
| Remove Duplicates | 🟢 Low | 1h | Low | Next cleanup |

---

## ✅ Success Criteria

- [ ] OpenAPI operation limit strategy documented
- [ ] Router refactored (if/else → pattern matching)
- [ ] ServiceContext factory implemented
- [ ] All handlers extracted to separate files
- [ ] No duplicate utility functions
- [ ] All improvements tested

---

**Note**: System is production-ready as-is. These improvements optimize for maintainability and future growth.

