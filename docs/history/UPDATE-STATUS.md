# Update Status & What Needs Updating

## ✅ Already Updated

### GPT Instructions (`gpt-instructions.md`)
- ✅ All endpoints documented:
  - `scanHomepage` (GET /scan)
  - `scanBatchAccounts` (GET /scan-batch)
  - `scanLinkedInProfile` (POST /linkedin-profile)
  - `extractEvidence` (POST /extract)
  - `searchWeb` (POST /search)
  - `discoverPages` (POST /discover)
  - `crawlPages` (POST /crawl)
  - `verifyClaims` (POST /verify)
  - `generateBrief` (POST /brief)
- ✅ LinkedIn analytics documented
- ✅ Usage examples included

## ❌ Still Needs Updating

### OpenAPI Schema (`openapi.yaml`)

**Currently has (4 endpoints):**
- ✅ GET /health
- ✅ GET /scan
- ✅ GET /scan-batch
- ✅ POST /linkedin-profile

**Missing (8 endpoints):**
- ❌ POST /extract - Evidence pack extraction
- ❌ POST /search - Web search with ranking
- ❌ POST /discover - Page discovery
- ❌ POST /crawl - Smart crawling
- ❌ POST /brief - Brief generation
- ❌ POST /verify - Multi-source verification
- ❌ GET /cache/status - Cache status
- ❌ GET /schema - Self-documentation

## 🎯 Priority Actions

### 1. Add Missing Endpoints to OpenAPI (HIGH PRIORITY)
**Why**: Required for ChatGPT Actions to use these endpoints
**Time**: 2-3 hours
**Action**: Add all 8 missing endpoints to `openapi.yaml`

### 2. Deploy to Production (HIGH PRIORITY)
**Why**: Make endpoints available
**Time**: 10 minutes
**Action**: Run `./deploy.sh` or `wrangler deploy`

### 3. Update OpenAPI Server URL (HIGH PRIORITY)
**Why**: Point to production URL
**Time**: 1 minute
**Action**: Update `servers[0].url` in `openapi.yaml` after deployment

### 4. Test All Endpoints (MEDIUM PRIORITY)
**Why**: Verify everything works
**Time**: 30 minutes
**Action**: Run `./test-comprehensive.sh https://YOUR-WORKER.workers.dev`

## 📋 Quick Checklist

- [x] GPT instructions updated
- [x] LinkedIn endpoint in OpenAPI
- [ ] Add POST /extract to OpenAPI
- [ ] Add POST /search to OpenAPI
- [ ] Add POST /discover to OpenAPI
- [ ] Add POST /crawl to OpenAPI
- [ ] Add POST /brief to OpenAPI
- [ ] Add POST /verify to OpenAPI
- [ ] Add GET /cache/status to OpenAPI
- [ ] Add GET /schema to OpenAPI
- [ ] Deploy to production
- [ ] Update OpenAPI server URL
- [ ] Test all endpoints
- [ ] Update ChatGPT Actions with new OpenAPI

## 🚀 Next Steps

1. **Add missing endpoints to OpenAPI** (most important)
2. **Deploy**: `./deploy.sh`
3. **Update server URL** in OpenAPI
4. **Test**: Run test suites
5. **Integrate**: Update ChatGPT Actions

---

**Status**: GPT instructions ✅ | OpenAPI schema ⚠️ (4/12 endpoints)

