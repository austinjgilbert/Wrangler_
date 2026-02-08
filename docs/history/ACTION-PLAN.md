# Action Plan: Next Steps

## 🎯 Priority 1: Update GPT Instructions

The `gpt-instructions.md` file currently only mentions:
- `scanHomepage` (GET /scan)
- `scanBatchAccounts` (GET /scan-batch)

**Need to add:**
- `extractEvidence` (POST /extract) - For structured data extraction
- `searchWeb` (POST /search) - For web search with ranking
- `discoverPages` (POST /discover) - For finding likely pages
- `crawlPages` (POST /crawl) - For crawling discovered pages
- `verifyClaims` (POST /verify) - For multi-source verification
- `generateBrief` (POST /brief) - For generating research briefs

## 🎯 Priority 2: Update OpenAPI Schema

The `openapi.yaml` file needs all new endpoints added for ChatGPT Actions integration.

**Missing endpoints:**
- POST /extract
- POST /search
- POST /discover
- POST /crawl
- POST /brief
- POST /verify
- GET /cache/status
- GET /schema (optional but useful)

## 🎯 Priority 3: Deploy and Test

1. Deploy to production: `wrangler deploy`
2. Test all endpoints
3. Update OpenAPI with production URL
4. Test ChatGPT Actions integration

## 📋 Quick Checklist

- [ ] Update `gpt-instructions.md` with new endpoints
- [ ] Update `openapi.yaml` with all new endpoints
- [ ] Deploy: `wrangler deploy`
- [ ] Test all endpoints in production
- [ ] Update OpenAPI server URL
- [ ] Test ChatGPT Actions integration
- [ ] (Optional) Enable KV caching
- [ ] (Optional) Connect real search provider

## 🔄 Recommended Workflow

1. **First**: Update GPT instructions (so GPT knows about new capabilities)
2. **Second**: Update OpenAPI schema (so ChatGPT Actions can use them)
3. **Third**: Deploy and test
4. **Fourth**: Optional enhancements (KV, search provider)

---

**Current Status**: ✅ Implementation complete, documentation needs updates

