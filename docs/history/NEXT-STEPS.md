# Next Steps - Deployment & Testing

## 🚀 Immediate Actions

### 1. Pre-Deployment Validation
```bash
# Validate OpenAPI schema
swagger-cli validate openapi.yaml
# Or use online: https://editor.swagger.io/

# Check syntax
node -c src/index.js
node -c src/handlers/smart-crawl.js

# Run linting
npm run lint 2>/dev/null || echo "No lint script configured"
```

### 2. Deploy to Cloudflare Workers
```bash
# Deploy to production
npx wrangler deploy

# Or deploy to preview
npx wrangler deploy --env preview
```

**After deployment, update OpenAPI server URL:**
- Update `servers[0].url` in `openapi.yaml` with your production URL
- Example: `https://your-worker.your-subdomain.workers.dev`

### 3. Test New Endpoints

#### Test Smart Crawl for Sanity.io
```bash
# Test distributed crawl
curl -X POST "https://your-worker.workers.dev/crawl/distributed" \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://sanity.io",
    "targetPages": ["/studio", "/docs", "/content-lake", "/canvas", "/api"],
    "maxPages": 5
  }' | jq '.'

# Test smart crawl with OSINT fallback
curl -X POST "https://your-worker.workers.dev/crawl/smart" \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://sanity.io",
    "autoDiscover": true,
    "useOsintFallback": true
  }' | jq '.'
```

#### Run Automated Tests
```bash
# Test smart crawl endpoints
./scripts/test-smart-crawl.sh https://your-worker.workers.dev

# Run comprehensive system tests
./scripts/run-complete-system-test.sh

# Run all tests including Playwright
./scripts/run-all-tests.sh
```

### 4. Update GPT Instructions (if needed)
- ✅ Already updated with new endpoints
- Verify character count is still under 8k
- Test ChatGPT Actions integration if using

### 5. Integration Testing

#### Test End-to-End Flow
1. **Large Site Crawl:**
   ```bash
   POST /crawl/distributed
   → Should handle Sanity.io gracefully
   → Should return partial results if some pages fail
   ```

2. **OSINT Fallback:**
   ```bash
   POST /crawl/smart
   → Should suggest OSINT if crawl fails
   → Should provide ready-to-use OSINT request
   ```

3. **One-Click Research Integration:**
   ```bash
   POST /research/complete
   → Should use smart crawl internally
   → Should fallback to OSINT gracefully
   ```

### 6. Monitor & Verify

#### Check Deployment Status
```bash
# View deployment logs
npx wrangler tail

# Check worker status
npx wrangler deployments list
```

#### Verify Endpoints
```bash
# Health check
curl https://your-worker.workers.dev/health

# Verify new endpoints exist
curl https://your-worker.workers.dev/crawl/distributed -X OPTIONS
curl https://your-worker.workers.dev/crawl/smart -X OPTIONS
```

### 7. Documentation Updates

#### Update README if needed
- Add examples for new endpoints
- Document smart crawl strategy
- Add troubleshooting for large sites

#### Update API Documentation
- OpenAPI spec is already updated ✅
- Consider generating Swagger UI
- Update any external API docs

### 8. Production Checklist

- [ ] Code deployed to production
- [ ] OpenAPI server URL updated
- [ ] New endpoints tested
- [ ] Smart crawl verified with Sanity.io
- [ ] OSINT fallback working
- [ ] No errors in worker logs
- [ ] Performance acceptable
- [ ] Documentation updated

### 9. Post-Deployment Tasks

#### Monitor Performance
- Watch for size limit errors
- Monitor crawl success rates
- Track OSINT fallback triggers

#### Gather Feedback
- Test with real large sites
- Collect performance metrics
- Document any edge cases

#### Iterate if Needed
- Adjust size limits if needed
- Fine-tune page prioritization
- Optimize OSINT suggestions

## 📋 Quick Reference

### New Endpoints
- `POST /crawl/distributed` - Distributed crawl for large sites
- `POST /crawl/smart` - Smart crawl with OSINT fallback
- `GET /query/quick` - Fast pre-built queries
- `POST /research/complete` - One-click complete research

### Key Files
- `src/handlers/smart-crawl.js` - Smart crawl implementation
- `src/services/osint-scan-suggestion.js` - OSINT suggestion service
- `openapi.yaml` - API documentation (32 operations)
- `SMART-CRAWL-SOLUTION.md` - Solution documentation

### Test Scripts
- `scripts/test-smart-crawl.sh` - Test smart crawl endpoints
- `scripts/run-complete-system-test.sh` - Full system test
- `scripts/run-all-tests.sh` - All tests including Playwright

## 🎯 Success Criteria

✅ **Deployment Complete:**
- All code deployed successfully
- No deployment errors
- Worker responding to requests

✅ **Functionality Verified:**
- Smart crawl handles large sites
- OSINT fallback triggers correctly
- Partial results returned gracefully

✅ **Integration Working:**
- One-click research uses smart crawl
- Enrichment pipeline still works
- No breaking changes to existing endpoints

---

**Ready to deploy!** 🚀

Start with step 1 (pre-deployment validation), then proceed through deployment and testing.
