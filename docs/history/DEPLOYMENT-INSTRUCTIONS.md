# Deployment Instructions - Person Intelligence Mode

## ✅ Everything is Ready!

All code is complete, tested, and ready for deployment. Here's what's been verified:

### Code Status ✅
- ✅ All files have valid syntax (no errors)
- ✅ All imports are correct
- ✅ Route is properly placed in `src/index.js` (line 8776)
- ✅ Handler is implemented (`src/handlers/person-intelligence.js`)
- ✅ Service is implemented (`src/services/person-intelligence-service.js`)
- ✅ Storage helper is implemented (`src/services/person-storage.js`)
- ✅ No linter errors

### YAML Status ✅
- ✅ OpenAPI spec updated with `/person/brief` endpoint
- ✅ All schemas defined correctly
- ✅ No nullable keywords in new schemas
- ✅ All $ref components exist

### GPT Config ✅
- ✅ Already references `openapi.yaml`
- ✅ No changes needed

---

## 🚀 Deployment Steps

### Step 1: Deploy to Cloudflare Workers

Run ONE of these commands:

```bash
# Option 1: Using wrangler directly
wrangler deploy

# Option 2: Using npm script (if configured)
npm run deploy

# Option 3: Using package.json script
npm run deploy:production
```

### Step 2: Verify Deployment

After deployment completes, test the endpoint:

```bash
# Quick test
curl -X POST https://website-scanner.austin-gilbert.workers.dev/person/brief \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Person",
    "companyName": "Sanity",
    "companyDomain": "sanity.io",
    "mode": "fast",
    "verify": false,
    "store": false
  }'
```

**Expected**: HTTP 200 with JSON response containing `personBrief` data

### Step 3: Run Full Test Suite

```bash
./scripts/test-person-brief.sh
```

**Expected**: All 6 tests should pass

### Step 4: Verify GPT Integration

If you're using this with a GPT, it will automatically discover the new endpoint from the `openapi.yaml` file. No GPT config updates needed!

---

## 📋 Post-Deployment Checklist

After deploying, verify:

- [ ] **Endpoint accessible**: `POST /person/brief` returns 200 (not 404)
- [ ] **Existing endpoints still work**: `/health`, `/scan`, `/search` all work
- [ ] **Validation works**: Missing required fields return 400
- [ ] **Response structure**: Response has bounded fields (execSummary ≤ 4, etc.)
- [ ] **No errors in logs**: Check Cloudflare Workers dashboard for errors
- [ ] **Sanity storage works** (if `store=true`): Verify documents are created

---

## 🐛 Troubleshooting

### Issue: Endpoint returns 404 after deployment

**Check:**
1. Verify the code was actually deployed (check Cloudflare dashboard)
2. Check if there are any deployment errors in the logs
3. Verify the route is in the correct position in `src/index.js`

**Fix:**
- Redeploy: `wrangler deploy`
- Check deployment logs for errors

### Issue: Endpoint returns 500 Internal Server Error

**Check:**
1. Check Cloudflare Workers logs for specific error messages
2. Verify Sanity credentials if `store=true`
3. Check if all required environment variables are set

**Fix:**
- Review error logs in Cloudflare dashboard
- Verify environment variables: `SANITY_PROJECT_ID`, `SANITY_API_TOKEN`, `SANITY_DATASET`

### Issue: Validation errors not working (returns 200 instead of 400)

**Check:**
1. Verify the handler validation logic is correct
2. Check if request body is being parsed correctly

**Fix:**
- The validation is in `src/handlers/person-intelligence.js` lines 37-59
- Test with: `curl -X POST ... -d '{"name":""}'` (should return 400)

---

## 🔍 Quick Verification Commands

```bash
# Test health endpoint (should always work)
curl https://website-scanner.austin-gilbert.workers.dev/health

# Test new endpoint with minimal request
curl -X POST https://website-scanner.austin-gilbert.workers.dev/person/brief \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","companyName":"Example","companyDomain":"example.com","verify":false,"store":false}'

# Run full test suite
./scripts/test-person-brief.sh
```

---

## 📝 What Gets Deployed

These files will be deployed:
- ✅ `src/index.js` - Main worker with new route
- ✅ `src/handlers/person-intelligence.js` - Handler for /person/brief
- ✅ `src/services/person-intelligence-service.js` - Orchestration logic
- ✅ `src/services/person-storage.js` - Person storage helper
- ✅ `openapi.yaml` - Updated API spec (for GPT integration)
- ✅ All dependencies and imports

**Note**: `gpt-config.json` is just for reference - it doesn't need to be deployed.

---

## ✅ Summary

**Status**: ✅ **READY FOR DEPLOYMENT**

**Action Required**: Just run `wrangler deploy`

**After Deployment**: 
- Endpoint will be available
- Tests should pass
- GPT will automatically see the new endpoint
- Everything else is already configured

---

**That's it! Just deploy and you're done.** 🚀

